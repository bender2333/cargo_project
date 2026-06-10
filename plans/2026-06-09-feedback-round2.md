# 计划：反馈轮次 2 — 四项改进

> 决策依据：用户 2026-06-09 反馈（尺规样式、PDF位置与视角、手动模式步骤、模板帮助）。已拍板。

---

## 任务 A：尺规改成 AutoCAD 测距线样式 + 可见按钮 + 键盘帮助

### 根因

- `ContainerScene.tsx:652-680`：`createClearanceLabelSprite` 画一个 512×160 白底圆角矩形 + 52px 粗体数字 → 占视野太大、遮盖货物。
- `Workbench.tsx:3352-3366`：已有可见的切换按钮（`data-testid="toggle-clearance"`），这部分保留。
- `Workbench.tsx:3491-3512`：键盘帮助仅存在于**手动模式**，自动模式 3D 视图无键盘帮助。
- `Workbench.tsx:328-337`：`manualKeyboardHelpItems` 列表不含 `m` 键。
- 自动模式无 `autoKeyboardHelpItems` 概念。

### 意图与边界

**改什么：**
1. 将 `createClearanceLabelSprite` 改成 AutoCAD 测距线风格：
   - **数字**：用小字号（≤24px）、无背景、半透明深色、紧贴线中点偏上；canvas 小（如 256×64）。
   - **线**：保留蓝色主线；**两端加 extension lines**（短垂直线段，与主线垂直、延伸约 3-5% 线长或固定 0.05 世界单位），模拟 AutoCAD 标注线的"小尾巴"。
   - **去掉 sphere marker**，改用 extension line 端点即可。
2. 自动模式 3D 视图**补一个键盘帮助按钮**（位置与手动模式镜像：左上角），列出自动模式可用快捷键（当前只有 `M: 尺规 / M: ruler`，以及 Ctrl+Z/Y）。
3. 手动模式键盘帮助补充 `M: 尺规 / M: ruler` 条目。

**不改什么：**
- 不改 `measureBoxClearance` 算法，不改余量方向取舍逻辑。
- 不改快捷键 `m` 绑定，不改 toggle 开关按钮（它已存在）。
- 可见切换按钮保留原样（已有）。

### 模块划分

1. **`src/components/ContainerScene.tsx`**：
   - 重写 `createClearanceLabelSprite(label)` → `createDimensionText(label)` — 小 canvas、无背景/边框、小字号。
   - 重写 `syncClearanceAnnotations` 中端点渲染 — 去 sphere，加 extension line（沿垂直于主线方向的短线段）。
   - 保留主线（`THREE.Line`）和 `clearanceLinePoints` 计算。

2. **`src/Workbench.tsx`**：
   - i18n 新增 `autoKeyboardHelp: 'Keyboard help' / '键盘帮助'`、`autoKeyboardHelpItems: [...]`。
   - 自动模式 3D 视图 `data-testid="auto-view-container"` 内加键盘帮助按钮（与手动模式同风格），state 复用或新建 `autoHelpOpen`。
   - 手动模式 `manualKeyboardHelpItems` 数组追加 `'M: toggle clearance ruler' / 'M: 尺规开关'`。

### 验收标准

**视觉/行为（E2E 可断言）：**
- 选中盒子 + 按 M → 标注出现；标注**无白色背景矩形**（无 roundRect fill），数字字号显著小于之前。
- 线两端有 extension line（Group 内含 ≥ 3 条 Line 子对象：主线 + 2 端延伸线）。
- 自动模式 3D 视图出现 `data-testid="auto-keyboard-help"` 按钮，点击展开列表包含 `M`。
- 手动模式帮助列表包含 `M` 条目。

**回归：** `npm run lint && npm test && npm run build` 全绿。

---

## 任务 B：PDF 导出移入「装柜步骤」tab + 改为 3D 轴测视角

### 根因

- `Workbench.tsx:3370-3378`：「导出作业分解图（PDF）」按钮放在顶部工具栏（与导出视图、导出 Excel 并列），语义不对——它属于「装柜步骤」功能。
- `exportLoadingSheet.ts:178-186`：每步图用 `drawBoxPlan`（2D 俯视），不是 3D 轴测。
- 无 offscreen 3D 渲染器存在。

### 意图与边界

**改什么：**
1. **移动按钮**：从顶部工具栏移除 `export-loading-sheet-pdf` 按钮，放到 `LoadingStepsPanel` 组件内（播放控件旁或面板底部）。
2. **新建离屏正交等轴渲染器** `src/lib/offscreenIsoRenderer.ts`：
   - 输入：`PlacedBox[]`（累计）、`Set<string>`（本步高亮 ids）、`ContainerSpec`、画布尺寸。
   - 用 THREE.js `WebGLRenderer` + `OrthographicCamera` 在等轴角度（约 azimuth 45°, elevation 35°）渲染一帧 → `canvas.toDataURL('image/png')`。
   - 颜色复用 `labels.ts` 的 `getLabelColor`。高亮盒实色，历史盒 opacity 0.25。
   - 渲染容器线框（wireframe box）作为参考。
   - **纯函数式**：每次调用 new renderer → render → dispose。不持有全局 state。
3. **修改 `exportLoadingSheet.ts`**：
   - 用新的 `renderIsoSnapshot(...)` 替换 `drawBoxPlan` 调用。
   - 删除（或保留为 dead code 备注）`drawBoxPlan` 如无其它调用方。

**不改什么：**
- 不改 `buildLoadingTaskGroups`、`LoadingSheetModel`、物料清单第一页逻辑。
- 不改 `ContainerScene` 的交互式场景。
- 不改 `ContainerPlan2D`。

### 模块划分

1. **新增 `src/lib/offscreenIsoRenderer.ts`**（可在 Node 环境下做 smoke test，但完整渲染需浏览器 WebGL）：
   - `renderIsoSnapshot(opts: IsoSnapshotOptions): string` → data URL。
   - `IsoSnapshotOptions = { boxes, highlightIds, container, width, height }`。
2. **修改 `src/lib/exportLoadingSheet.ts`**：替换 `drawBoxPlan` → `renderIsoSnapshot`。
3. **修改 `src/components/LoadingStepsPanel.tsx`**：
   - 新增 prop `onExportPdf?: () => void`、`exportDisabled?: boolean`。
   - 在面板底部（列表下方）渲染「导出作业分解图」按钮。
4. **修改 `src/Workbench.tsx`**：
   - 移除顶部工具栏的 PDF 按钮 JSX（line 3370-3378）。
   - 向 `LoadingStepsPanel` 传入 `onExportPdf={exportLoadingSheet}` + `exportDisabled={!loadingStepsAvailable}`。

### 验收标准

**E2E：**
- 顶部工具栏**不再含** `data-testid="export-loading-sheet-pdf"` 按钮。
- `data-testid="loading-steps-panel"` 内含 `data-testid="export-loading-sheet-pdf"` 按钮。
- 点击导出 → 触发 PDF blob 下载（与之前行为一致）。

**单测（`offscreenIsoRenderer.test.ts`）：**
- 因 WebGL 在 jsdom 不可用，单测仅断言函数导出存在、类型签名正确。实际渲染由 E2E 验证（PDF 下载成功 = 渲染未抛异常）。

**回归：** `npm run lint && npm test && npm run build` 全绿。

---

## 任务 C：装柜步骤/作业回放支持手动模式

### 根因

- `Workbench.tsx:1490-1491`：`loadingTaskGroups` 和 `loadingStepsAvailable` 在 `placementMode === 'manual'` 时传 `null` → 返回空。
- `Workbench.tsx:1487`：`playbackAvailable` 同理。
- `manualPlacedBoxes`（line 1218）的 `physicalLayer` 全写死 1、`workStep` 全写死 1、`supportedBy` 全为空（`manualPlacement.ts:716-752`）。
- `buildLoadingTaskGroups` 需要有效的 `result.workSteps`（按 step 排序）和 `placed`（含真实 `physicalLayer`/`supportedBy`）。

### 意图与边界

**改什么：**
1. **新增 `src/lib/manualSteps.ts`**（纯逻辑，可单测）：
   - `buildManualPackingResult(boxes: PlacedBox[], container: ContainerSpec): PackingResult`
   - 步骤：
     1. 调用 `assignDepthLayers(boxes)` 得到真实 `physicalLayer`/`supportedBy`/`supportType`。
     2. 推导 workSteps：按「层 → 层内按 z 升序（底→顶）→ 同 z 按 y 升序」排序，产出 `WorkStep[]`。
     3. 组装一个最小 `PackingResult`（`placed`, `workSteps`, `layers`(用 `buildLayers`)、其余字段给合理默认）。
   - 这样 `buildLoadingTaskGroups(manualResult)` 和 `buildPlaybackSequence(manualResult)` 就能正常消费。

2. **修改 `src/Workbench.tsx`**：
   - 新增 `manualResult` memo：当 `placementMode === 'manual' && manualPlacedBoxes.length > 0` 时调用 `buildManualPackingResult`。
   - `loadingTaskGroups` 改为：`placementMode === 'auto' ? buildLoadingTaskGroups(result) : buildLoadingTaskGroups(manualResult)`。
   - `playbackSequence` 同理。
   - `loadingStepsAvailable` / `playbackAvailable` 不再强制要求 `placementMode === 'auto'`。

3. **修改 `src/lib/manualPlacement.ts`** 的 `toPlacedBoxes`：
   - 不再写死 `physicalLayer:1`——由下游 `buildManualPackingResult` 负责赋值；这里输出的是"位置+尺寸"准确但层级待推导的 `PlacedBox`。或者，在 `buildManualPackingResult` 内部 clone + 覆盖即可，不改 `toPlacedBoxes`。

**不改什么：**
- 不改 `buildLoadingTaskGroups` 本身的合并逻辑。
- 不改 `assignDepthLayers` 算法。
- 不改自动模式的任何行为。
- 不改 playback 组件渲染逻辑。

### 模块划分

1. **新增 `src/lib/manualSteps.ts`** + 单测 `src/lib/manualSteps.test.ts`。
2. **修改 `src/Workbench.tsx`**：接线。

### 验收标准

**单测（`manualSteps.test.ts`）——编码业务意图：**
1. 3 个盒子分别在 x=0, x=600, x=1200 → `physicalLayer` = 1, 2, 3。
2. 同层两盒 z 不同 → workStep 低 z 在前。
3. 空数组 → 返回空 result（placed=[], workSteps=[]），不抛异常。
4. 返回的 `result.workSteps.length === boxes.length`。
5. `buildLoadingTaskGroups(buildManualPackingResult(boxes, container)).length > 0`（能被消费）。

**E2E：**
- 手动模式放入 3+ 个盒子 → 切到「装柜步骤」tab → 面板显示非空步骤列表（`data-testid="loading-steps-panel"` 存在 + `loading-step-group` 数 >0）。
- 作业回放 tab → slider 可拖动 → 3D 场景逐步显示盒子。

**回归：** `npm run lint && npm test && npm run build` 全绿；自动模式步骤/回放行为不变。

---

## 任务 D：模板管理添加帮助引导（问号 tooltip）

### 根因

- `Workbench.tsx:3947-4224` 映射 modal 和 `2533-2700` 模板管理面板：无任何字段级帮助。
- 用户不知道「表头行」「数据起始行」「合并尺寸列」「标签列」分别意味着什么、该怎么填。

### 意图与边界

**改什么：**
1. 在映射 modal 关键字段旁加一个 **小问号图标**（`?` 圆形，常见 tooltip 设计），hover/click 时弹出简短说明文字。覆盖以下字段：
   - **表头行 (Header row)**：「Excel 中真正的列标题所在行号（从 1 开始）。如果第 1 行是合并标题，真表头通常在第 2 行。」
   - **数据起始行 (Start row)**：「实际货物数据从哪一行开始（从 1 开始）。通常是表头行 + 1。」
   - **尺寸模式 (Dimension mode)**：「分列：长、宽、高在不同列。合并：长宽高写在同一格（如 530*305*310）。」
   - **合并尺寸列 (Combined size column)**：「包含 "长×宽×高" 合并值的那一列名称。系统自动识别 *, ×, x 等分隔符。」
   - **标签列 (Label column)**：「用哪一列的值作为货物标签。标签贯穿计算、显示和导出全流程。留空则自动分配 A/B/C。」

2. 实现方式：一个极简的 `HelpTooltip` 组件（inline `<span>` + absolute positioned popover on hover/click），不引入第三方 tooltip 库。

**不改什么：**
- 不改模板保存/加载逻辑。
- 不改字段本身的行为。
- 不改模板管理面板的布局结构。

### 模块划分

1. **新增 `src/components/HelpTooltip.tsx`**：接收 `text: string`，渲染小圆问号 + hover popover。
2. **修改 `src/Workbench.tsx`**：在 5 个目标字段的 `<label>` 旁插入 `<HelpTooltip text={...} />`。i18n 新增帮助文案（zh/en）。

### 验收标准

**E2E：**
- 打开映射 modal → 每个目标字段旁有 `data-testid="help-tooltip-*"` 元素。
- hover 其中一个 → popover 出现（`data-testid="help-tooltip-popover"` visible）。
- popover 含非空文本。

**回归：** `npm run lint && npm test && npm run build` 全绿。

---

## 执行顺序与提交粒度

1. **任务 D**（最小独立，UI only）→ commit `feat(import): add help tooltips to template mapping fields`
2. **任务 A**（视觉改进 + 帮助）→ commit `refactor(measure): AutoCAD-style dimension lines + keyboard help`
3. **任务 C**（新模块 + 接线）→ commit `feat(manual): enable loading steps and playback for manual placement`
4. **任务 B**（新渲染器 + 按钮移动）→ commit `feat(loading-sheet): 3D iso rendering + move export into steps tab`

每步之后：`npm run lint && npm test && npm run build`。

## 风险

- **离屏 WebGL**（任务 B）：jsdom/CI 无 GPU — 单测只验类型，真渲染靠 E2E（Playwright 有 headless Chromium + WebGL）。如果 CI headless WebGL 报错，可考虑 fallback 到之前的 2D 或加 `--ignore-gpu-blocklist` flag。
- **extension line 方向**（任务 A）：需根据相机视角判断"垂直"方向；简化方案是始终沿固定世界轴（如沿 Y 或 Z）画短线段，不做相机自适应——在等轴视角下够用。
- **手动模式层级推导**（任务 C）：`assignDepthLayers` 当前基于 X 轴深度（装柜方向），手动摆放的盒子如果 X 坐标不连续（中间有空隙），层级可能偏大但仍合理——因为每个 gap 确实意味着新的装载深度。
