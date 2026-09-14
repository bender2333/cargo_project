# 计划：数量优先与体积优先装箱算法重构设计

日期：2026-08-25  
范围：只重构 `quantity` 与 `volume` 两种自动装箱模式。`weight` 与 `input` 模式保持现有语义和实现，作为回归对照，不在本轮扩大搜索器范围。

关联调研：[2026-08-25-packing-algorithm-research.md](C:/project/cargo_project/plans/2026-08-25-packing-algorithm-research.md)。

## 设计结论

当前系统的问题不是“紧凑性必然减少装载量”，而是局部构造式启发式把局部空间形状当成了最终目标。两个模式必须拥有明确的终局目标：

```text
quantity:
  1. 最终 placedCount 最大
  2. 在件数相同的可行布局中，internal_notch 最小
  3. 再比较货物间长槽、死 EMS、碎片和确定性作业顺序

volume:
  1. 最终 usedVolume 最大
  2. 在体积相同的可行布局中，placedCount 最大
  3. 再比较 internal_notch、死 EMS、碎片和作业顺序
```

任何 `506 -> 504` 或类似主目标回退，不能由紧凑性测试下限隐式接受；必须单独记录并获得产品确认，或由搜索继续尝试恢复主目标。

## 当前问题

### quantity 模式

- 当前 block 引擎按当前块件数和局部空间形状排序，不能证明最终 `placedCount` 最大。
- `selectBlockPlacement` 仍按 `(x,z,y)` 找到第一个可行 EMS 后返回，后续 EMS 无法胜出。
- 当前 0824 紧凑修复将结果从 506 变为 504，现有测试只要求 `placedCount >= 500`，没有冻结数量合同。

### volume 模式

- block 路径按当前 block 体积排序，不等于最终 `usedVolume` 最大。
- 非 block fallback 在 [packing.ts:1321-1381](C:/project/cargo_project/src/lib/packing.ts:1321) 通过 `placementScore` 选择位置，`placementScore` 主要表达位置、支撑、朝向和贴边，不是终局体积目标。
- 当前 quantity 的浅层 lookahead 没有覆盖 volume；两种模式的搜索边界不一致。

### 共同问题

- `packingLookahead.ts` 按尺寸估计剩余可用性，没有共享真实 `canPlace` / `canStageBlock` 约束。
- 搜索状态不可回滚，只提交单一路径；局部错误会永久污染后续 EMS。
- 没有统一的终局目标比较器、可行上界、候选跨 EMS 竞争和搜索预算诊断。

## 架构目标

### 外部 seam：保持 `calculatePacking` 稳定

`calculatePacking` 继续是唯一对外入口，继续返回现有 `PackingResult`。UI、标签、2D/3D、分层、导出和历史不感知搜索实现。

建议内部形成一个深模块：

```ts
type PackingOptimizationRequest = {
  container: ContainerSpec
  cargoItems: CargoItem[]
  loadingMode: 'quantity' | 'volume'
  defaultMaxStackLayers?: number
  minSupportRatio: number
  budget: PackingSearchBudget
}

type PackingOptimizationOutcome = {
  result: PackingResult
  search: {
    strategy: 'greedy' | 'beam'
    statesExpanded: number
    candidatesEvaluated: number
    budgetExceeded: boolean
  }
}

function optimizePacking(request: PackingOptimizationRequest): PackingOptimizationOutcome
```

该接口是内部 seam，不修改 `PackingResult`。搜索指标只用于诊断、benchmark 和测试，不直接进入业务结果契约。

### 内部模块划分

#### 1. `packingObjective.ts`：终局目标模块

小接口：

```ts
type PackingObjective = 'quantity' | 'volume'

type PackingQuality = {
  placedCount: number
  usedVolume: number
  internalNotchVolume: number
  interCargoMaxMm: number
  deadEmsVolume: number
  externalResidualVolume: number
}

function comparePackingQuality(a: PackingQuality, b: PackingQuality, objective: PackingObjective): number
```

实现内部定义词典序，不让 `packing.ts`、lookahead、LNS 各自复制排序逻辑。

#### 2. `packingCandidates.ts`：跨 EMS 候选模块

统一生成：

```text
(state, EMS, block, orientation, point)
```

候选必须跨所有可行 EMS 竞争，不能在第一个 EMS 处提前 return。候选生成保留当前有限 block frontier，但对 quantity/volume 都提供：

- 每种朝向的最大块；
- 改变 EMS 形状的少一行/列/层块；
- 同主目标接近时的不同脚印块；
- 稳定、确定性的去重和上限。

#### 3. `packingFeasibility.ts`：真实可行性模块

所有生产提交和搜索评分共用同一个可行性 seam：

- 越界、重叠；
- 支撑比；
- `groundOnly`；
- `stackable` / `maxStackLayers`；
- 向上 rider 的容量检查；
- 重量上限；
- 块内逐箱验证。

lookahead 不允许只用尺寸拟合替代真实约束。若为了性能使用上界估算，必须标记为“乐观上界”，不能把它当成可行放置数量。

#### 4. `packingSearchState.ts`：可回滚搜索状态

状态至少包含：

```text
remaining quantity per SKU
EMS list
placed boxes/support graph needed by feasibility
used weight
placed count / used volume
deterministic tie-break state
```

优先采用不可变快照或结构化 clone-on-write；不要让 beam 分支共享可变 `placed` / `emsList` 引用。

#### 5. `packingSearch.ts`：有限宽度搜索

beam search 的接口只接受候选生成器、可行性模块、目标上界和预算，不知道 UI 或导出。初始版本采用有限宽度/短深度：

- beam width：8，必要时降到 4；
- depth：2 个 block 决策；
- 每状态候选：每个 EMS/几何类别限制数量；
- 预算：由 benchmark 先测定，不在代码中无限等待；
- 预算耗尽：返回当前最好完整解，并记录 `budgetExceeded`。

每个 beam 状态先用乐观上界剪枝：

- quantity：当前已装件数 + 各 EMS 可容纳件数上界；
- volume：当前已用体积 + 各 EMS 可利用体积上界；

上界可以不紧，但必须安全，不能低估而错误剪掉最优状态。

## 两种模式的执行策略

### quantity

1. 对所有 `(EMS, block)` 生成真实可行候选；
2. 用最终件数上界优先保留 beam 状态；
3. 件数上界相同或确定无法超过当前 best 时，再使用 compactness 代理排序；
4. 每个候选完成短深度搜索后，用同一 residual fill 完成终局；
5. 比较终局 `PackingQuality`，不得用当前 block 的紧凑度替代最终件数。

0824 首要验收：不接受无产品批准的 506 -> 504 回退。若新布局仍只能达到 504，必须明确记录“件数/紧凑性 Pareto 取舍”，由产品决定是否接受。

### volume

1. 对所有 `(EMS, block)` 生成真实可行候选；
2. 用最终 `usedVolume` 上界排序和剪枝；
3. 体积相同或上界相同的状态再比较 `placedCount`；
4. 不能把“当前 block volume 最大”当成最终体积目标；
5. 体积相同的布局中，再优化槽、死空间和作业稳定性。

当前 20GP/40HQ volume 结果必须冻结为基线：placed、usedVolume、volumeUtilization、槽指标和耗时。quantity 的 compactness 改动不能默认改变 volume 结果，除非通过独立 volume 对照验证。

## 逐步实施顺序

### Phase 0：合同与基线

- 固定 0824、越南 20GP/40HQ、现有 packing golden 和随机种子；
- 记录 quantity/volume 的 placed、usedVolume、每 SKU 分布、`internal_notch`、`interCargoMaxMm`、external residual、耗时；
- 写 `comparePackingQuality` 的纯函数测试；
- 明确 0824 quantity 的产品合同：`506` 是否为硬门槛，或允许多大回退。

### Phase 1：共享可行性和跨 EMS 候选

- 把 block staging 的真实可行性抽到内部 seam；
- 让 quantity/volume 都生成跨 EMS 候选；
- 暂时保持 greedy 只替换候选边界，不引入 beam；
- 新增两个可行 EMS 的回归测试，证明后一个 EMS 可以胜出；
- 新增 `groundOnly`、`maxStackLayers`、重量和支撑约束的 lookahead 测试。

### Phase 2：quantity beam

- width 4/8、depth 2；
- 终局 completion 仍走现有合法 residual fill；
- 目标：0824 件数至少达到批准门槛，件数相同时槽指标下降；
- 记录候选数、扩展节点和预算是否耗尽。

### Phase 3：volume beam

- 复用同一搜索器，只替换 objective comparator 和安全体积上界；
- 验证 20GP/40HQ volume 的最终 `usedVolume` 不低于基线；
- 体积相同才比较数量和紧凑性；
- 单独验证性能，不把 quantity 的阈值或 lookahead 条件复制过来。

### Phase 4：LNS 后台优化

- 从 Phase 2/3 的完整解开始，移除最大槽所在的相邻 blocks；
- 使用同一候选和可行性模块重填；
- 只接受词典序目标改善；
- 固定 seed、轮数和时间预算；
- 默认自动装箱先返回 beam/greedy 结果，LNS 不阻塞首屏交互。

### Phase 5：离线精确 oracle

- 抽取 2-5 个几何类别、少量库存和固定候选位置；
- 用 CP-SAT/MIP 求 quantity/volume 的局部上界；
- 比较 beam 与 oracle 的差距；
- 不把求解器依赖引入前端主 bundle。

## 测试矩阵

### 目标函数

- quantity：最终件数优先；同件数才允许紧凑性改变选择；
- volume：最终体积优先；同体积才允许数量/紧凑性改变选择；
- 主目标下降必须失败，不能只验证宽松下限。

### 搜索边界

- 两个可行 EMS：后一个 EMS 的终局上界更优时必须可以胜出；
- 多 SKU 同件数不同脚印：验证 0824 的 18x3 / 9x6 形态；
- 真实可行性：`groundOnly`、`maxStackLayers`、支撑比、重量、边界、重叠；
- 候选超限/预算耗尽：返回完整 best，诊断可见，不能静默退化。

### 真实夹具

- 0824 quantity：主目标不低于批准门槛，400 mm 槽消除或下降；
- 0824 volume：独立记录，不被 quantity 评分污染；
- 越南 20GP/40HQ 两模式：placed、usedVolume、utilization、几何、支撑和耗时；
- 固定种子随机场景：验证不是只针对一个现场快照调参。

## 不采用的方案

- 不把当前 lookahead 权重继续堆叠成复杂分数；这会增加校准成本但不解决单路径提交。
- 不直接把整柜 CP-SAT/MIP 放入浏览器；模型规模和支撑语义不适合当前交互路径。
- 不先做完整 2D layer-only 引擎；0824 混合高度和六朝向会使硬层化过早限制可行性。
- 不引入 GA/RL 作为默认求解器；确定性、解释性和性能预算不匹配当前产品合同。

## 验收与发布门槛

- 先完成 quantity/volume 基线和目标合同，再允许修改 golden；
- 所有件数或体积变化逐 fixture 报告，不用宽松断言掩盖回退；
- `npm run lint`、`npm test`、`npm run build`、`npm run test:e2e` 按仓库要求执行；
- 生产部署仍需独立 SQLite backup 和远程 E2E，不以本地算法测试替代；
- 任何失败写入 `decision.md`，不削弱断言、不跳过测试。

## 预期结果

这不是承诺一次重构就得到数学最优，而是建立一个可验证的优化架构：

```text
稳定 calculatePacking façade
  -> 共享真实可行性
  -> 跨 EMS 候选
  -> quantity / volume 词典序 objective
  -> 有预算的 beam search
  -> 可选 LNS 改善
  -> 统一 PackingResult finalizer
```

这样才能回答两个关键问题：

1. 0824 的 504 是否只是局部贪心损失；
2. 在数量或体积主目标不回退的前提下，紧凑性还能改善多少。
