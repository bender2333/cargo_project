# 计划：手动排布吸附「可感知化」（2026-06-11）

来源反馈（2026/6/11 越南整柜散货）：「手动添加，产品无法实现边边对齐」「无法自动对齐已添加的产品」「货物与货物、货物与货柜的边增加自动吸附功能」。

复核结论：吸附**功能已存在且默认开启**，真问题是三点——(1) 吸附无任何视觉反馈，用户感知不到；(2) 容差只有 30mm，捕捉窗口太窄；(3) 3D 落定时未重套边吸附，预览贴边但松手弹回网格。

本轮目标：让吸附「可被感知」并更易触发。**不新增吸附种类，不改吸附算法语义。**

---

## 子任务 1：放大默认吸附容差

- **根因**：`src/lib/placementSettings.ts:27` `edgeToleranceMm: 30`，捕捉窗口太窄。
- **意图**：默认值 30 → **80**。仅改默认常量。
- **边界**：不动 `normalizePlacementSettings` 的 clamp 范围(0–1000)；不强制覆盖用户 localStorage 已存设置（旧用户保持原值，符合预期）。
- **验证标准**：
  - 单测：`placementSettings.test.ts` 断言 `DEFAULT_PLACEMENT_SETTINGS.edgeToleranceMm === 80`。
  - 单测（snapEdges）：构造一个目标边距 70mm 的候选，`tolerance:80` 时吸附、`tolerance:30` 时不吸附——编码「放大容差确实扩大捕捉窗口」这一意图，而非仅断言返回了某值。

## 子任务 2：3D 落定补齐边吸附（bug 修复）

- **根因**：`src/components/ContainerScene.tsx` `onPointerUp`（约 1307 行）落定只重套 `snapToGrid`，未重套 `snapToEdges`；而 `onPointerMove`（1271-1277）预览阶段有边吸附。导致预览贴边、松手弹回网格点。
- **意图**：落定计算 `finalXmm/finalYmm` 后、grid snap **之前**，当 `edgeSnapRef.current && mode==='plane'` 时重套一次 `snapToEdges`（others 取除自身外的 meshEntries box，tolerance 用 `placementSettingsRef.current.edgeToleranceMm`），与 pointermove 的逻辑保持一致。被边吸附命中的轴不再被 grid snap 覆盖（参考 `applyManualPlacementSnap` 中 snappedAxes 的处理方式 `src/lib/manualPlacementSnap.ts:36-42`）。
- **边界**：只改 plane 模式 x/y；z 不动。2D 路径已正确（`applyManualPlacementSnap`），不改。
- **验证标准**：
  - 抽出落定吸附为可测纯函数（建议复用/扩展 `manualMoveCommit.ts` 或 `manualPlacementSnap.ts`），单测：预览阶段吸附到的坐标与落定坐标**一致**（同一输入，pointermove 与 pointerup 产出相同 x/y）。这是 bug 的核心断言。
  - E2E（`e2e/manual-3d.spec.ts` 增补）：拖一个箱靠近邻箱右边并松手，断言最终 x 等于「邻箱右边 - 拖动箱长」对齐值（落点贴边）。

## 子任务 3：吸附视觉反馈 —— 对齐辅助线 + 被吸附边高亮

吸附触发时（`snappedAxes` 含 x 或 y），在对齐的那条边上画一条贯穿容器的参考线，并高亮被吸附的边。3D 与 2D 都做。

- **共用逻辑（放入 `src/lib/`，可测）**：新增模块（如 `snapGuides.ts`）：输入 `{ box(吸附后坐标), snappedAxes, others, container }`，输出**辅助线描述**——每条线含：轴('x'|'y')、对齐坐标值、以及它对齐到的是「柜壁/中线/某邻箱边」（用于决定线的样式/范围）。纯函数，不依赖 React/Three。
  - 复用 `snapToEdges` 的候选来源语义（`snapEdges.ts:34-39`：柜壁、中线、邻箱四类边），判定吸附后坐标精确等于哪一条候选，回报该候选的几何位置。
  - **验证标准**：单测覆盖——吸到柜壁、吸到邻箱右边、xy 同时吸附、未吸附（返回空）四种场景，断言返回的对齐坐标与类型正确。

- **3D 渲染（ContainerScene.tsx）**：
  - 根因/接入点：`onPointerMove` 1271-1277 当前丢弃 `snapToEdges` 返回的 `snappedAxes`。改为保留 snapped 结果，调用 `snapGuides` 生成辅助线，在场景中用一组（预创建、复用的）`THREE.Line` 绘制；`onPointerUp`/`clearGhost` 时隐藏。参考既有 ghost 的「预创建+复用+dispose」模式（`ensureGhost`/`positionGhost`/`clearGhost` 585-634、销毁 1547-1554），不要每帧 new 几何体。
  - 被吸附边高亮：拖动箱对齐到的边用高亮色描边（可复用 ghost 的 edges 或对 entry.edges 临时改色，松手还原）。
  - **边界**：仅拖动期间显示；不污染已落定箱体的常驻视觉；注意组件卸载时 dispose 线对象，避免 Three 资源泄漏。

- **2D 渲染（ManualPlacement2D.tsx）**：
  - 接入点：`handlePointerMove` 153 行已调用 `snapTopViewPoint`(内部 `applyManualPlacementSnap`)。让 2D 也拿到 snappedAxes（`applyManualPlacementSnap` 目前不回报 snappedAxes，需扩展返回值，保持对现有调用者兼容）。
  - 用 `snapGuides` 结果在 SVG 里画 `<line>`（贯穿容器 rect，虚线、醒目色如 #f3b21a），被吸附箱边加粗高亮。渲染位置参考现有 boxes map（212 行起）与 rect（203 行）。
  - **边界**：只在 `viewMode==='top'`（与现有 `snapTopViewPoint` 一致）；拖动结束清除。

- **整体验证标准**：
  - E2E（`manual-3d.spec.ts` + 2D 对应 spec）：拖动箱进入吸附范围时，断言辅助线元素出现（3D 可用 data 属性标记，如 `data-snap-guide-active="true"`；2D 断言 `<line data-testid="snap-guide">` 存在），松手后消失。
  - 视觉断言点（需人工确认）：辅助线方向正确、贴在对齐边上、被吸附边高亮明显。

---

## 执行顺序与提交粒度

1. 子任务 1（容差默认值 + 单测）→ 单独 commit。
2. 子任务 2（3D 落定吸附 bug + 单测 + E2E）→ 单独 commit。
3. 子任务 3 共用 `snapGuides.ts` + 单测 → commit；再 3D 渲染 → commit；再 2D 渲染 + E2E → commit。

## 必跑验证

- 每个子任务：`npm run lint && npm test && npm run build`。
- 子任务 2、3（涉及 3D/2D/交互）：额外 `npm run test:e2e`。
- 若 E2E 暴露问题，记录到 `decision.md`，**不削弱断言**。

## 风险与回归门槛

- 容差 80mm 不能大到「想精确放置反而被强行吸走」——若人工测试觉得过黏，回退到 60mm 并记 `decision.md`。
- 3D 落定补吸附后，确保不破坏既有 `manual-3d.spec.ts` 通过项（grid snap、非法位置拒绝逻辑 `handleManualMoveBox` Workbench.tsx:1278 不变）。
- 辅助线/高亮是纯展示层，**不得改变落点坐标**——落点仍由子任务 1/2 的吸附决定。
