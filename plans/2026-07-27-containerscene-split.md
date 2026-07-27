# 2026-07-27 Phase 5：ContainerScene 内部边界拆分

## 目标

将 `src/components/ContainerScene.tsx`（1999 行）按职责拆分为四个模块，
使每个文件职责单一、可独立阅读，同时保持外部 Props 接口完全不变。

## 当前根因

`ContainerScene.tsx:779-1998` 单文件混合四类职责：
1. 渲染资源：纹理/材质/标签/坐标变换（L111-452，约 340 行纯函数）
2. 覆盖层：间距标注/重心/悬停高亮（L641-777，约 140 行）
3. 交互逻辑：旋转 gizmo/ghost/事件处理器（L494-639，约 150 行 + 初始化 useEffect 内部约 400 行事件处理器闭包）
4. React 胶水：useRef×20 + useEffect × 7 + render loop 接线（L779-1998）

没有任何单元测试，所有质量保护依赖 E2E 和 benchmark。

## 边界与非目标

- 保留 `SceneState` 类型和函数式实现，不引入 class/factory/renderer interface
- 外部 `ContainerSceneProps` 接口零改动
- 不改变任何 data-testid 或 E2E 可观测行为
- 不移动 React refs/effects/render loop，它们留在 ContainerScene.tsx

## 3D benchmark 基线（拆分前）

| 指标 | median | P95 |
|------|--------|-----|
| canvasFirstNonEmptyPixelsMs | 350.95 ms | 353.8 ms |
| viewportResizeToStableCanvasMs | 286.15 ms | 288.5 ms |

拆分后允许上浮不超过 20%（首帧 ≤421 ms，resize ≤346 ms）。

## 拆分计划（三步）

### Step 0：补充拆分前单元测试

新建 `src/components/containerScene/rendering.test.ts`，覆盖所有将被提取的纯函数。
测试函数在 ContainerScene.tsx 中用 `// @vitest-export` 注释标记后临时导出，
拆分完成后自然通过正式模块路径导入。

覆盖用例：
- `fitText`：短字符串不截断；超长字符串加省略号后不超宽
- `worldCenterForBox`：已知 box+scale → 精确 Vector3 坐标
- `worldPointFromMm`：已知 Point3D+容器尺寸+scale → 精确 Vector3
- `boxOrientationQuaternion`：默认朝向返回单位四元数（w≈1）
- `boxGeometryForPlaced`：geometry.parameters.width === box.length * scale
- `sameBoxGeometry`：同尺寸返回 true；任一维度不同返回 false
- `isOutOfBounds`：超出 epsilon=1 → true；在内 → false；贴边 → false
- `overlapAreaXY`：不重叠=0；完全包含=min 面积；部分重叠精确值
- `rectsOverlap`：不重叠/接触边=false；重叠=true

提交：`test(scene): add pure-function unit tests before ContainerScene split`

### Step 1：提取 rendering.ts

**根因**：L111-452 的纯函数和缓存工具与 React 无关，可直接移动。

**移动内容**（`src/components/containerScene/rendering.ts`）：
```
textureCache / materialCache / FACE_MATERIAL_ORDER / ALL_LABEL_FACES
getTextureCache / getMaterialCache
fitText / drawRotateIcon / drawStackIcon / drawFaceIcon / makeFaceLabelTexture
makeBoxMaterial / getCachedFaceMaterial / getCachedPlainFaceMaterial / getCachedBoxMaterials
syncLabelFaceSampleAttribute / applyBoxVisualState
worldCenterForBox / worldPointFromMm / boxOrientationQuaternion
boxGeometryForPlaced / sameBoxGeometry / applyBoxTransform
```

ContainerScene.tsx 变化：删除上述定义，添加 `import { ... } from './containerScene/rendering'`。

验证：
- `npx vitest run src/components/containerScene/rendering.test.ts` — 全绿
- `npm run lint && npm test && npm run build`
- `npm run test:e2e` — 118/118
- `npm run benchmark` — 两个 3D 指标通过

提交：`refactor(scene): extract rendering module`

### Step 2：提取 overlays.ts

**根因**：L641-777 的间距标注和 hover 高亮逻辑，接受 SceneState 参数，与渲染资源分离。

**移动内容**（`src/components/containerScene/overlays.ts`）：
```
clearMeasurementGroup / createClearanceLabelSprite
clearanceLinePoints / syncClearanceAnnotations
updateHoverHighlight
```

注意：cogGroup 相关代码深度依赖 renderer，暂留 ContainerScene.tsx，待 Step 3 后再评估。

验证：同 Step 1，重点 clearance/CoG E2E 用例（manual-3d.spec.ts:256/610/656/667）。

提交：`refactor(scene): extract overlays module`

### Step 3：提取 interactions.ts

**根因**：初始化 useEffect 内约 400 行事件处理器以闭包访问 refs，需改为工厂函数显式接参。

**策略**：每个事件处理器改为 `makeXxxHandler(deps: { ... refs ... }) => handler`，
deps 只包含 RefObject，不包含响应式 state。

**移动内容**（`src/components/containerScene/interactions.ts`）：
```
selectedAxesAttribute / orientationAnimationSignature / rotationGizmoSignature
GHOST_VALID_COLOR / GHOST_INVALID_COLOR / HOVER_HIGHLIGHT_COLOR / ROTATION_ANIMATION_MS
ensureRotationGizmo / syncRotationGizmo / setRotationGizmoHover / hitRotationGizmo
advanceBoxAnimations
ensureGhost / positionGhost / clearGhost
isOutOfBounds / rectsOverlap / overlapAreaXY / cameraPositionForMode（从 ContainerScene 迁入）
makePointerDownHandler / makePointerMoveHandler / makePointerUpHandler
makeDoubleClickHandler / makeDragOverHandler / makeDragLeaveHandler
makeDropHandler / makeKeyDownHandler
```

ContainerScene.tsx 变化：事件处理器从匿名闭包改为调用对应工厂函数的结果。

验证（最严格）：
- `npm run lint && npm test`
- `npm run test:e2e` — 全量 118 用例，重点 manual-3d 手动拖拽/旋转/gizmo 系列
- `npm run benchmark` — 两个 3D 指标必须通过（≤120% 基线）

提交：`refactor(scene): extract interactions module`

## 完成后目录结构

```
src/components/
├── ContainerScene.tsx                 ← React 壳（预计 ≤600 行）
└── containerScene/
    ├── rendering.ts                   ← 材质/纹理/标签/坐标变换
    ├── rendering.test.ts              ← 纯函数单元测试
    ├── overlays.ts                    ← clearance/CoG/hover 标注
    └── interactions.ts                ← gizmo/ghost/事件处理器工厂
```

## 验收标准

| 门槛 | 要求 |
|------|------|
| 单元测试 | rendering.test.ts ≥9 个用例，全通过 |
| E2E | 118/118，零跳过 |
| benchmark 3D 首帧 | median ≤421 ms，P95 ≤425 ms |
| benchmark resize | median ≤344 ms，P95 ≤347 ms |
| ContainerScene.tsx 行数 | ≤600 行 |
| props 接口 | ContainerSceneProps 零改动 |
| 架构 | 无 class、无 factory interface、无第二套 scene graph |

## 每步验证命令

```bash
# 每步都要跑
npm run lint && npm test && npm run build

# 每步都要跑（3D 功能保护）
npm run test:e2e

# 每步都要跑（性能回归保护）
npm run benchmark
```
