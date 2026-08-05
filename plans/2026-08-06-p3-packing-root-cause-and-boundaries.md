# 2026-08-06 第三阶段：装箱根因修复与边界收口

- 前置：`plans/2026-08-04-p1-production-safety-and-0802-redeploy.md` 与 `plans/2026-08-05-p2-test-and-gate-integrity.md` 全部完成并验证。
- 依据：`issues/2026-08-04-refactor-review-full-audit-round-5.md` 的 `B-2`（quickPlace 漏传 groundOnly）、`M-1`～`M-8`、`M-10`、`M-12`，以及 Minor 表的 `m1`/`m2`/`m3`/`m4`/`m5`/`m13`/`m17`/`m18`/`m19`。

  **ID 说明**：审查记录用 `B-n`（Blocker）、`M-n`（Major）、`m-n`（Minor 表格）三套编号，大小写承载不同含义，引用时不要混。本文件各任务正文的 `file:line` 与描述是自洽的，即使 ID 对不上也应以正文为准。
- 顺序理由：本阶段每一条修复的验收都依赖第二阶段建立的守恒断言、独立几何重算与具名支撑率用例。在那之前动算法，「修好了」与「断言改松了」无法区分。

## 证据等级说明（执行前必读）

第五轮审查的 15 个 agent 中，**C 维度与 E 维度的对抗复核因网关错误失败**。因此：

- E1～E8、C1～C4 的行号与推理链由架构师在审查后逐条亲自复核（`quickPlace.ts:95-110` 漏传 `groundOnly`、0629 断言删除均已当面确认），但**未经独立第二方复核**。
- 其余条目（B/D/F/G 维度）均经过对抗复核，其中 3 条初判被推翻。
- **执行纪律**：本阶段每个任务都必须先写一个会红的测试来证伪该缺陷存在，再动实现。如果测试写不出来或写出来是绿的，说明该条判断有误——立即停下记入 `decision.md`，不要按计划硬改。

---

## 组一：装箱根因（必须一起做，分开会互相掩盖）

E2、E3、E4 与 Blocker E1 同属一个主题：策略选择由一个错误代理驱动、gate 用整批最短箱算界、`groundOnly` 在两处被漏掉。逐条单改会让效果互相抵消，无法判断哪一条起了作用。

### 任务 P3-1：先固化当前行为基线（不改实现）

- 意图：在动任何算法之前，把「当前输入 → 当前输出」固化成可复跑的对照表，作为后续每一步的量化依据。
- 需要固化的变体（同一份 0802 fixture `test-data/json/0802/input.json`，28 SKU / 877 箱）：
  - 原样（全 `maxStackLayers: 99`，一个 `groundOnly` SKU 28 箱）→ 记录 gate 结果与 `placedCount`。
  - 全部 `maxStackLayers: undefined` → 记录 gate 与 `placedCount`。
  - 任一 SKU 的 `maxStackLayers` 改为 10、12、13 → 分别记录 gate 与 `placedCount`（验证 E3 的「填 ≤12 即整批退回」）。
  - 一个 SKU 尺寸超柜长 → 记录 gate（验证 E7 的 `minimumFittingHeight` 返回 0 使整批退出）。
- 边界：只读运行，把对照表写入 `decision.md`。不改 fixture、不改实现。
- 验证标准：对照表中每一行都标注 gate 真/假、`placedCount`、`unplaced` 数与 reasonCode 分布。E3 预期能观察到「某 SKU 填 12 → gate 变 false → placedCount 显著下降」；若观察不到，E3 判断有误，记入 `decision.md` 并调整后续任务范围。
- 提交：`docs: record 0802 block-route sensitivity baseline`。

### 任务 P3-2：修正「受容量约束」的判据（E2 根因）

- 根因：`src/lib/packing.ts:436` 取 `stackCapacity(item)`，`:465` 用 `Number.isFinite(capacity)` 判断是否进入「有限容量」分支。而 `src/lib/stackCapacity.ts:23` 使任何显式正数（含 99）都是有限值。两个分支的主排序项方向**完全相反**：`:466-477` 有限分支为 `(container.height - point.z) * L * W`（z 越高越优）且除首箱外强罚地面（`:466-468` 的 `limitedCapacityFloorPenalty`）；`:495-497` 无限分支为 `point.x * W * H + point.y * H + point.z`（z 越低越优）。
- 后果：用户填 99 的语义是「不限制」，系统理解为「受约束」并翻转放置策略。这是 issues/0802 里 860/858/873/877 四个数字互相打不通的机制来源。
- 意图与边界：
  - 把判据从「`maxStackLayers` 是否有限」改为「该约束对本批输入是否 binding」——即该 SKU 的容量上限是否小于其在当前柜内物理可达的层数。不 binding 时走与 `undefined` 相同的分支。
  - 复用 `minimumFittingHeight` 的现有逻辑判断物理可达层数，不要新增第二套高度计算。
  - 不改两个分支各自的评分公式，只改「走哪个分支」的判断。
  - 不清洗、不归一化用户的 `maxStackLayers` 值——它必须继续被 `canPlace` 与 `blocks.ts` 消费。
- 验证标准（可断言）：
  - 核心断言：同一份输入的 `maxStackLayers: 99` 变体与 `undefined` 变体，`placedCount` 差值必须为 0。
  - **但这不是物理必然，不要把它写成无路可走的硬断言**：`src/lib/packing.ts:915/919` 的排序用 `stackCapacity(b.item) - stackCapacity(a.item)`，全 99 时差值恒为 `0`，而全 `undefined` 时是 `Infinity - Infinity = NaN`，比较器返回 NaN 属未定义行为（V8 实际按「不大于 0」处理，两边通常仍稳定）。若修复后仍有残余差值，允许的出口是：以 P3-1 实测差值为基准，确认差值来源是 tie-break 顺序而非策略分支，记入 `decision.md` 后接受。不允许的是放宽成 `>=` 或删掉该断言。
  - 若 P3-1 的变体表里出现 99 与 `undefined` **混合**的输入，排序差异是真实的，该组合不适用本断言。
  - 新增用例：`maxStackLayers: 2` 且物理可达 13 层时，必须仍走有限分支，且结果中该 SKU 无任何箱体的堆叠层数超过 2。
  - 五个既有夹具的 golden hash 若发生变化，必须逐个说明变化原因并确认 `placedCount` 未下降；按 P2-4 的门禁，数量回退会被脚本拒绝。
- 提交：`fix(packing): treat non-binding stack limits as unlimited`。

### 任务 P3-3：让 gate 逐 SKU 决策而非整批二元开关（E3、E7）

- 根因：`src/lib/packing.ts:873-881` 的 `shouldUseBlockEngine` 用 `Math.min(...fittingHeights)`（整批最矮箱）算出单一 `conservativeMaxPhysicalLayers`，再要求**每个** SKU 的 `maxStackLayers` 都 ≥ 该值。0802 中 210mm 的矮箱把界抬到 13，于是任何一个 SKU 填 ≤12 就让全批 28 个 SKU 一起退回旧路径。`:614-624` 的 `minimumFittingHeight` 对超尺寸 SKU 返回 0，经 `:874` 使整批退出。
- 意图与边界：
  - 界应按 SKU 自身可达层数计算，而非整批共享最矮箱的界。
  - 超尺寸 SKU 应被单独判 `exceeds-dimensions`，不应让整批退出块引擎。
  - 若确实需要保留「整批同质才走块路径」的保守策略（`decision.md:713-719` 记录过无条件放宽曾导致回归），则必须在诊断中输出「因某 SKU 的设置导致整批切换算法」的可见信息，不能静默。此项二选一，需在 `decision.md` 记录选择理由。
  - 不放宽 `groundOnly` / `stackable` / SKU 数 / 总量四项既有门槛。
- 验证标准：
  - P3-1 对照表中「某 SKU 填 12 → placedCount 下降」的行，修复后必须不再下降（或下降幅度有明确的物理解释）。
  - 新增 gate 表用例：一个 SKU 填 10、其余 99，断言 gate 结果与该 SKU 自身可达层数的关系，而非与整批最矮箱的关系。
  - 超尺寸 SKU 用例：该 SKU 进入 `unplaced` 且 `reasonCode === EXCEEDS_DIMENSIONS`，其余 SKU 仍走块路径。
  - 既有 gate 表（`src/lib/packing.blockEngine.test.ts:127-152`）中**有一例必须被改写，不是必须通过**：`'mixed 300mm height raises whole-load bound to eight'`（`:151`，输入 `items[0]` 带 `maxStackLayers: 4` + `items[1]` 高 300，期望 `false`）。它的用例名本身就编码了「整批共享界」这个本任务要废除的语义 —— 整批界 `ceil(2400/300) = 8`，`4 < 8` 故 false；改成逐 SKU 后 `items[0]` 自身界 `ceil(2400/600) = 4`，`4 >= 4` 故 **true**。
  - **这是本计划唯一授权修改既有断言的地方**，因为它锁定的是被判定为错误的旧语义。要求：改用例名与期望值以反映逐 SKU 语义（不要删除用例），并在 `decision.md` 记录旧语义、新语义与改动理由。除此之外的 14 例必须仍通过；若还有其他用例变红，停下记 `decision.md`，不要继续改断言。
  - 注意 `6c4576f` 刚修正了 one-SKU 用例的隔离性（改为单 SKU quantity 100，与 `<100` 门槛解耦），不要回退该修正。
- 提交：`fix(packing): scope block-route eligibility per SKU`。

### 任务 P3-4：补齐 groundOnly 在两处的缺失（Blocker E1 + E4）

- 根因一（Blocker）：`src/lib/quickPlace.ts:95-110` 的 `makeCandidateBox` 传了 `stackable` 与 `maxStackLayers`，**未传 `groundOnly`** → `src/lib/manualPlacement.ts:828` 写入 `undefined` → `src/lib/stackCapacity.ts:55` 的 `if (current.groundOnly && currentLayer > 1)` 永不触发 → `:146` 的 `validateDraft` 放行。提交后 `src/lib/manualPlacementSession.ts:60` 把 `true` 写回，下一帧该箱变 error。对照：拖拽路径 `src/hooks/useManualPlacementSession.ts:355-359` 是完整的。`src/lib/quickPlace.test.ts` 中 `groundOnly` 出现 0 次。
- 根因二：`src/lib/packing.ts:1142` 的 fallback 只取 `nonGroundStates`，块阶段未放完的 `groundOnly` 货物在 `:1177-1188` 直接判 `no-space`。而 `canPlace:205` 本身已强制 `groundOnly` 只能落地，`:1154` 的 `canUseTopSurfacePoints` 对 `groundOnly` 返回 false——所以这个排除是纯防御性的，只会少装货。`placeBlocks` 还可能在 `:1127` 因 `rejectionsSinceCommit >= 40`（`:73`）提前退出，此时地面可能仍有碎片空间。
- 意图与边界：
  - `quickPlace` 补传 `groundOnly`。这是一行修复，但必须先有会红的测试。
  - fallback 恢复包含 `groundOnly` 状态。合法性由 `canPlace` 保证，无需额外防御。
  - 不改 `MAX_BLOCK_REJECTIONS_PER_STEP` 的值——它是独立的性能保护，若要调整需单独任务与 benchmark 证据。
- 验证标准（可断言）：
  - `quickPlace` RED 用例：`groundOnly: true` 的 cargo + 地面已铺满的 draft，调用 `quickPlaceCargo`。**注意 `src/lib/quickPlace.ts:152` 在失败时返回 `box: null`**，所以不能无条件访问 `box.groundOnly`（会抛 TypeError 而不是给出有效 RED）。断言写成分支形式：
    - `result.ok === true` 时：断言 `result.box.groundOnly === true` 且 `result.box.z === 0`。
    - `result.ok === false` 时：断言 `result.reason === 'no-space'`。
  - 修复前的 RED 形态应是「`ok: true` 且 `box.z > 0`」（即系统把只能落地的货物放到了高层并声称成功）。若观察到的不是这个形态，说明 B-2 的判断有误，停下记 `decision.md`。
  - fallback 用例：构造 `groundOnly` 数量较多、块候选在 EMS 中易失败的输入，断言修复后 `groundOnly` 的 `placedCount` 不低于修复前，且所有 `groundOnly` 箱体 `z === 0`。
  - 0802 fixture 回归：`groundOnly` 28/28 仍全部 `z === 0`，`placedCount` 不低于 877。
  - 0629 回归：P2-1 补回的 `unplaced` 契约仍成立（label C 仍应有 `no-space`，若本修复使其全部装下，需在 `decision.md` 说明并更新该断言——但必须是因为真的装下了，而非断言被放宽）。
- 提交：分两个：`fix(manual): pass groundOnly through quick-place` 与 `fix(packing): include ground-only cargo in block fallback`。

### 任务 P3-5：统一支撑率来源（E5）

- 根因：`src/lib/packing.ts:345` 的 `0.5` 是字面量，`CalculatePackingOptions`（`:36-39`）没有接收 `supportPolicy` 的通道；手动侧 `src/lib/manualPlacement.ts:591-601` 用 `supportPolicy.minSupportRatio`，`src/components/PackingSidebar.tsx:257-266` 提供 0-100 输入框。
- 后果：用户把最小支撑率调到 80% 后跑自动装柜，切手动模式瞬间一批**系统自己算出来的**箱子变 blocking floating error，无法继续操作。这是 `CLAUDE.md` 第 7 条点名的两套规则同时生效。
- 意图与边界：
  - 让自动路径接收同一个 `supportPolicy`，默认值保持 0.5 以不改变既有 golden。
  - 这是行为变更的入口：用户调高阈值后自动结果会变化（装得更少但更稳），必须在 UI 上可解释。是否需要提示由架构师与用户确认后再定，本任务先打通数据通道。
  - 不改 `supportPolicy` 的归一化范围（`src/lib/placementSettings.ts` 的 0..1 clamp）。
- 验证标准：
  - 默认 0.5 时五个夹具的 golden hash 完全不变（证明打通通道未改变默认行为）。
  - 新增用例：`minSupportRatio: 0.8` 时自动结果中不存在支撑率介于 0.5~0.8 的箱体。
  - 新增用例：自动结果灌入手动草稿后，用同一 `supportPolicy` 校验必须零 blocking issue。这条直接编码用户遇到的场景。
  - **前置改动（本任务授权）**：`draftFromAutomaticResult` 当前定义在 `src/hooks/useManualPlacementSession.ts:160`，是模块私有函数、未 export，单测无法调用。允许把它下移到 `src/lib/`（更符合 `CLAUDE.md`「业务逻辑进 lib」的约定，优先选这个）或显式 export。下移时同步更新 hook 的 import，不改其行为。
- 提交：`fix(packing): share support policy between automatic and manual paths`。

---

## 组二：状态机与契约破口

以下三条来自 C 维度（未经对抗复核，C2 原报告标为 likely）。每条都必须先写会红的测试。

### 任务 P3-6：手动 draft 的 label/color 参与对账（C2）

- 根因：`ManualCargoPlanItem`（`src/lib/manualPlacementSession.ts:12-23`）只含 id/quantity/weight/尺寸/canRotate/stackable/maxStackLayers/groundOnly，**不含 label 与 color**；`syncBoxGeometry`（`:56-116`）也不同步这两个字段。而 `src/lib/manualSteps.ts` 的 `enrichPlacedBoxes` 会用 cargo 覆盖 `placed` 的 label/color，`src/lib/historySnapshot.ts:203-210` 又强制 `manualDraft` 与 `placed` 逐字段相等（字段表含 label、color）。
- 用户可见后果：手动模式摆好箱子后回侧边栏改货物标签或颜色（或触发 `normalizeCargoLabelColors` 的同标签配色统一），保存方案必抛 `history.manualDraft <id>.label must match packingResult.placed`，整套手动布局无法保存，错误文案完全指不到「改了标签」。
- 验证标准：
  - RED 用例：手动 commit 一个 draft → 用改过 label 的 `cargoItems` 调 `buildManualPackingResult` → 把原 draft 与该 placed 一起传给 `buildHistorySnapshot`，断言抛出上述错误。修复前必须红（这一步同时把 C2 从 likely 升为 confirmed；若不红则 C2 判断有误）。
  - GREEN 后：同一流程能成功保存，且恢复该方案后 label/color 与保存时一致。
- 提交：`fix(manual): sync label and color into draft reconciliation`。

### 任务 P3-7：自定义柜型编辑后使结果失效（C1 + C4）

- 根因：`src/Workbench.tsx:1892-1895` 的对话框 `onClose` 只调 `fetchCustomContainers()` 刷新列表 state，不 dispatch `containerChanged`；`selectedContainer` 取自 `containerSnapshots`（`:399`）。只有 `onSelect` 分支才走 `changeSelectedContainer`。
- 用户可见后果：选中自定义柜型 → 改长度 12000→13000 → 保存关闭。侧边栏显示 13000，但装箱、3D、导出 Excel 全部用 12000，且无失效提示。
- 关联（C4）：`src/lib/packingSession.ts:44` 定义了 `resultInvalidated` action 并有单测（`packingSession.test.ts:207,227`），但 Workbench 的 14 处 dispatch 无一使用——失效契约的逃生口是死代码。
- 意图与边界：本修复应**使用** `resultInvalidated`，而不是再加一个 UI state 或绕过状态机。这同时把 C4 的死代码激活。
- 验证标准：
  - RED 用例（reducer 层）：编辑当前选中柜型后 dispatch `resultInvalidated`，断言 `automaticResult === null` 且 `inputRevision` 递增。
  - E2E 或手工验证：改柜长后侧边栏与装箱结果一致，或出现明确的「需重新计算」提示。
  - 不影响未选中柜型被编辑的情形（不应无故失效）。
- 提交：`fix(container): invalidate result when the selected custom container changes`。

### 任务 P3-8：非法箱体不得计入统计（C3）

- 根因：`src/lib/manualPlacement.ts:840-844` 的 `toPlacedBoxes` 用 `void invalidBoxIds` 显式弃用参数，而调用处 `src/hooks/useManualPlacementSession.ts:262-265` 仍在传 `blockingInvalidBoxIds`。这些箱体原样进入 `buildManualPackingResult` → `finalizePlacementGeometry` → `placed` / `layers` / `usedVolume` / `placedCount`。
- 用户可见后果：手动模式改大某货物尺寸后，reconcile 把已有箱体放大到越界或重叠，工作台顶部的「已装 N 件 / 体积利用率 X%」、分层视图、明细表、装柜步骤全部把非法箱算进去。保存与导出被 `planCompliance` 拦住所以不落库，但屏幕上的「还能再装多少」是错的。
- 关联（E8）：`src/lib/finalizePackingResult.ts:46-51` 把 z>0 且无支撑的箱标为 `physicalLayer 1`，`src/lib/layers.ts:100-101` 会把它与地面箱混层并把该层 `maxZ` 撑到 2000+，作业指导书上表现为第一层要装到 2 米。同一批非法箱体导致，一并处理。
- 意图与边界：
  - **默认语义（已定，不需要再确认）：保留箱体在 `placed` 中，但显式标记，让统计口径把它们排除。** 理由：用户正在编辑这些箱子，直接从 `placed` 移除会让它们在 3D 里凭空消失，比数字错更难理解。若实现中发现「保留 + 标记」需要改动的视图面过大（超过 3 个消费点），可改为排除出 `placed`，但必须在 `decision.md` 记录改变理由与实测的视图影响面。
  - 建议的标记方式：在 `PlacedBox` 上加一个布尔字段（例如 `blockingInvalid`），由 `toPlacedBoxes` 依据 `invalidBoxIds` 写入；`placedCount` / `usedVolume` / `labelStats` / `layers` 的聚合口径跳过被标记的箱体。字段名与落点由 Codex 决定，但必须让 canonical 契约（`src/lib/packingContract.ts`）与历史快照校验（`src/lib/historySnapshot.ts` + `server/historySnapshot.mjs`）同步接受该字段——**两端都要改，漏一端会导致手动方案无法保存**。
  - 不改 `planCompliance` 的拦截逻辑（它是对的）。
- 验证标准：
  - RED 用例：摆两个不重叠箱 → 把 cargoPlan 的 length 放大到必然重叠 → 断言 `placedCount` / `usedVolume` 不再把非法箱计入。修复前必须红。
  - 前后端 parity：加了新字段后，`npx vitest run src/lib/historySnapshot.test.ts` 与 `node --test scripts/historySnapshot.server.test.mjs`（或既有的 server parity 命令）必须都通过；手动模式保存并恢复一次方案的 E2E 必须通过。
  - E8 用例：把一个箱拖到空中（z>0 无支撑），断言分层视图不把它归入第 1 层、且该层 `maxZ` 不被撑开。
  - 若 P2 阶段新增的数量守恒断言与本任务的统计口径变更冲突（被标记的箱既不在 placed 计数也不在 unplaced），必须同步更新守恒断言的定义并在 `decision.md` 说明——这是预期的口径演进，不算放宽断言。
- 提交：`fix(manual): exclude blocking-invalid boxes from result statistics`。

---

## 组三：边界收口（低风险，可穿插）

### 任务 P3-9：两处方向性破损（B3、B6）

- `src/lib/importWorkflow.ts:2` 与 `src/lib/importWorkflow.test.ts:13` 都从 `../components/ImportMappingForm` 取 `ImportMappingValue`（定义在 `ImportMappingForm.tsx:8`，实为导入解析业务契约而非表单样式状态）。把该类型下移到 `src/lib/`，组件反向 import。**两个文件都要改**，只改实现文件会留着这条边。
- `src/components/containerScene/rendering.ts:21` 反向 import `ContainerScene.tsx` 的 `SceneViewMode` 形成 type-only 环；`rendering.ts:23-25` 的注释已标明这是迁移残留、方向明确。把该类型下移到 `rendering.ts`。
- 验证标准：`npx tsc --noEmit` 通过；`src/lib/` 下 grep 无任何 `from '../components/`。
- 提交：`refactor(lib): move import mapping and scene view types out of components`。

### 任务 P3-10：放置合法性单一化（B4）

- 根因：`src/components/ContainerScene.tsx:426-450` 的 `computeInvalidByGeometry` 自实现越界/重叠/支撑率判定（缺 ground-only 与 max-stack-layers 两条规则），`:683-698` 在判定 invalid 时直接 `onManualOperationRejected` 而不调 `onManualMove`——是一道会拦下提交的硬闸。它遍历的 `meshEntries` 来自 `VisualizationWorkspace.tsx:489` 的 `visibleManualBoxes`，而 `src/Workbench.tsx:773-776` 在 `activeResultTab === 'playback'` 时把它裁成子集。手工场景与结果页签在同一次 render 并列输出（`:1668` / `:1740`），互不卸载。
- 后果：手动模式下把结果区切到「回放」并拖游标，可编辑场景就对着不完整世界判重叠。两条路径的反馈通道也不一致：场景侧只落到 `manualNotice`（`:753-757` 五秒后清除、不写 issues），hook 侧 `validateBox` 的结果进 issues/`blockingInvalidBoxIds` 可回溯。
- 依赖：本任务应在 P3-11 之后做——先把 `visibleManualBoxes` 的裁剪逻辑收进 workspace，这一条会自然变简单。
- 验证标准：
  - 场景侧改为调用 `lib/manualPlacement` 的同一套规则；场景侧驳回也写进 issues 而非只弹 toast。
  - 手工验证：手动模式 + 结果区切「回放」拖游标 → 拖一个可见箱到隐藏箱位置，行为必须与非回放状态一致。
  - `npm run test:e2e` 的手动 3D 用例全部通过。
- 提交：`refactor(scene): delegate placement validity to manual placement rules`。

### 任务 P3-11：视觉状态下移与 2D/3D 漂移修正（A1、B2、B5、B8）

- 根因：`src/Workbench.tsx` 1929 行、50 个 useState（其中至少 14 个是纯视觉状态：`:275` activeLayerId、`:276` activeLabelId、`:277` workspaceView、`:278` sceneViewMode、`:283` clearanceEnabled、`:284` hoverInfo、`:285` poolDragInfo、`:286` workspaceMaximized、`:287` resetViewTick、`:289` showCogOverlay、`:291` planViewMode、`:292` activeResultTab、`:293` activeLoadingGroupIndex、`:294` loadingGroupsPlaying），props 68/62/48。验收线见 `plans/2026-07-30-refactor-review-round-3-remediation.md:244`（≤1500 行、props ≤25）。
- 已实际发生的漂移：`src/lib/boxVisualState.ts:8-32` 有三档不透明度（active=1 / 选中特定层时其余层 0.09 / general 0.22），3D 经 `rendering.applyBoxVisualState` 走 lib 版，而 `src/components/ContainerPlan2D.tsx:72-78` 自己写了两档（0.88 / 0.18），**缺「选中某层时其余层更淡」这一档**——同一个「选中第 2 层」操作在 2D 与 3D 的视觉强弱不一致。
- 具体耦合样本：`activeResultTab` 名义上是视觉 tab，实际同时驱动 `:813` 的 3D 重心 overlay 与 `:834` 的柜型对比计算，而这条耦合在两个区域组件的接口上完全不可见。
- 模式双来源：`src/Workbench.tsx:482` 把自己的 `placementMode` 喂给 hook，而 `activeResult` 用 hook 内部的 `state.mode` 选（`src/hooks/useManualPlacementSession.ts:271`）。ResultsPanel/明细/导出吃前者派生的数组，3D/2D 分支吃后者。
- **刀数切分（必须按此拆，每刀独立 commit，不得合并成一次大重构）**：
  - **刀 1**：只搬纯视觉且无跨区消费的 state —— `sceneViewMode`、`workspaceView`、`clearanceEnabled`、`showCogOverlay`、`planViewMode`、`resetViewTick`、`workspaceMaximized`。这批只被 `VisualizationWorkspace` 自己用，风险最低，先建立「视觉状态归 workspace」的样板。
  - **刀 2**：只做 `ContainerPlan2D` 改用 `src/lib/boxVisualState.ts`，消掉三档 vs 两档漂移。这一刀不搬任何 state，纯粹替换实现，可独立验证。
  - **刀 3**：只搬 `visibleAutoBoxes` / `visibleManualBoxes` 的派生逻辑（`src/Workbench.tsx:769-776`）。这一刀是 P3-10 的前置。
  - **刀 4**：只收敛 `placementMode` 到单一来源（`useManualPlacementSession` 的 `state.mode`）。
  - **刀 5（可选，风险最高，可推迟到下一轮）**：`activeLayerId` / `activeLabelId` / `activeResultTab` —— 这三个被 ResultsPanel 与 3D 双向消费，`activeResultTab` 还驱动 `:813` 的 3D overlay 与 `:834` 的对比计算。若刀 1-4 之后 props 数已明显下降，这一刀可以留到下轮，在 `decision.md` 说明即可。
- 意图与边界：
  - 视觉状态与 `visibleAutoBoxes` / `visibleManualBoxes` 的派生逻辑下移到 `VisualizationWorkspace`。
  - `ContainerPlan2D` 改用 `src/lib/boxVisualState.ts`，消掉三档 vs 两档的漂移。
  - `placementMode` 收敛到单一来源。
  - **不以行数为目标**。每一刀必须消除一种职责混合，并保持 `activeResult` / `planCompliance` 单一输入。不为凑 props 数引入全局 Context。
  - 保持现有 test id 与 E2E 用户流程不变。
  - `src/Workbench.sessionBoundary.test.ts` 有 112 处源码文本断言（`:179-180` 连换行缩进都断言），重排代码会红。这些断言是拦住 `setCargoItems` 回流的有效护栏，**不要因为它红了就删**——更新它以匹配新结构，或改为等价的行为断言。
- 验证标准：
  - 2D 与 3D 在同一「选中第 2 层」操作下的不透明度档位一致（可对 `boxVisualState` 写单测锁定，并在 2D 组件测试中断言其调用）。
  - `activeResultTab` 不再直接驱动 3D overlay 与对比计算，或该耦合在接口上显式可见。
  - 每刀之后 `npm run test:e2e` 零失败零跳过；`npm run benchmark` 的 3D 首像素与 resize 指标不回退（基线已在 P2-5 收紧）。
- 提交：按刀分开，每刀独立 commit。

### 任务 P3-12：后端校验与依赖卫生（G10、G5、G6）

- `server/index.mjs:127-144` 的 `POST /api/containers/custom` 只做 falsy 检查后原样绑定入库，`length: -5000` 或 `'1e400'` 可入库并经 GET 直接进前端柜型列表喂给 `calculatePacking`。对照 `custom_cargo` 走 `server/customCargo.mjs:1-10` 的 `positiveNumber`，`import_templates` 走 `index.mjs:260-308` 的 `parseTemplatePayload`。同一份代码三套校验强度。
- 四张表（`custom_containers` / `custom_cargo` / `import_templates` / `export_templates`）没有每用户行数上限，只有 `history_plans` 有（`historyRoutes.mjs:69` 保留 5 条）。
- `package.json:21-42` 把 `playwright` / `vitest` / `jsdom` / `@testing-library` 放在 `dependencies`；`cookie-parser` 是死依赖（全仓 grep 无 import）；只有 `jspdf` 精确锁版本。注意：`scripts/deploy.mjs` 不自动装依赖，风险取决于运维是否在 `/opt/cargo-server` 手工 `npm install`。
- 写操作失败绕过 `workbenchCopy` 用组件内三元 alert：`CargoLibraryPage.tsx:140/157`、`TemplateManagerPage.tsx:276/297/315/336/357/375`、`CargoImportDialog.tsx:281`、`CustomContainerDialog.tsx:84/88`（这两处只有中文，英文环境弹中文）、`Workbench.tsx:1190/1353/1360`。
### 本任务拆为三个独立子任务，各自有可断言标准

**P3-12a：柜型 payload 校验（做）**
- 复用 `server/customCargo.mjs:1-10` 的 `positiveNumber` 风格，不新造第四套校验。
- 验证标准（新增 server 端单测）：`length: -5000` 被拒绝返回 400；`length: '1e400'` 被拒绝；`length: 0` 被拒绝；`name` 超长被截断或拒绝（选一种并写进测试）；合法 payload 仍能入库并出现在 `GET /api/containers/custom`。
- 提交：`fix(server): validate custom container payloads`。

**P3-12b：写操作失败文案接入 i18n（做）**
- 只做 `CustomContainerDialog.tsx:84/88` 这两处——它们是**纯中文硬编码，英文环境会弹中文**，属可见 i18n 缺陷。
- 其余 alert 点（`CargoLibraryPage.tsx:140/157`、`TemplateManagerPage.tsx` 六处、`CargoImportDialog.tsx:281`、`Workbench.tsx:1190/1353/1360`）是「文案分散」而非功能缺陷，**本轮不动**，在 `decision.md` 记为已知一致性债务，避免下轮审查重复发现。
- 验证标准：英文 locale 下这两处失败提示为英文；`npm run lint` 通过。
- 提交：`fix(i18n): localize custom container dialog failure messages`。

**P3-12c：每用户行数上限与依赖卫生（本轮不做，只记录）**
- 四张表（`custom_containers` / `custom_cargo` / `import_templates` / `export_templates`）无每用户上限：单独看是容量债，且叠加 P1-2 修好 testuser 后已无匿名可利用身份，优先级下降。
- `package.json` 把 `playwright` / `vitest` / `jsdom` / `@testing-library` 放在 `dependencies`、`cookie-parser` 是死依赖：搬迁会影响生产 `npm install` 行为，而 `scripts/deploy.mjs` 不自动装依赖，**需先确认 `/opt/cargo-server` 的实际安装方式**再动，本轮不动。
- 本子任务的唯一交付：在 `decision.md` 记录这两项为已知债务、附本段理由与前置条件。不写代码。
- 提交：`docs: record deferred backend quota and dependency debts`。

### 任务 P3-13：收口三条未被前述任务覆盖的审查条目（m1 / m2 / m16）

这三条在第五轮审查中均为 CONFIRMED，但不属于前面任何任务的范围。本任务的作用是让它们有明确归属，而不是在下一轮审查里被重复发现。

**P3-13a：历史恢复跨 packing/manual 原子化（m1，做）**
- 根因：`src/Workbench.tsx:1377` 调 `restoreHistory(...)`，紧接 `:1388` / `:1396` 两个分支各自单独调 `restoreHistoryDraft(...)`。`src/lib/packingSession.ts:210-228` 的 `historyRestored` 在 packing session 内部是真原子的（单 action 写完全部字段并对齐 `completedCalculationRequestId` 抑制重算），问题在于跨两个 hook 的顺序由调用方保证。
- 已有的部分缓解（不要当成已解决）：`src/hooks/useManualPlacementSession.ts:248-250` 的 `useLayoutEffect` 会在 cargoPlan 变化时 reconcile，把不在新计划里的 cargoId 箱体丢掉。但新旧快照共享 cargoId 时（同项目多次保存，最常见场景）陈旧坐标会存活，且 `mode`、`draftInitialized`、undo/redo 的 `past`/`future` 都不会被 reconcile 重置。
- 意图与边界：增加一个恢复协调边界，让任意恢复入口只需调用一次即可同时写入 packing 与 manual 两侧的同一 revision。不在 UI 再加第三套状态。
- 验证标准：新增行为测试 —— 构造「新旧快照共享 cargoId 但坐标不同」的恢复，断言恢复后 manual draft 的坐标来自新快照而非旧草稿，且 undo 栈被清空。修复前该测试必须红。
- 提交：`fix(history): restore packing and manual state as one transaction`。

**P3-13b：ContainerScene 有状态模块补测（m2，做测试不做拆分）**
- 事实：`src/components/ContainerScene.tsx` 当前 1350 行，`plans/2026-07-27-containerscene-split.md:146` 的验收线是 ≤600，`7966204` 已把 CHANGELOG 标题从「完成」改为「部分完成」并在 `decision.md` 承认未达成 —— 项目对此偏差的记账是诚实的，本任务不追加行数目标。
- 真实缺口：`rendering.ts` 有 23 个 export，`rendering.test.ts` 只覆盖其中 9 个纯函数；`interactions.ts` 与 `overlays.ts` **零测试文件 import**。也就是说三模块拆分真正想隔离的「有状态部分」（材质缓存命中/失效、gizmo 生命周期、ghost 状态转换、overlay 重建）目前只有 E2E 兜底。
- 意图与边界：只补单测，**不做进一步文件拆分**。拆分留待 P3-11 的视觉状态下移完成后重新评估——那时事件处理器的闭包依赖会减少，拆分成本更低。
- 验证标准：为 `getCachedBoxMaterials` 的缓存命中与失效、gizmo 的 build/dispose 生命周期、ghost 的显示/隐藏状态转换各写至少一个单测；断言 dispose 后不再持有引用（避免 WebGL 资源泄漏）。
- 提交：`test(scene): cover stateful rendering and interaction paths`。

**P3-13c：0802 fixture provenance 的记录方式（m16，改记录方式）**
- 冲突事实：`CHANGELOG.md` 与 `decision.md` 都写 `test-data/json/0802/input.json` 的源头是 `issues/0802/cargo-debug-snapshot(4)(3).json`，但该文件是**用户的未跟踪素材**，而三份计划都明令不得提交它。这使「fixture 忠实复刻用户输入」在干净仓库里永久无法验证。
- 意图与边界：**不提交用户素材**（这条纪律不变）。改为在 fixture 旁记录可验证的 provenance：源文件的 SHA-256、SKU 数、总箱数、关键 flag 分布（`maxStackLayers` 分布、`groundOnly` 的 SKU 与数量）、容器规格。这样即使源文件不在仓库，任何人拿到它都能自行校验是否为同一份输入。
- 验证标准：新增 `test-data/json/0802/provenance.md` 或等价元数据；新增一个测试断言 `input.json` 的 SKU 数、总量、flag 分布与该记录一致（这样 fixture 若被悄悄改动会红）。
- 提交：`docs(fixtures): record verifiable provenance for the 0802 input`。

**明确本轮不做（写入 `decision.md` 避免下轮重复发现）**
- m5：数据获取两套模式（一半页面走 hook、一半组件直连 `src/api`）—— 一致性债，无功能缺陷。
- m13：`quickPlace.ts:136-141` 把承诺朝向做成硬主排序键，而 `packing.ts:390-398` 的注释与 `analysis.md` 都声明是「强惩罚而非硬过滤」。`quickPlace.test.ts:193` 已把更强语义固化为预期，所以这是**有意为之**；真正的问题是两处文档描述了不同语义。本轮只统一注释表述，不改行为。
- m20 / m21 / m22：`debugLogLimiter` 中间件顺序、`HISTORY_JSON_BODY_LIMIT` 全局作用域 —— 均为 info，顺手可改但不单独排期。

---

## 执行顺序

1. **P3-1**（固化基线）→ 必须最先，它决定后面几条是否成立。
2. **P3-2 → P3-3 → P3-4**（装箱根因三连）→ 顺序固定，每步跑一次 P3-1 的对照表。
3. **P3-5**（支撑率统一）→ 独立，可与组二并行。
4. **P3-6 / P3-7 / P3-8**（状态机破口）→ P3-8 已给默认语义（保留并显式标记），无需等待确认。
5. **P3-9**（方向性破损）、**P3-13**（遗留条目收口）→ 随时可做，成本最低。
6. **P3-11 → P3-10**（视觉下移 → 合法性单一化）→ 顺序固定，P3-11 分四刀。
7. **P3-12a / P3-12b**（柜型校验、i18n）→ 独立；**P3-12c** 只写 `decision.md`。

## 提交与验证纪律

- 每个任务独立 commit，先写会红的测试，再改实现。RED 与 GREEN 的实测输出都写入 `decision.md`。
- 每个任务完成后运行针对性测试；组一每一步额外跑五个夹具的契约断言。
- 全部完成后：`npm run lint && npm test && npm run build && npm run test:e2e && npm run benchmark`。
- 涉及装箱算法的任务，golden hash 若变化，必须逐个说明原因；数量回退会被 P2-4 的门禁拒绝，不得用 `--allow-regression` 绕过而不记 decision。
- 工作区既有的 `.serena/project.yml` 与 `issues/0802/` 未跟踪素材一律不得提交。

## 完成标准

- 0802 fixture 的 `maxStackLayers: 99` 与 `undefined` 变体 `placedCount` 相等；任一 SKU 填 ≤12 不再使整批退回旧路径。
- `groundOnly` 在 quick-place 与块 fallback 两处都被正确处理；`quickPlace` 不再返回「先合法后标红」的箱体。
- 自动与手动共用同一 `supportPolicy`；默认 0.5 时 golden 不变。
- 手动模式改 label/color 后能保存；改柜型后结果会失效；非法箱体不再污染统计数字。
- `src/lib/` 无反向依赖 `src/components/`；2D 与 3D 的层选中视觉一致。
- 放置合法性只有一套规则，且驳回可回溯。
- 历史恢复在模型层原子（m1）；`interactions.ts` / `overlays.ts` 有状态部分已有单测（m2）；0802 fixture 有可验证的 provenance 记录（m16）。
- 柜型 payload 校验与 `CustomContainerDialog` i18n 已修；本轮明确不做的条目已写入 `decision.md`。
- 全套单测与 E2E 零失败零跳过；benchmark 不回退。
- 用户原始的两个 0802 反馈在生产上得到验证（依赖 P1 的重新部署）。
