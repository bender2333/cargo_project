# 计划：手动排布性能（修 #2A 自动转手动微调卡顿）

来源反馈（2026/6/11）：「自动排布后，点击继续手动微调，易卡顿、长时间未响应（货物重量/数量多时；小批量不卡顿）」。

复核已确认（decision.md 2026-06-11）：根因是 `validateDraft` 在每次手动移动时全量重算，复杂度接近 **O(n³)**，箱多时每次拖动/落定都重算一遍。

本计划专注**性能**，与渲染朝向修复（`plans/2026-06-11-manual-render-and-metrics.md`）、吸附（`plans/2026-06-11-snap-feedback.md`）解耦。

---

## 根因（file:line）

1. **validateDraft 整体复杂度 ~O(n³)**（`src/lib/manualPlacement.ts:523`）：
   - overlap 双重循环 O(n²)（`:537-556`）；
   - 对**每个** box 调 `supportingStackLimitViolation`（`:581-595`），而该函数内部（`:493-517`）又对**每个** box 重建一遍 `nodes` Map，且对每个 node 调用递归的 `stackLayerForManualBox`（`:484-491`）——即每个 box 都把全量 stack-chain 重算一次 → 整体 O(n³) 量级。
   - `findSupport`/`directSupportsFor` 也都是对每个 box 扫全量 others（O(n²)）。
2. **每次提交都全量校验**（`src/Workbench.tsx:1278-1287` `handleManualMoveBox`、`:1320-1325` drop、`:1289` 起）：每次 move/drop 调 `validateDraft` 后只 `.filter(issue.boxId===id)`，**先算了全量、再丢弃绝大部分**。
3. **无节流/记忆化**：拖动过程若每帧触发校验（需在 ContainerScene/ManualPlacement2D 落定 vs 移动中确认调用频率），放大问题。

## 意图与边界

- **意图**：把每次单箱移动的校验成本从 O(n³) 降到 ~O(n) 或 O(n log n)，使数百箱时手动微调不卡顿。**不改变校验结果语义**（同样的 draft 必须得到同样的 issues 集合）。
- **边界**：
  - 不改 validateDraft 的**判定规则**（边界/重叠/支撑/堆叠层定义不变）；只改**计算方式**与**调用范围**。
  - 不改渲染、不改吸附、不改装箱算法。
  - 优先做"增量校验 + 复杂度优化"，不引入新数据结构持久化到快照（schemaVersion 不变）。

## 优化方向（按收益/风险排序，建议逐步提交）

### 步骤 1：单箱增量校验（最高收益，最低风险）
- 新增 `validateBox(draft, boxId, container, supportPolicy)`：只校验**目标箱**相关的 issues（它自身的边界、它与其它箱的重叠、它的支撑/堆叠），而非全量。
- `handleManualMoveBox` / `handleManualDropFromPool` 改调 `validateBox`（它们本就只用 `.boxId===id` 的结果）。
- 复杂度：单箱重叠 O(n)、单箱支撑 O(n)、stack-chain 沿支撑链 O(链长)。从 O(n³) → ~O(n)。
- **注意**：移动一个箱可能让**被它支撑的上层箱**变悬空/超层。增量校验须包含「依赖目标箱的箱」。可先用保守策略：校验 目标箱 + 其支撑链上下相关箱。若难以精确界定依赖集，则回退到「目标箱 + 全量 overlap 对目标箱、但 stack 校验仅目标箱及其直接上层」。

### 步骤 2：消除 supportingStackLimitViolation 的重复建图
- `supportingStackLimitViolation`（`:493`）每次调用都重建全量 `nodes` Map 并重算每个 box 的 physicalLayer。若全量校验仍需保留（如落定最终一次校验、导出前校验），把 nodes/physicalLayer **预计算一次**传入，而非每个 box 重算。
- 复杂度：全量校验从 O(n³) → O(n²)。

### 步骤 3（可选）：拖动中节流
- 确认 ContainerScene（`pointermove`）/ ManualPlacement2D 拖动过程是否每帧触发 `onMoveBox→handleManualMoveBox→校验`。若是，拖动中只做轻量预览校验（边界+目标箱重叠），完整校验留到 `pointerup` 落定。
- 先测量再决定：若步骤 1 后已不卡，步骤 3 可不做。

## 验证标准

- **正确性（防回归，核心）**：
  - 单测：`validateBox(draft, id, ...)` 的结果，必须等于 `validateDraft(draft, ...).filter(i => i.boxId === id)`，在多组随机/构造 draft 上断言**完全一致**（含 overlap/boundary/floating/max-stack/ground-only 各类型）。这是"优化不改语义"的硬断言。
  - 单测：移动一个支撑底层箱使上层悬空，断言增量校验**仍能报出上层箱的 floating issue**（即依赖集处理正确）——这是最容易被增量优化漏掉的场景，必须有失败-能捕获的用例。
  - 三快照回归：对 `test-data/json/snapshot(3)` (866+74 箱) 跑全量 validateDraft 与逐箱 validateBox，断言并集一致。
- **性能（编码业务意图）**：
  - 基准测试（vitest bench 或计时断言）：构造 N=500 箱 draft，单箱移动校验耗时较优化前显著下降（建议断言 validateBox 在 500 箱下 < 某阈值，如 < 5ms）。避免「只测能跑通」的弱标准。
- **E2E**：snapshot(3) 进入手动后拖动一个箱，断言交互响应（无长时间阻塞）——可用既有 manual-3d.spec 框架，主要防崩溃/卡死回归。

## 必跑验证
- `npm run lint && npm test && npm run build`；涉及交互 → `npm run test:e2e`。
- 现有 `manualPlacement.test.ts`、`manualMoveCommit.test.ts`、`stackCapacity.test.ts` 必须全绿。

## 风险与回归门槛
- 增量校验最大风险是**漏掉跨箱依赖**（移动 A 影响 B 的支撑/层数）。"validateBox 结果 == validateDraft 过滤结果"的等价单测是兜底门槛——不达标不得合并。
- 若步骤 1 的依赖集分析过于复杂、风险高，可降级为：移动时仍跑全量 validateDraft，但先做步骤 2（消除重复建图，O(n³)→O(n²)）取得稳妥收益，把步骤 1 留作后续。决策记入 decision.md。
