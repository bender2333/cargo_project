# 计划：解除数量模式槽限制，优先装载量并把槽外置

日期：2026-08-26  
基于：`feat/quantity-volume-search` 当前分支、0824 Pareto 记录和用户确认。

## 用户确认的方向

- 允许去除当前 quantity 搜索中的 `passesQuantityHardCaps` 槽限制。
- 合法的外部开口槽不是自动失败条件；不能因为视觉上有槽就放弃更多装载量。
- 真正的硬约束仍是：越界、重叠、重量、支撑比例、`groundOnly`、堆叠容量和块内逐箱可行性。
- quantity 主目标：最终 `placedCount` 最大。
- 在最终件数相同的可行布局中，再优化封闭内腔、未支撑跨度、货物间槽是否连接到外部边界和空间碎片。
- `weight` / `input` 不改；`PackingResult` schema 不改；LNS 和精确求解器本轮不进入默认生产路径，只保留后续入口。

## 当前问题

当前 [packing.ts](../src/lib/packing.ts) 的 `passesQuantityHardCaps` 会拒绝：

- greedy 没有内部空腔、候选出现内部空腔；
- greedy 槽小于 200 mm、候选槽达到 200 mm；
- greedy 没有地面走廊、候选出现地面走廊。

这把“布局偏好”变成了候选淘汰条件，导致 0824 的合法候选 A（524 件 / 400 mm 外开口槽）被拒绝，候选 B（504 件 / 150 mm 槽）获胜。该槽不是封闭内腔，也不是支撑违规。

## 目标函数

### quantity

按以下词典序比较**完整终局布局**：

1. `placedCount` 降序（前提是候选通过真实几何/支撑/堆叠/重量可行性）；
2. `internalNotchVolume` 升序；
3. `unsupportedSpanRisk` 升序；
4. `interCargoMaxMm` 升序；
5. `externalResidualVolume` / `deadEmsVolume` 升序；
6. 稳定、可解释、确定性的作业顺序和朝向 tie-break。

禁止用槽阈值拒绝更高 `placedCount` 的合法布局。`interCargoMaxMm` 只能在件数相同或满足明确 Pareto 规则时参与比较；它不能替代 `unsupportedSpanRisk` 或真实支撑校验。

### volume

保持当前 volume 目标：

1. `usedVolume` 降序；
2. `placedCount` 降序；
3. 上述稳定性和空间质量指标。

volume 不复制 quantity 的槽帽，也不修改 `weight` / `input`。

## 稳定性与槽的指标分离

新增纯算法指标，不能把截面上的空槽直接当成稳定性违规：

- `internalNotchVolume`：空体素连通分量不接触容器边界；这是内部封闭空腔指标。
- `externalResidualVolume`：空体素连通分量接触门端、侧壁、顶部或地面；这是合法剩余空间候选。
- `interCargoMaxMm`：同一截面两侧有货物的最大空段；只用于布局质量，不是硬约束。
- `unsupportedSpanRisk`：对每个箱体实际支撑面积、支撑比例和悬空跨度的聚合风险；必须基于真实支撑图/`canPlace`，不能从空体素推断。
- `floorCorridorMaxMm`：仅作为地面布局质量和局部重排目标，不直接拒绝合法布局。

“槽外置”的判定不是把箱体简单平移，而是检查空区是否与容器边界连通，并在局部重排中优先把空区连接到门端/侧壁/顶部。

## 实施阶段

### Phase 0：先锁定新目标和复现

1. 新增目标测试：
   - 通过真实可行性校验的 524 件 / 400 mm 外开口槽完整布局必须胜过 504 件 / 150 mm 槽；
   - 如果 524 件候选存在支撑/堆叠/重量/几何违规，必须被可行性层拒绝，而不是由槽指标决定；
   - 506 件 / 槽小于 200 mm 若存在，必须胜过两者；
   - 内部封闭空腔、支撑违规和越界布局必须始终失败。
2. 删除 `passesQuantityHardCaps` 和 `pickBestCappedComplete` 对 inter-cargo/floor 槽的生产淘汰行为，保留指标记录；数量候选只由真实可行性和终局 objective 决定。
3. 删除/改写任何 `placedCount >= 500` 或“槽帽即验收”的测试，改为目标函数行为测试。
4. 0824 基线改成对照数据，不把 504 写成算法上限。

### Phase 1：共享真实性和跨 EMS 搜索

1. `packingCandidates` 跨所有 EMS 生成候选；不得在第一个 EMS 返回。
2. `packingFeasibility` 统一复用真实 `canPlace` / 块逐箱 staging / 重量门。
3. `packingSearchState` 使用 clone-on-write；任何 beam 分支互不共享 `placed`、`placedById`、`emsList`。
4. 搜索完成后必须用同一 residual fill 得到完整布局，不能用半成品质量比较。
5. `packingSearch` 使用安全上界剪枝：上界只能过估，不得低估。
6. 保留 `statesExpanded`、`candidatesEvaluated`、`budgetExceeded`，通过测试/benchmark 暴露，不写入 `PackingResult`。

### Phase 2：quantity beam 目标修正

1. beam 的排序先按最终件数上界，再按当前件数，不能先按槽。
2. 对完整终局布局用 `comparePackingQuality(..., 'quantity')`，不再调用槽硬帽淘汰。
3. 预算耗尽时返回已知最好完整布局，并明确 `budgetExceeded`；禁止静默声称完成全局搜索。
4. 0824 的验收顺序：
   - 优先尝试恢复 506；
   - 继续搜索时允许保留 524 / 400 mm 候选作为 Pareto 证据；
   - 若最终只能在 504、506、524 之间选择，输出完整 Pareto 表，不更新生产 golden，等待产品确认。

### Phase 3：局部“冒泡”/LNS 入口，不阻塞首屏

本轮只实现可调用入口和离线测试 seam，不把长时间 LNS 接入默认同步计算：

1. 从完整 beam 解找到最大 `interCargoMaxMm` 的空段，并判断该空段是否与指定可访问边界（优先柜门）连通；
2. 收集与该空段相邻的 block、支撑链和同一高度层；
3. 移除局部 block，重建局部 EMS；
4. 使用同一候选和可行性模块重填；
5. 只接受词典序目标改善，quantity 不得下降；
6. 固定 seed、最大轮数和时间预算；
7. 将槽向外部边界移动作为次级目标，而不是硬性槽宽阈值。

完整 LNS 实现另立计划，不在本轮假装完成。

### Phase 4：volume 独立复核

- 重新跑 0824 volume、越南 20GP/40HQ、0802；
- 主目标 `usedVolume` 不下降；
- volume 不使用 quantity 槽帽；
- 记录 424/473 等当前结果和新结果的完整对照；
- 如果 volume beam 仍被 greedy 胜出，要记录“搜索运行但没有改善”，不能把它写成已优化成功。

## 验证标准

### 算法单测

- 524 件通过真实可行性校验的布局在 quantity 中胜过 504 件紧凑布局；
- 400 mm 边界连通槽不触发硬失败；
- 支撑/堆叠/重量/越界/重叠违规候选仍硬失败；
- 同件数时内部空腔为 0 的布局胜过有内部空腔布局；
- 同件数且内部空腔相同，支撑风险低的布局胜出；
- `groundOnly`、max stack、支撑比、重量、越界、重叠仍硬失败；
- 跨 EMS 后一个更优候选可以胜出；
- beam 分支 clone 隔离；
- 预算耗尽返回完整 best 且 `budgetExceeded=true`。

### 真实夹具

- 0824 quantity：优先验证 506；允许报告 524/400 与 504/150 Pareto，不伪造“槽已消失”；
- 0824 volume：主目标 usedVolume 不低于基线；
- 越南 20GP quantity/volume：数量、体积、几何和支撑合同不下降；
- 越南 40HQ 两模式保持 864/864；
- 0802 quantity 保持 877/877；
- 固定种子多 SKU/多高度场景，防止只对 0824 调参。

### 性能和门禁

- 20GP quantity 默认同步预算保持在当前交互目标内；
- `packing.test.ts` 顶填用例的约 5.4 秒必须通过真实算法预算解决，不得靠放宽测试超时掩盖；
- 运行 touched-file eslint、`tsc -b`、build、packing-performance；
- 完整 `npm test`、`npm run test:e2e` 必须按仓库要求运行；
- 生产部署前必须 SQLite backup、deploy、health、远程 E2E；未完成则明确 BLOCKED。

## 不改动

- `calculatePacking` 对外签名和 `PackingResult` schema；
- `weight` / `input` 路径；
- UI、3D、2D、标签、分层、导出和历史消费方式；
- LNS 长时后台任务和 CP-SAT/MIP 精确求解器本轮不进入默认生产路径。

## 提交粒度

1. `test(packing): allow higher-count external-slot layouts`
2. `fix(packing): remove quantity slot hard caps`
3. `test(packing): separate stability from external gaps`
4. `feat(packing): add bounded local slot-relocation seam`
5. `docs: record quantity-first slot relocation decision`

## 交给 Grok 的执行要求

- 先在 `decision.md` 记录“槽限制解除”的用户决策和新的词典序目标。
- 先写 RED 测试，再修改生产代码；不得先改 golden。
- 每个子任务单独 commit，并更新 `CHANGELOG.md`。
- 遇到 506/524/504 Pareto 不自行替用户拍板；输出数字、几何、稳定性和耗时后停止部署。
- 不得把外部连通槽、内部封闭空腔和支撑风险使用同一个指标代替。
