# 计划：修复 3D 选箱后的余量测量与 Delete 快捷键失效

来源：`issues/0824` 用户现场反馈。问题已通过实际操作链定位：自动装箱完成后切换手动模式，在 3D 场景选中箱体，点击“余量测量”或使用 `M`，再按 `Delete`；快捷键有时没有任何反应。

## 根因

- `ContainerScene` 的 3D `pointerdown` 只通过 `onSelectBox` 更新选中箱体，不会把焦点交给 3D 场景（`src/components/ContainerScene.tsx:487-523`）。渲染器 canvas 也没有稳定的键盘焦点入口。
- `useWorkspaceHotkeys` 是唯一的全局键盘监听，但只在 `event.target` 位于 `workspaceRef` 且当前导航为 overview 时解析命令（`src/hooks/useWorkspaceHotkeys.ts:43-60`）。当 3D 点击没有建立工作区焦点，`M`、`Delete`、方向键等命令会在 `resolveWorkspaceHotkey` 前被守卫丢弃。
- 现有测试主要通过快速放置、2D 选择或先点击工作区按钮建立焦点，未覆盖“真实 3D 点击选中后直接使用快捷键”的路径，因此测试未捕获该问题。

## 意图与边界

### 目标

- 手动 3D 模式下，鼠标选中箱体后，3D 场景立即成为工作区键盘焦点。
- 选中后按 `M` 能切换余量标注；按 `Delete` / `Backspace` 能删除当前箱体并同步更新手动结果、待放置池、选中状态和撤销历史。
- 点击“余量测量”按钮后再按 `Delete` 也必须保持可用。

### 不改动

- 保留一个 `window` 级快捷键监听和现有 `resolveWorkspaceHotkey` 命令解析，不重新在 3D 场景内新增第二套 keydown 监听。
- 不放宽“编辑框、文本域、可编辑内容中不响应快捷键”的守卫。
- 不让自动模式响应 Delete/旋转/移动；自动模式的 `M` 和现有工作区按钮保持不变。
- 不改变手动删除的业务规则、支撑校验、撤销/重做契约、余量计算算法或 2D 选择行为。
- 不把结果面板、侧栏、历史页等外部焦点误当成工作区焦点。

## 模块划分

### 1. 3D 焦点归属

修改 `src/components/ContainerScene.tsx`：

- 给手动模式的场景根节点提供可聚焦入口（`tabIndex` 或等价 DOM 焦点入口），避免让 Three.js canvas 承担不可控的键盘焦点。
- 在手动 3D 场景发生有效 pointer 选择时，将焦点转移到场景根节点；清空选择或拖拽仍使用现有交互流程。
- 不在自动模式抢焦点，不改变相机控制、旋转手柄、拖拽和 drop 事件。

### 2. 快捷键契约测试

保留 `src/lib/workspaceHotkeys.ts` 的纯函数边界，补充/确认以下行为：

- 工作区焦点 + 手动模式 + 选中箱体：`M`、`Delete`、`Backspace`、方向键和 `PageUp/PageDown` 均产生对应命令。
- 工作区外焦点、历史页、编辑字段：上述编辑命令继续返回 `null`。
- 自动模式：只允许 `M`，不允许 Delete/旋转/移动。

### 3. 浏览器回归

在 `e2e/manual-3d.spec.ts` 增加真实 3D 交互回归，不使用 2D `dispatchEvent` 代替 3D 选择：

1. 自动结果切换到手动，确认自动箱体完整继承。
2. 通过 3D canvas 命中并选中一个箱体，断言场景显示选中状态且场景获得焦点。
3. 直接按 `M`，断言 `data-clearance-enabled=true`、余量标注存在。
4. 直接按 `Delete`，断言箱体数减少 1、选中状态清空、报告中的已装载数量同步减少。
5. 重做同一场景：点击“余量测量”按钮后按 `Backspace`，断言删除仍成功。
6. 保留现有 2D Delete、快速放置 Delete、自动模式 M、编辑字段不响应和导航离开工作区不响应的回归断言。

## 执行顺序

1. **先写 RED 回归**：在 `e2e/manual-3d.spec.ts` 锁定真实 3D 选中后的焦点、M、Delete 行为；先运行该用例确认当前版本失败。
2. **实现焦点修复**：只修改 `ContainerScene` 的手动选择焦点归属，不改快捷键解析和删除业务逻辑。
3. **运行 focused 验证**：先跑 workspace hotkey 单测、相关 manual session/scene 测试和新增 E2E。
4. **运行完整门禁**：`npm run lint`、`npm test`、`npm run build`、`npm run test:e2e`。
5. **人工复核**：使用 0824 大批量场景验证“自动 → 手动 → 3D 选箱 → 点击余量测量 → Delete”，并重复验证直接按 `M`、`Backspace`、按住 Delete 的首个 keydown 行为。
6. 更新 `CHANGELOG.md` 和发布说明；若完整门禁或人工复核失败，先写入 `decision.md`，不得削弱断言。

## 验证标准

- 真实 3D 选箱后，`M` 必须在一次按键内打开余量标注。
- 真实 3D 选箱后，`Delete` / `Backspace` 必须删除恰好一个箱体，不能删除多个，也不能静默无效。
- 删除后 `manualDraft.boxes`、`manualPlacedBoxes`、`activeResult.placedCount`、待放置数量、选中状态和 undo/redo 历史一致。
- 自动模式、编辑字段、结果面板/历史页等非工作区焦点的快捷键守卫保持原行为。
- 不新增场景级 keydown 监听；`Workbench.sessionBoundary.test.ts` 的监听边界断言保持通过。

## 提交粒度

1. `test(manual-3d): reproduce hotkeys after 3d selection`
2. `fix(manual-3d): focus workspace after selecting a box`
3. `docs: record 3d selection hotkey fix`

每个提交只包含本步骤相关文件；提交前检查 `git status --short`，不纳入 `issues/0824` 以外的用户现场文件。

## 风险与回归门槛

- 场景获得焦点后可能影响空格键、Tab 导航或相机控制；必须确认只在手动 3D pointer 交互后聚焦，并检查键盘帮助、拖拽、旋转手柄和相机操作。
- 若只修改焦点而不验证真实 canvas 命中，测试可能再次退化为 2D/快速放置假阳性；新增 E2E 必须由 3D pointer 命中触发选中。
- 若当前部署构建与源码不一致，需先记录构建版本/资源哈希，再进行现场复测，不得用本地测试结果宣称生产已修复。
