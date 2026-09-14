# 2026-08-07 计划：刀 5 —— 视觉选择状态归属收口

- 前置：第六轮回溯审查 `issues/2026-08-07-refactor-review-round-6-recap.md`，结论是 P3-11 刀 1–4 已落地、**刀 5（三状态归属）** 未做，导致 round-5 M-7 的 `Workbench ≤1500`、`props ≤25` 验收线仍不达成。
- 本任务**是 P3-11 的最后一块**，不是新功能，不改任何用户可见行为。
- 依据：`plans/2026-08-06-p3-packing-root-cause-and-boundaries.md` 任务 P3-11「刀 5（可选，风险最高，可推迟到下一轮）」。本轮把它从「可选/推迟」转为「立项执行」，因为 Review 显示 props ~68 是 M-7 唯一挂起点。

## 根因（按 HEAD `a45f9cb` 核对，三状态各自的双消费链）

- **`activeResultTab`**（`src/Workbench.tsx:293`）：名义上是结果区页签，实际是跨区计算驱动——
  - ResultsPanel 切页签：`src/components/ResultsPanel.tsx:356`；
  - 3D 重心 overlay：`Workbench.tsx:837-843` 的 `cogViewState = deriveCogOverlayState({ activeResultTab, placementMode, overlayEnabled: showCogOverlay })`；
  - 柜型对比：`Workbench.tsx:859-864` 的 `compareRows`（仅当 `activeResultTab === 'compare'`）。
- **`activeLayerId`**（`Workbench.tsx:282`）：除过滤 `visibleBoxes`（`:803-806`）外，还被 `activeLayer`（`:773`）、`activeLayerIndex`（`:1023`）、键盘层导航 `selectLayerByOffset`（`:1429-1441`）、步骤选箱 `selectStepBox`（`:1443-1450`）消费；`ResultsPanel.tsx:362-386` 的层下拉/层按钮也写它。
- **`activeLabelId`**（`Workbench.tsx:283`）：与 `activeLayerId` 一起过滤 `visibleBoxes`，并被 `ResultsPanel.tsx:377` 的标签过滤写入；3D 场景 `ContainerScene` 经 workspace 只消费最终值。

## 意图与边界

**意图**：把三个状态收敛到「归属结果区 ResultsPanel 的一处单一拥有者」，Workbench 不再持有它们；派生计算（`deriveCogOverlayState`、`compareRows`、`visibleBoxes`、`activeLayer`/`activeLayerIndex`）随状态下沉，不再以 props 形式上抛。

**刀序（每刀独立 commit，不合并）**：

- **刀 5a — `activeLayerId` + `activeLabelId`**：
  - 把 `useState` 从 `Workbench.tsx:282-283` 移入 ResultsPanel（或一个供 ResultsPanel 与 workspace 共同订阅的本地 hook；归属 ResultsPanel 侧）。
  - 随之下沉的派生：`visibleBoxes`（`:803-806`）、`activeLayer`（`:773`）、`activeLayerIndex`（`:1023`）。
  - Workbench 保留的接线：`selectLayerByOffset` / `selectStepBox` 是键盘/鼠标交互入口，改为向 ResultsPanel 侧发回调（`onLayerNavigate(offset)` / `onStepBoxSelected(boxId, layerId)`），不持有状态。
  - workspace 侧只继续收 `activeLabelId`/`activeLayerId` 的最终值（`VisualizationWorkspace.tsx:152-153` 的 props 形状不变），但来源变成「Workbench 从 ResultsPanel 侧一次性读当前值透传」，不再并存两处 setState。
- **刀 5b — `activeResultTab`**：
  - 把 `useState` 从 `:293` 移入 ResultsPanel；`ResultsPanel.tsx:356` 的切页签回调改为内部 setState。
  - 随之下沉的派生：`deriveCogOverlayState` 的 `activeResultTab` 输入改为 ResultsPanel 是当前 tab（workspace 只消费最终 `cogViewState`，不消费 tab 本身——这是本计划最关键的「接口可见化」）；`compareRows`（`:859-864`）整体下沉 ResultsPanel（它只在 `compare` tab 内被消费）。
  - `Workbench.tsx:1168/1186/1193/1200/1802` 里「导入失败自动跳 importLog」的 setActiveResultTab 改为「通知 ResultsPanel 唤起 importLog」的一次性回调（事件，不是共享 state）。
  - `activateNav` 里 `setActiveResultTab('layers')`（`:1456`）同样改为事件回调。
- **不换方向**：不把这三个状态放进 React Context / Zustand 等全局仓；只在 ResultsPanel（拥有）与 Workbench（发起事件）/ workspace（消费最终值）之间以回调+只读值流动。理由是 `CLAUDE.md` 规则 2（最简单实现）与规则 7（不引入"以后再换"的临时全局）。

**不改什么**：
- 不合并 `visibleAutoBoxes` / `visibleManualBoxes` 的已有 `deriveVisibleWorkspaceBoxes`（`src/lib/visibleWorkspaceBoxes.ts`，P3-11 刀 3 的成果，保持）。
- 不动 `deriveCogOverlayState` / `compareContainers` / `buildPlaybackSequence` 的函数本体，只改「调用点在哪」。
- 不动 `ContainerScene` 内部；刀 5 不做文件拆分（承接 round-5 m2 的决定，拆分与否留待 P3-13b 单测补齐后再评估）。

## 模块划分

| 文件 | 变化 |
|---|---|
| `src/Workbench.tsx` | 删除 `activeLayerId` / `activeLabelId` / `activeResultTab` 三个 useState；删除下沉的派生 useMemo；改为接收 ResultsPanel 暴露的回调/当前值。预期由 1908 行降到接近 1500 行量级（**以行数为目标；本任务只按职责是否消失验收，行数是结果**）。|
| `src/components/ResultsPanel.tsx` | 新增三状态的 useState 与其相关派生（`compareRows`、`visibleBoxes`、`activeLayer`、`activeLayerIndex`、层/标签写回）；按上述回调签名暴露给 Workbench。|
| `src/components/VisualizationWorkspace.tsx` | props 表去掉 `cogViewState`（若被下沉）或改收更窄的「3D 重心 overlay 所需的最小输入」；其余场景 props 保持，只换来源。|
| `src/Workbench.sessionBoundary.test.ts` | 重构后**预期要红**——该测试有 112 处源码文本断言（含换行缩进），更新为「断掉 setCargoItems 回流」等效行为断言，**不删测试**（原则沿用 P3-11 `plans/2026-08-06` 的纪律）。|

## 验证标准（可断言）

1. **结构断言（替代旧的文本围栏）**：更新 `src/Workbench.sessionBoundary.test.ts`——
   - Workbench 源中不得出现 `useState.*activeLayerId` / `useState.*activeLabelId` / `useState.*activeResultTab` 三个表达式；
   - `setCargoItems` 不得回流 `useManualPlacementSession` 之外的 dispatch（保留原有行为断言，只替换掉对换行缩进敏感的文本断言）。
2. **行为断言（boxVisualState 已锁定三档）**：选「第 2 层」时 2D 与 3D 的非 active 层不透明度一致（`boxVisualState.test.ts` 已锁三档；本计划新增一条 2D 组件级断言：同一输入 `ContainerPlan2D` 的 inactive 透明度与 `boxVisualState` 一致，防 2D 回归自实现两档）。
3. **接口断言**：`VisualizationWorkspaceProps` / `ResultsPanelProps` 的 props 数各自下降；**可量化的目标是 `VisualizationWorkspaceProps` 从 68 → ≤ 30**（被砍掉的应是 `cogViewState`、下沉主动移除的派生值、及三状态直传）。若刀 5b 实施后发现 `cogViewState` 仍需上抛，允许保留它但在接口上显式文档化（在 props 类型旁注释说明驱动关系），并记入 `decision.md`。
4. **E2E / 回归**：每刀之后 `npm run test:e2e` **128/128 零失败零跳过**;`npm run benchmark` 的 3D 首像素与 resize 指标不回退（当前基线未收紧的 m6 问题不在本计划修，但不得借机再恶化）。
5. **手工/探索性断言**：层导航键（若有 keyboard shortcut）与「选中步骤里的箱→自动跳层」这两个交互在重构前后行为一致；导入失败仍自动唤起 importLog 页签。

## 风险与回归门槛

- **最大风险**：`activeResultTab` 驱动的 `deriveCogOverlayState` 下沉 ResultsPanel 后，时序上出现「tab 已是 cog，但 workspace 的 overlay 晚一帧才更新」——验收是肉眼在一次 tab 切换内感受不到 overlay 滞后，且 `benchark resize/3D 首像素` 不回退。
- **history 保存路径**：`saveCurrentPlan` 等导入/导航代码中的 `setActiveResultTab('importLog')`（5 处）若改错，用户导入失败时看不到日志页；E2E 的 importLog 用例是关键护栏。
- **sessionBoundary 112 处文本断言**：不要为了转绿删测试。改写为行为断言是**本计划内的授权修改**，不是放宽。

## 执行顺序 / 提交粒度 / 必跑命令

1. 刀 5a → commit `refactor(results): own layer and label selection in ResultsPanel`。
2. 刀 5b → commit `refactor(results): own result tab and derived compare/cog state`。
3. sessionBoundary 断言改写并入对应那刀的 commit（不单独成 commit）。
4. 每刀：`npm run lint && npm test`；**刀 5b 完成后全套**：`npm run lint && npm test && npm run build && npm run test:e2e && npm run benchmark`。
5. 完成后把 `plans/status.json` 里 P3-11 的 knife5 残项标记关闭，并把 round-5 M-7 的达成度写回 `decision.md`。

## 完成标准

- `activeLayerId` / `activeLabelId` / `activeResultTab` 在 Workbench 各只剩 ≤1 处只读消费（透传给 workspace），不再 setState。
- `VisualizationWorkspaceProps` 实测 ≤ 30。
- `activeResultTab` 不再作为「跨区计算驱动」存在； cog overlay / compare 的输入从「Workbench 读 tab」改为「ResultsPanel 通知或结算」。
- 128/128 E2E + benchmark 不回退。
