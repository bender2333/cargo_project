# 2026-08-25 装柜算法调研：0824 多 SKU 单柜场景

## 结论摘要

0824 的“紧凑性改善但件数从 506 降到 504”**有算法原因**，但不能据此断言 504 是物理上不可避免的最优结果。当前程序是一个快速的构造式启发式：它在每一步选择一个块放入一个 EMS，然后永久提交并切分空间。这个过程没有对多个后继布局做全局比较，因此一个局部较紧凑的块可能减少后续可装件数。

对本项目，建议保留现有 EMS/块引擎作为快速基线，改造为一个**受限宽度的候选状态搜索**：

1. 目标使用词典序：最终 `placedCount` 最大；在件数相同的可行方案中，最小化 `internal_notch` 和货物之间的长槽；最后再比较碎片、作业顺序和标签方向。
2. 候选统一为 `(EMS, block, point)`，不能继续“先找到第一个 EMS，再在该 EMS 内比较”。
3. 每个候选必须调用与真实提交一致的可行性边界（尺寸、重叠、支撑、堆叠、`groundOnly`、重量），剩余空间估计不能只看尺寸。
4. 先做 beam/tree search 的小宽度版本（例如宽度 8--16、深度 2--4 个块决策），超过预算则回退当前贪心，并记录诊断；随后再评估 LNS/GRASP 作为后台优化。
5. CP-SAT/MIP、列生成和完整精确分支定界适合作为离线验证或缩减模型的上界工具，不适合直接替换浏览器内的默认求解器。

这份调研不修改生产代码，也不把“外部开口余量”误报为“内部封闭空腔”。

## 当前装载场景

### 现场数据

`test-data/json/0824/input.json` 的输入为：

| 项目 | 数值 |
|---|---:|
| 容器 | 20GP，5758 x 2352 x 2385 mm |
| SKU 数 | 24 |
| 计划件数 | 2544 |
| 货物总重量 | 24229.51 kg，约为载荷上限的 85.9% |
| `stackable` / `groundOnly` | 24/24 可堆叠；0 件必须落地 |
| `maxStackLayers` | 全部未设置 |
| `canRotate` | 全部允许六种正交朝向（尺寸对称时会去重） |
| 主要重复尺寸 | 530x305x310、530x305x360、580x365x435、600x400x385 等 |

计划货物体积约为容器体积的 6.38 倍，所以不可能把 2544 件全部装入；数量目标必须是“在几何和业务约束下最大化已装件数”，而不是简单追求体积百分比。当前实现复算 0824 得到 504 件（此前版本为 506 件）；该差异说明启发式决策发生了布局级回退，不是重量约束强制产生的结果。

### 当前代码的算法边界

- `src/lib/emsSpace.ts:26-65` 的 `splitEMS` 用六个轴向残余长方体并做去重/包含裁剪。这是常见的 maximal-space 表示，但残余空间是非互斥的近似候选集合，质量依赖于分割、裁剪和落点规则。
- `src/lib/blocks.ts:33-87` 为每个朝向生成最大块，随后只保留一个有限的候选前沿（最大块以及减少一行/列/层的少数形状）。它不会枚举所有合法块组合。
- `src/lib/packing.ts:1190-1224` 先按 `(x,z,y)` 排序 EMS，遇到第一个可行 EMS 后立即返回；因此当前搜索不是跨 EMS 的联合选择。
- `src/lib/packingLookahead.ts:45-95` 的剩余质量估计调用 `bestBlocksForSpace`，主要按尺寸估计下一步件数、死空间和窄条，并没有完整重跑 `canPlace` 的支撑/堆叠/重量语义。
- `src/lib/packingLookahead.ts:118-170` 在 quantity 模式以当前块件数为主，只在接近窗口内使用剩余质量；这能控制计算量，但不等价于最终布局件数的上界。
- `canStageBlock` 会在提交前逐箱校验真实支撑和堆叠约束，因此“评分模型”和“提交模型”目前存在两个世界：评分可能认为候选有价值，提交阶段却拒绝或改变后继空间。

因此，当前算法的正确定位是：**受约束的 maximal-space/block constructive heuristic**，不是全局优化器，也不能给出最优性证明。

## 文献和官方资料

下列来源优先选用出版社页面、DOI 元数据或维护方官方文档。算法特征只按来源所描述的模型/算法范围使用，不把其他问题的结果外推为本项目的保证。

| 来源 | 直接链接 | 对本项目的启示 |
|---|---|---|
| Martello, Pisinger, Vigo (2000), *The Three-Dimensional Bin Packing Problem* | [INFORMS DOI 10.1287/opre.48.2.256.12386](https://doi.org/10.1287/opre.48.2.256.12386) | 证明三维箱装载的精确求解困难，并给出单箱填充的 branch-and-bound；适合做小规模/聚合模型的最优性基准，不适合直接处理 2544 个独立箱。 |
| Crainic, Perboli, Tadei (2008), *Extreme Point-Based Heuristics for Three-Dimensional Bin Packing* | [INFORMS DOI 10.1287/ijoc.1070.0250](https://doi.org/10.1287/ijoc.1070.0250) | 极值点规则让放置点来自已放箱体边界，并可承载额外位置约束；适合扩展当前 EMS 原点候选，减少“只在 EMS 起点放置”的偏差。 |
| Parreño et al. (2008), *A Maximal-Space Algorithm for the Container Loading Problem* | [INFORMS DOI 10.1287/ijoc.1070.0254](https://doi.org/10.1287/ijoc.1070.0254) | GRASP + block heuristic + maximal-space 的直接先例；论文明确使用非互斥自由空间表示，并通过随机化/自适应搜索超越单纯贪心。它与本项目的 EMS/块架构最接近。 |
| Faroe, Pisinger, Zachariasen (2003), *Guided Local Search for the Three-Dimensional Bin-Packing Problem* | [INFORMS DOI 10.1287/ijoc.15.3.267.16080](https://doi.org/10.1287/ijoc.15.3.267.16080) | 用贪心解作初始上界，再在时间限制内进行局部搜索；支持“默认快速结果 + 有预算的改进”产品形态，但论文实例规模远小于 2544 件，不能直接套用耗时。 |
| Pisinger (2002), *Heuristics for the Container Loading Problem* | [Elsevier DOI 10.1016/S0377-2217(02)00132-7](https://doi.org/10.1016/S0377-2217(02)00132-7) | 容器装载启发式的直接参考；支持把装载顺序、空间分解和多目标评分作为启发式组件组合，而不是期待单一 best-fit 规则解决全部场景。 |
| Egeblad, Pisinger (2009), *Heuristic Approaches for the Two- and Three-Dimensional Knapsack Packing Problem* | [Elsevier DOI 10.1016/j.cor.2007.12.004](https://doi.org/10.1016/j.cor.2007.12.004) | 与本项目“单容器、有限库存、最大化装入价值/数量”更接近；提醒需要把物品选择和空间布局共同评分，不能只优化当前块。 |
| Ren et al. (2011), *A Tree Search Method for the Container Loading Problem with Shipment Priority* | [Elsevier DOI 10.1016/j.ejor.2011.04.025](https://doi.org/10.1016/j.ejor.2011.04.025) | 树搜索可以把 shipment priority 与空间选择放进同一搜索框架；本项目可采用有限深度/有限宽度版本，把数量词典序作为显式上界。 |
| Wang et al. (2008), *A Heuristic for the Container Loading Problem: A Tertiary-Tree-Based Dynamic Space Decomposition Approach* | [Elsevier DOI 10.1016/j.ejor.2007.08.017](https://doi.org/10.1016/j.ejor.2007.08.017) | 动态空间分解的另一种树形表示；可作为 EMS 状态树和碎片合并策略的比较来源，但迁移时仍须保留支撑图语义。 |
| Puchinger et al. (2007), *Models and Algorithms for Three-Stage Two-Dimensional Bin Packing* | [Elsevier DOI 10.1016/j.ejor.2005.11.064](https://doi.org/10.1016/j.ejor.2005.11.064) | 2D 分层/三阶段模式对规则托盘很有效；本项目有六朝向、混合高度和部分支撑，不宜把 2D 层模型当作唯一求解器，可作为受限子问题或装载波次优化。 |
| Bortfeldt, Wäscher (2013), *Constraints in Container Loading – A State-of-the-Art Review* | [Elsevier DOI 10.1016/j.ejor.2012.12.006](https://doi.org/10.1016/j.ejor.2012.12.006) | 综述把几何、稳定性、重量、顺序和实际作业约束区分开；本项目的 `groundOnly`、支撑比、堆叠层数和 loading waves 应继续保持为独立约束，而不是混进一个体积分数。 |
| Parreño et al. (2010), *A Hybrid GRASP/VND Algorithm for Two- and Three-Dimensional Bin Packing* | [Springer DOI 10.1007/s10479-008-0449-4](https://doi.org/10.1007/s10479-008-0449-4) | GRASP + variable neighborhood descent 适合作为后台“改善当前解”实验方向；不建议首轮放入同步浏览器路径。 |
| Westerlund et al. (2007), *A MILP Model for N-Dimensional Allocation* | [Elsevier DOI 10.1016/j.compchemeng.2007.02.006](https://doi.org/10.1016/j.compchemeng.2007.02.006) | 说明坐标、方向、非重叠可写进 MILP，但候选对数量随箱数迅速膨胀；适合小批/聚合验证，不适合直接建 2544 箱的浏览器模型。 |
| Alves, Valério de Carvalho (2007), *Accelerating Column Generation for Variable Sized Bin-Packing Problems* | [Elsevier DOI 10.1016/j.ejor.2005.07.033](https://doi.org/10.1016/j.ejor.2005.07.033) | 列生成适合“模式数量很多、主问题选择模式”的场景；本项目若未来按几何类别生成整层/整块 pattern，可离线使用，但定价子问题仍需处理支撑与三维空间。 |
| Google OR-Tools, *CP-SAT Solver* | [官方 CP-SAT 指南](https://developers.google.com/optimization/cp/cp_solver)；[CP-SAT 建模](https://developers.google.com/optimization/cp/cp_model) | CP-SAT 以整数变量/约束为核心；本项目尺寸本来就是整数 mm，适合把缩减后的候选坐标和块模式送到后端，在超时后保留当前启发式结果。 |

## 方案比较

### A. 继续扩大当前 EMS + block greedy

**做法**：增加 block 前沿、改进 waste/碎片评分、让候选跨所有 EMS 排序。

**优点**：改动小；保留现有 `PackingResult`、标签、支撑和 3D 流程；浏览器内延迟可控。

**缺点**：仍是单路径构造；只要某一步提交后无法回退，局部误选仍会把后续件数锁死。仅改权重或增加 lookahead 深度不能提供最终件数保证。

**判断**：必要的第一步，但不能作为最终架构答案。

### B. 有限宽度 beam/tree search（推荐主线）

**做法**：每轮收集跨 EMS、跨 SKU、跨朝向的前沿 `(EMS, block, point)`；保留按词典序目标排序的前 `K` 个状态。每个状态包含剩余数量、EMS、必要的支撑摘要和累计指标；扩展 2--4 层后提交第一步，或在小窗口内完成一次短搜索。

**适配性**：0824 有大量重复尺寸和无限堆叠 SKU，块引擎已将 2544 个单箱压缩成有限块决策，适合小宽度搜索；相同几何尺寸的 SKU 可以在候选排序中分组，但不能合并标签库存而丢失数量统计。

**关键要求**：

- 候选必须跨 EMS，而不是保留第一个 EMS 的局部前沿；
- `canPlace`/`canStageBlock` 是硬约束；
- 对剩余件数使用可行上界（至少是每个剩余 EMS 的真实可放块上界之和），用于剪枝；
- 评价顺序固定为 `upperBoundPlacedCount`、当前件数、`internal_notch`、窄条/碎片、作业顺序；
- 每个计算有时间/节点预算，预算耗尽时返回当前最好完整解并记录 `searchBudgetExceeded`。

**风险**：复制 EMS 和支撑状态的成本；宽度太大可能使 20GP 在交互路径变慢。先做深度 2、宽度 8 的实验，不直接扩大到全树。

### C. GRASP / LNS / Guided Local Search（推荐作为第二阶段）

**做法**：先用当前快速引擎得到可行解；随机化若干块顺序或拆除一段空间中的块，随后用相同硬约束重新填充；保留件数不下降的改进，或在件数相同的情况下接受更紧凑方案。

**优点**：不需要为整个搜索树复制所有状态；对“504 与 506 两件差异来自早期布局”这类问题，重排局部块有机会恢复件数。

**缺点**：结果有随机性，需要固定 seed、运行次数和时间预算；同步 UI 中不宜每次等待长时间；如果没有合法的邻域定义，可能只是反复重跑同一贪心。

**适合位置**：提供“优化装载”后台任务或离线 benchmark；默认自动装箱先返回 beam/greedy 结果。

### D. CP-SAT / MILP 精确或混合求解

**可行建模范围**：为几何类别、朝向、候选坐标或块 pattern 建整数变量；用非重叠 disjunction、数量、重量、支撑近似和目标约束最大化件数。

**不适合直接建模的部分**：2544 个单箱的任意连续坐标会产生大量候选位置和二元非重叠关系；支撑图和可装卸顺序也不是简单的体积约束。CP-SAT/MILP 的整数模型需要后端执行、超时回退和结果校验，不能依赖浏览器包体。

**推荐用途**：

- 对 0824 抽取 2--5 个几何类别、每类少量库存的缩减实例，验证 beam 结果距离最优多少；
- 解“一个 EMS 内的块组合”或“固定底层 pattern 的 SKU 分配”子问题；
- 生成离线上界/回归合同，而不是替换默认引擎。

### E. 2D layer / skyline / heightmap

**2D layer**：把高度划成规则层，层内解二维矩形排样。对同高度、同支撑规则的整齐纸箱很快，但 0824 同时有 210--510 mm 高度、六朝向和混合层，强制层化会牺牲可装件数或引入大量层组合。

**skyline/heightmap**：适合作为候选点索引或快速下界，但单一高度图无法表达内部空腔、部分支撑、向上骑手和非单调 EMS。不能替代当前 3D EMS + 支撑图；可以作为极值点/EMS 候选生成的加速数据结构。

### F. Column generation / pattern generation

适合库存大、尺寸类别少、可以枚举“整层/整块 pattern”的场景。0824 的重复尺寸使 pattern 有潜力，但 24 个 SKU 的标签区分、混合高度和支撑约束会让定价子问题接近原始三维装箱问题。应在 beam 验证后，把已验证的块/层作为 pattern 做离线主问题，不建议当前阶段引入完整列生成框架。

## 推荐架构

### 目标合同

quantity 模式必须明确定义为：

```text
maximize placedCount
then minimize internal_notch volume / longest inter-cargo run
then minimize unusable narrow/dead EMS volume
then prefer stable loading order and deterministic tie-breaks
```

`external_residual` 是可合法存在的剩余空间，不应与 `internal_notch` 合并为一个硬指标。若产品要求“连门端/侧壁的外部开口槽也完全消除”，必须单独确认可接受的件数与耗时回退。

### 状态与候选

建议新增纯算法层（名称可按现有风格调整），不要在 UI 组件中实现：

```text
PackingSearchState
  remaining cargo counts by SKU
  EMS list
  placed/support summary needed by canPlace
  placedCount and compactness metrics

PlacementCandidate
  state id
  cargo id
  EMS id / point
  orientation
  block dimensions and count
  feasibility result
  child EMS quality / upper bound
```

搜索器只负责扩展候选和排序；真实箱体写入、标签统计、分层和导出仍由现有 `PackingResult` 归一化流程负责。这样可以避免 lookahead 自己维护一套与 `canPlace` 不同的规则。

### 受限搜索参数的首轮实验

| 参数 | 首轮值 | 失败时的处理 |
|---|---:|---|
| beam width | 8 | 降至 4；不能静默关闭数量目标 |
| search depth | 2 个块提交决策 | 保留当前贪心作为回退 |
| 每状态候选 | 每个 EMS/几何类别最多 2 个块、2 个落点 | 先跨 EMS 截断，不只截断同一 EMS |
| 时间预算 | 20GP quantity 交互目标内的固定毫秒预算 | 返回最好完整解并记录诊断 |
| 随机性 | 默认确定性；LNS/GRASP 另用固定 seed | 把 seed、节点数和耗时写入 benchmark |

首轮不做全量深度搜索，不引入 CP-SAT 依赖，不改 `PackingResult` schema。

## 分阶段实验计划

### Phase 0：建立当前算法基线

- 固定 0824 输入、Node/Vite 版本和 seed；记录 504/506 件、每 SKU 分布、`internal_notch`、`external_residual`、最长货物间槽、耗时。
- 对 20GP/40HQ quantity 和 volume 运行现有合同，确认数量与性能基线。
- 增加一个“候选日志”模式（测试/benchmark 专用，不进入结果契约），记录每轮候选 EMS 数量、块数量和被拒绝原因。

### Phase 1：跨 EMS 候选 + 共享可行性

- 不改变搜索宽度，先让 `selectBlockPlacement` 生成所有可行 `(EMS, block, point)`，再全局排序。
- 把 lookahead 的可行性改为复用真实 `canPlace`/块 staging；剩余质量只做排序，不得把不可行 EMS 判为可用。
- 通过 0824 和两个 EMS 的最小反例测试证明：一个 EMS 的局部最大块不能遮蔽另一个 EMS 的更好候选。

### Phase 2：beam width 4/8 的深度 2 搜索

- 用不可变/可回滚状态扩展两步；每个子状态用件数上界剪枝。
- 验收：0824 件数不低于旧基线；件数相同才要求槽指标改善；任何件数下降必须报告而非更新 golden。
- 记录 P50/P95 耗时，若超过交互预算就缩小宽度或只在“当前件数差 0/1”的候选上启用搜索。

### Phase 3：LNS/GRASP 离线实验

- 从 Phase 2 最好解出发，拆除一段相邻 EMS/块，按同一可行性规则重填；固定 10/30/60 秒预算做曲线。
- 比较“件数优先”与“件数相同后紧凑”两个目标，不允许用紧凑性掩盖件数回退。

### Phase 4：CP-SAT/MIP 缩减实例验证

- 只抽取 2--5 个几何类别、少量库存、固定候选坐标/块 pattern；目标最大化件数，再最小化槽。
- 用求解器结果验证 beam 的上界差距；记录建模变量数、求解时间和不可表达的支撑假设。
- 若缩减实例仍有明显差距，再决定是否增加后端“精确/验证模式”；默认前端不引入求解器。

## 验收指标和风险

必须同时报告：

- `placedCount` 及每个 SKU 的 placed/unplaced；
- `internal_notch` 体积和最长跨度；
- `external_residual` 体积；
- 几何越界、重叠、支撑链和堆叠容量；
- 20GP/40HQ quantity/volume 的计算耗时和回归；
- 搜索节点、候选数、预算是否耗尽。

不要使用以下替代品作为“算法已正确”的证据：

- 只调大支撑阈值来换布局；
- 只断言 `placedCount >= 500` 而不冻结 0824 数量口径；
- 只看总体体积利用率；
- 用单个 0824 快照调参后跳过随机/其他 SKU 回归；
- 把 lookahead 的尺寸上界当成真实可装件数。

## 最终建议

当前方案不是方向错误，而是把一个适合快速出解的局部启发式当成了全局优化器。最稳妥的路线是：

1. 先修正候选边界：跨 EMS 全局候选，统一真实可行性判断；
2. 在此基础上加入小宽度、短深度 beam/tree search，严格执行“数量第一、紧凑第二”；
3. 把 LNS/GRASP 放在有预算的后台优化路径；
4. 用 CP-SAT/MIP 只做缩减实例的最优性对照和上界验证；
5. 暂不把完整 2D layer、skyline 或 column generation 作为主引擎。

这条路线能直接回答“504 是否因为算法早期决策而损失 2 件”，同时不会破坏当前支撑、标签、分层和手动编辑契约。
