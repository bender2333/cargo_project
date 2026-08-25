# 当前装载场景的 3D 装箱算法调研

日期：2026-08-25  
范围：`test-data/json/0824/input.json`、当前 `src/lib/packing.ts` / `blocks.ts` / `emsSpace.ts`，以及 3D container loading / bin packing 的原始论文和官方求解器资料。

## 结论摘要

当前问题**有算法原因**，但不是“紧凑性天然等于装载量”。真正的问题是当前实现使用了局部代理目标：

```text
当前块件数接近
  -> 当前 EMS 形状看起来更紧凑
  -> 提交当前块
```

而用户在 quantity 模式真正需要的目标更接近：

```text
最终 placedCount 最大
  -> 在最终件数相同的方案中减少货物间槽
  -> 再比较体积、碎片、作业顺序和朝向稳定性
```

0824 的实测 `506 -> 504` 不是理论上必然的紧凑性代价；它证明当前一步评分器没有证明全局件数最优。当前系统应从“单步 EMS 贪心 + 局部 lookahead”演进为“可行的 `(EMS, block)` 候选 + 有限宽度全局搜索 + 局部大邻域重排”。

## 当前场景画像

0824 夹具为 20GP `5758 x 2352 x 2385 mm`，共 24 个 SKU、2544 件。货物数据具有明显结构：

| 结构 | 当前事实 |
|---|---|
| 580x365、435 高 | 10 个 SKU，1403 件 |
| 600x400、385 高 | 4 个 SKU，270 件 |
| 530x305、310 高 | 3 个 SKU，168 件 |
| 其余脚印 | 7 个 SKU，703 件 |
| 旋转 | 所有 SKU `canRotate=true` |
| 堆叠 | 所有 SKU `stackable=true`，本夹具没有 `groundOnly` / 有效 `maxStackLayers` |
| 重量 | 总货物约 24229.51 kg，小于柜体 28200 kg 上限，重量不是主约束 |

因此，本场景不是重量受限或不可堆叠主导的问题，而是**多 SKU、重复脚印、混合高度、允许正交旋转的 3D 几何组合问题**。这正是块构建、层图案和有限搜索有价值的场景。

仓库侧的当前证据：

- `src/lib/packing.ts:1188-1224` 仍按 EMS 的 `x/z/y` 顺序找到第一个可行 EMS，然后只在该 EMS 内选择 block；
- `src/lib/packingLookahead.ts:45-91` 的剩余空间评分按尺寸估算下一步可用性，没有完全复用 `canPlace` 的支撑、堆叠和重量语义；
- 0824 当前紧凑版本消除了约 400 mm 货物间槽，但最终件数从 506 变成 504；
- 现有测试已覆盖该具体形态，但没有覆盖跨 EMS 竞争和最终件数词典序目标。

## 算法路线比较

### 1. EMS / maximal-space 贪心

**做法**：维护空的最大长方体，放置箱体后切分 EMS，在角点或 EMS 原点继续放置。

**优点**：实现简单、确定性强、适合在线交互；现有 `emsSpace.ts` 已提供底座。

**局限**：EMS 解决的是“候选空间可见性”，不是“选择哪一个空间、哪一个块最终最优”。如果每一步仍然在第一个 EMS 上做局部选择，就会重复当前 0824 的问题。

**结论**：保留作为空间表示，不适合作为最终搜索算法。

来源：Parreño 等人的 maximal-space / extreme-point 类方法；仓库已有引用和 EMS 实现：

- [Crainic et al., 2008, Extreme-point-based heuristics for 3D bin packing](https://doi.org/10.3138/infor.46.3.000)
- [当前 EMS 实现](../src/lib/emsSpace.ts)

### 2. 块构建 / superitems + beam search 或 tree search

**做法**：先把同 SKU 箱体组合成规整块或 superitem，再在多个 `(EMS, block, orientation)` 候选之间做有限宽度搜索。每个候选都经过真实几何和支撑门控，搜索状态保存剩余货物与 EMS。

**优点**：最贴合当前货物的重复脚印；块内天然无缝；比逐箱搜索更容易稳定地形成层和列；可以直接保留六种正交朝向。

**关键要求**：搜索必须跨 EMS，而不是“先选第一个 EMS，再在其中 lookahead”；终止或截断时必须以最终 `placedCount` 的上界和当前 best solution 比较。

**适配度**：高。它延续当前代码，不需要推翻 `PackingResult`、`canPlace`、标签和分层契约。

来源：

- [Fanslau & Bortfeldt, 2010, A Tree Search Algorithm for Solving the Container Loading Problem](https://doi.org/10.1287/ijoc.1090.0338)
- [Bortfeldt & Wäscher, 2013, Constraints in container loading](https://doi.org/10.1007/s10489-012-0337-0)
- 仓库既有方向：[plans/2026-07-07-block-building-engine.md](../plans/2026-07-07-block-building-engine.md)

### 3. 大邻域搜索（LNS / ruin-and-recreate）

**做法**：先得到一个可行布局，选择一个问题区域或若干 block，移除它们，再使用候选块/EMS重新插入；如果词典序目标改善则接受，必要时保留少量随机扰动以逃离局部最优。

**优点**：特别适合当前场景中“总体已经装好，但某个上层区域出现槽”的形态；可以只重排 `x≈4500..5758`、某一高度层或某组 SKU，不必每次从空柜重新搜索；容易限制时间预算。

**局限**：需要一个可靠的可行性评估和可回滚状态；如果移除区域定义不对，可能只是把槽从一个位置搬到另一个位置。

**适配度**：高，适合作为块+EMS 初始解之后的第二阶段优化。它比把完整 beam search 深度无限加大更容易控制响应时间。

来源：3D bin packing 研究中的 large-neighborhood / ruin-and-recreate 属于元启发式主路线；适用性判断基于其“从可行解局部破坏并重建”的原始算法范式，实际落地时需要以当前仓库的真实 `canPlace` 约束重新验证。

### 4. 2D 层图案生成 + 垂直组合

**做法**：按可能的层高生成 2D 矩形排布图案，再决定哪些层图案在 z 方向叠加；层图案可以使用 guillotine、MaxRects、skyline 或 2D 整数规划，层组合可使用动态规划、set packing 或小型 MIP。

**优点**：当前 0824 有大量重复的 580x365 和 600x400 脚印，二维层图案可以显式优化“宽度拼齐”和“行间槽”；对“先铺底、再逐层堆叠”的作业语义更容易解释。

**局限**：混合高度会让层边界不唯一；部分支撑允许跨层和错层，必须额外表达支撑面积；如果强行按统一层高，会损失侧立旋转带来的可行性。

**适配度**：中高，适合作为后续专门的“层级模式”引擎或 beam search 的候选生成器，不建议直接替换当前 3D 引擎。

来源：

- [Martello, Pisinger & Vigo, 2000, The three-dimensional bin packing problem](https://doi.org/10.1287/opre.48.2.256.12072)
- [Bortfeldt & Wäscher, 2013, container-loading constraints review](https://doi.org/10.1007/s10489-012-0337-0)

### 5. CP-SAT / MIP / exact search

**做法**：把候选位置、朝向、箱体选择和不重叠约束建成整数规划或 CP-SAT；对小实例求精确最优或给出上界。

**优点**：可以回答“506 是否还能在无槽约束下达到”的基准问题；适合验证启发式是否因为算法不足而少装；能显式实现词典序目标。

**局限**：完整 0824 场景有 2544 个箱、连续坐标和大量候选位置，直接建模会产生巨大模型，不能作为浏览器内主路径；需要离散候选点或局部区域模型。

**适配度**：作为离线 oracle / 回归基准高，作为生产主算法低。

官方资料：

- [OR-Tools CP-SAT guide](https://developers.google.com/optimization/cp/cp_solver)
- [Martello, Pisinger & Vigo, 2000](https://doi.org/10.1287/opre.48.2.256.12072)

建议先对 2-6 个 SKU、几十个箱体或一个局部上层区域求精确/近似最优，用它验证 heuristic 的上界，而不是尝试一次性精确求解整柜。

### 6. GA / RL / 黑箱元启发式

**做法**：用遗传算法、强化学习或其他黑箱搜索直接优化装载序列/位置。

**优点**：理论上可以处理复杂非凸目标。

**局限**：训练/参数成本高、结果可解释性和确定性弱；无法自然替代当前严格的支撑、分层、标签和作业步骤合同；浏览器交互场景不能接受不可预测的长时间搜索。

**适配度**：低，不是当前问题的优先路线。

## 推荐架构

### 目标函数先定为词典序

quantity 模式建议固定为：

```text
1. 最大化最终 placedCount
2. 在 placedCount 相同的候选中，最小化封闭 internal_notch
3. 再最小化货物间 inter-cargo 槽和不可进入的碎片空间
4. 再比较体积利用率、作业深度、朝向稳定性
```

volume 模式可以把第 1 项替换为最终 usedVolume，但不能让局部“下一步件数上界”冒充最终目标。

任何“少装 2 件换更紧凑”的行为都必须显式进入产品决策，而不是由测试下限隐式允许。

### 推荐的三阶段实现

#### 阶段 A：全局块候选 beam search

- 候选统一为 `(EMS, block, orientation, point)`；
- 每个候选先调用共享的真实可行性评估，不能只用尺寸 `bestBlocksForSpace`；
- 保留 `K=16..64` 个状态，按词典序目标排序；
- 每个状态保存 `emsList`、剩余 SKU 数量、已装数量、占用重量和问题指标；
- 设深度、候选数和时间预算，超限时返回当前 best，并记录 `searchTruncated` / `budgetExceeded`。

#### 阶段 B：局部 LNS 重排

- 从初始解中选择问题区域（例如最大 inter-cargo 槽所在层/相邻 block）；
- 移除有限 block，使用同一候选生成器重建；
- 只接受词典序目标改善的结果；
- 限制轮数和总时间，保证 UI 可交互。

#### 阶段 C：小实例精确 oracle

- 对 0824 局部区域、两个脚印和几十个箱体建立 CP-SAT/MIP 小模型；
- 得到可装件数上界和“506 vs 504”是否为启发式损失的证据；
- 将 oracle 结果作为单测/benchmark fixture，不进入浏览器运行时。

## 验证矩阵

1. **目标合同**：quantity 在同一实例中不得因“紧凑性”无提示地掉件；若允许回退，必须记录允许上限并由产品确认。
2. **跨 EMS**：构造两个都可行的 EMS，后一个 EMS 的最终上界更优，断言后一个可胜出。
3. **约束一致性**：lookahead 必须覆盖 `groundOnly`、`stackable`、`maxStackLayers`、支撑比、重量和边界。
4. **0824 复现**：记录 placedCount、internal_notch、inter-cargo 槽、external residual 和耗时。
5. **随机稳定性**：固定随机种子，多 SKU/多高度/侧立朝向，比较平均值和最坏值，不只验证一个快照。
6. **性能**：20GP quantity 的交互预算、40HQ quantity/volume 的完整回归；预算超限必须可见降级，不能静默。
7. **可解释性**：保存每次搜索的模式、候选数、截断原因和最终目标向量，便于现场复盘。

## 最终建议

短期不换算法门派，优先把当前实现从“第一个 EMS 内局部 lookahead”升级为“跨 EMS 的有限 beam search”，并把最终 `placedCount` 放在紧凑性之前。随后增加 LNS 对问题区域重排，用离线 CP-SAT 小模型验证启发式上界。

不建议当前阶段引入 GA/RL，也不建议直接把整柜 CP-SAT 放进前端。2D 层图案生成值得作为中期结构化优化方向，尤其适合当前大量重复脚印的越南装载场景。

## 参考资料

1. Martello, Pisinger, Vigo, “The Three-Dimensional Bin Packing Problem”, *Operations Research*, 2000. [DOI](https://doi.org/10.1287/opre.48.2.256.12072)
2. Fanslau, Bortfeldt, “A Tree Search Algorithm for Solving the Container Loading Problem”, *INFORMS Journal on Computing*, 2010. [DOI](https://doi.org/10.1287/ijoc.1090.0338)
3. Bortfeldt, Wäscher, “Constraints in Container Loading — A State-of-the-Art Review”, *European Journal of Operational Research*, 2013. [DOI](https://doi.org/10.1007/s10489-012-0337-0)
4. Crainic et al., “Extreme-Point-Based Heuristics for Three-Dimensional Bin Packing”, *INFOR*, 2008. [DOI](https://doi.org/10.3138/infor.46.3.000)
5. Google OR-Tools, “CP-SAT Solver”. [Official guide](https://developers.google.com/optimization/cp/cp_solver)

## 研究边界

本调研没有修改装箱代码，也没有把论文中的实验指标直接当作本项目可达指标。所有方案仍需在当前 `PackingResult`、支撑、分层、标签、导出和交互性能合同下做受控实验。
