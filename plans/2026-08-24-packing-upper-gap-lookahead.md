# 计划：块选择一步前视修复 0824 上层外开口空槽

来源：`issues/0824/cargo-debug-snapshot (16).json` 的“仍然有缝”反馈，以及当前 `calculatePacking` 对该快照的可重复诊断。本计划只处理自动装箱布局，不涉及 3D 渲染或手动 Delete。

## 已确认症状

当前快照为 20GP、quantity 模式，货物总量 2544 件，当前结果 506 件。几何分析得到：

- 柜底没有贯穿柜长的走廊，也没有封闭空腔；
- 上层 `z=2025` 附近存在约 400 mm 的横向空槽，位置约为 `x=5300`、`y=1590..2000`；
- 空槽连接柜尾/侧壁，是外部开口的残余空间，不是封闭“夹心缝”；
- 现场问题区域的箱体全部来自 block 阶段，不是 residual fallback / `gap-fill` 单箱阶段；
- 当前实现直接复算该快照仍得到 `largestGap=400mm`。

典型放置链：

1. 上层 EMS 为 `5758 × 2000 × 360`；
2. `TB-C13 / WLH / 18×3` 先放置，占 `5490 × 1590`，共 54 件；
3. 剩余宽度只有 410 mm；
4. `TB-C10 / LHW / 10×1` 再放置，占 `5300 × 310`；
5. 后续侧立 `TB-C13 / HWL` 位于 `y=2000`，最终留下约 400 mm 的可视槽。

## 根因

- `src/lib/blocks.ts:31-80` 的 `bestBlocksForSpace` 每个朝向只返回当前 EMS 能容纳的最大件数块，不保留“少一行/少一列但能改善后续空间”的候选。
- `src/lib/packing.ts:1177-1203` 的 `selectBlockPlacement` 按 EMS 的 `(x,z,y)` 顺序找到第一个可行 EMS 后返回，不比较所有空间的后续质量。
- `src/lib/packing.ts:847-866` 的 `compareBlockChoices` 在 quantity 模式先比较当前块件数/体积，最后才比较 waste，没有评价 `splitEMS` 后的剩余空间是否形成死条或货物间开口槽。
- `src/lib/packing.ts:1167-1175` 的 `commitBlock` 只提交当前块并切分 EMS，没有前视评分。

因此，现状不是“找不到能放的箱”，而是当前候选集合和评分函数共同把一个局部最大块放进了会破坏后续空间连续性的 EMS。

## 目标

- 在不更换“块构建 + EMS”算法的前提下，让算法在当前件数接近时优先选择放置后更连续、更可继续装载的空间。
- 使 0824 快照的上层 400 mm 外开口槽显著缩短或消失。
- 保留数量优先、体积优先、六朝向、支撑和堆叠约束的业务语义。

## 边界

### 不改动

- 不改 `canPlace`、最小支撑比 0.5、`groundOnly`、堆叠容量、重量限制。
- 不改 `PackingResult` 契约、标签统计、分层、支撑关系和导出结构。
- 不切换到墙构建、GA/RL 或精确求解器。
- 不删除六种正交朝向，也不增加“同 SKU 只能一种朝向”的硬约束。
- 不通过提高支撑阈值、减少货物数量或放宽几何断言来掩盖空槽。
- 不把“外部开口残余”与“封闭内部空腔”混为同一个指标。

### 产品口径需保持清晰

本快照的空槽与柜尾/侧壁相连。实现验收必须同时报告：

- `internal_notch`：不接触容器边界的封闭/内部空槽；
- `external_residual`：接触门端、侧壁或顶部的合法剩余空间。

本轮目标是优先消除货物之间的上层外开口槽，但不能为了视觉上绝对铺满而破坏合法外部余量、装载数量或计算时间。若产品最终要求“外部开口槽也必须完全消除”，需要另行确认可接受的件数和性能损失。

## 实现方案

### 1. 扩展块候选前沿

修改 `src/lib/blocks.ts`：

- 保留每个朝向的最大件数块作为主候选；
- 增加有限数量的次级候选，只保留会改变 EMS 形状的块，例如：
  - `ny` 减少一行；
  - `nx` 减少一列；
  - `nz` 减少一层；
  - 在件数相同或接近时，保留更宽/更长的脚印版本；
- 对候选做去重和上限控制，禁止恢复 `generateBlockCandidates` 的全组合爆炸；
- 候选生成只描述可能性，不执行支撑、重叠或重量判定。

### 2. 增加一步剩余空间评分

在 `src/lib/packing.ts` 中增加纯函数评分边界，继续复用 `src/lib/emsSpace.ts`：

- 对候选 `(ems, block)` 先执行一次内存中的 `splitEMS` 模拟；
- 统计模拟后的 EMS：
  - 下一步能容纳的最大件数/体积上界；
  - 无任何当前货物朝向可进入的死空间体积；
  - 宽度、长度或高度低于可用货物最小对应尺寸的窄条体积；
  - 是否把剩余空间切成多个彼此孤立的碎片；
  - 是否继续沿低 `x` / 低 `y` / 低 `z` 连续推进；
- 评分只对有限前沿候选执行，不能对所有货物排列做完整搜索；
- 超过候选数量或时间预算时，退回当前局部比较，并显式留下诊断/测试证据，不能静默改变语义。

### 3. 调整模式排序

- quantity 模式仍以当前块件数为主目标；只有当前块件数差距在明确的接近窗口内，才使用剩余空间质量打破平局或轻微差距；
- volume 模式仍以当前块体积为主目标，再比较剩余空间质量；
- 不能让“为了填槽”无界地牺牲大量当前件数；
- 保留对高度受限侧立朝向的可行性，空间高度不足的朝向自然被过滤。

### 4. 残件阶段保持现状并单独验证

本次证据已经确认 0824 的主槽不是 residual fallback 产生，因此不先改 residual 阶段。若新块评分后仍有残余槽，再单独评估 `emsList` 末端残件选择，避免把两个问题混在一个改动中。

## 测试设计

### 单元测试

新增或扩展 `src/lib/packing.compactness.test.ts`：

1. **0824 快照回归**
   - 使用 `issues/0824/cargo-debug-snapshot (16).json` 的 container/items；
   - quantity 模式；
   - 断言 `internal_notch` 为 0；
   - 断言上层最大内部/货物间槽小于约定阈值，初始 RED 应捕获当前 400 mm；
   - 断言数量、几何边界、重叠和支撑合同。

2. **候选前沿意图测试**
   - 固定 EMS 和两个不同脚印 SKU；
   - 断言评分不会因当前块多一件就选择会产生不可进入窄条的候选；
   - 断言同件数时连续剩余空间优先于碎片空间。

3. **高度受限旋转回归**
   - 剩余 EMS 高度不足以放正立箱，但侧立朝向可行；
   - 断言该箱仍被放置；
   - 不断言同 SKU 朝向数量为 1。

4. **外部 L 余量回归**
   - 货量远小于柜容积；
   - 断言货物仍从原点连续生长，允许门端/侧壁的合法 L 形余量；
   - 不允许为了追求表面铺满而把货物散到远端。

### 真实夹具和性能

- 越南 20GP quantity/volume：包络填充不低于当前合同，地面空格不回退，几何为绿；
- 越南 40HQ quantity/volume：件数和利用率不低于当前冻结门槛，内部槽指标下降；
- 0824 快照：记录 placed、utilization、internal_notch、external_residual、最大槽位置和计算耗时；
- 固定随机种子跑多组多 SKU 负载，防止只针对一个快照过拟合；
- 20GP quantity 保持交互时间预算，超过预算时先缩减 lookahead 宽度，不得直接删除评分。

### 浏览器/人工

自动装箱流程跑 `npm run test:e2e`。人工检查：

- 3D 轴测、顶视和分层视图中，货物内部不出现封闭夹缝；
- 上层残余若仍存在，应明确位于门端/侧壁/顶部，而不是两组货物之间形成长槽；
- 标签、朝向、分层、明细和导出仍引用同一个 `PackingResult`。

## 执行顺序

1. 写 0824 快照回归和最小候选评分 RED 测试。
2. 扩展 `bestBlocksForSpace` 的有限候选前沿，保持候选数量上限。
3. 实现一步 `splitEMS` 剩余质量评分，先让最小回归通过。
4. 调整 quantity/volume 的接近窗口和稳定排序，保留数量/体积主目标。
5. 运行 20GP、40HQ、固定种子和 0824 快照，先报告完整 diff，不改旧断言凑绿。
6. 如残件阶段仍制造独立槽，再另开子任务；本计划不混入第二个根因。
7. 更新 `decision.md`、`CHANGELOG.md` 和发布说明；按仓库流程执行完整门禁和部署前回归。

## 提交粒度

1. `test(packing): capture 0824 upper-gap regression`
2. `feat(packing): retain compact block candidate frontier`
3. `fix(packing): score one-step remaining EMS quality`
4. `test(packing): verify 0824 and fixture compactness contracts`
5. `docs: record upper-gap packing resolution`

每个提交只包含本步骤相关文件。提交前检查 `git status --short`，保留用户已有的 `issues/0824/` 现场文件，不将其混入实现提交。

## 风险与回归门槛

- 候选前沿扩大可能导致 20GP/40HQ 计算变慢；必须有候选上限、lookahead 宽度上限和耗时测量。
- quantity 主目标与紧凑性存在冲突；不能用“绝对无外部余量”替代业务目标，所有件数变化须报告并由产品确认。
- 一步评分可能改变大量坐标和 `workStep`；先比较几何/件数/利用率/分层/支撑差异，再决定是否更新 golden。
- 不得通过提高支撑阈值、删除失败夹具、弱化内部槽断言或强制单一朝向来获得绿色结果。
- 当前 `issues/0824` 文件未纳入 Git；计划只引用它作为诊断夹具，不能假设生产环境可直接读取该路径。

## 必跑命令

```text
npx vitest run src/lib/packing.compactness.test.ts --pool=threads --maxWorkers=1
npx vitest run src/lib/packing.blockEngine.test.ts src/lib/packing.stackfill.test.ts --pool=threads --maxWorkers=1
npm run lint
npm test
npm run build
npm run test:e2e
```

任何门禁失败都必须写入 `decision.md`，保留失败名称、输出和影响范围，不得宣称全绿。
