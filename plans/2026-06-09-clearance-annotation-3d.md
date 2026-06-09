# 计划：3D 余量自动标注（拆除手动两点尺规）

> 决策依据：`decision.md` 2026-06-09 议题 3（已拍板）。交付 Codex 的定稿计划。

## 目标

用「**选中盒子 → 在 3D 自动标注可用方向的余量**」替换现有手动两点尺规：
- 选中任一已放置盒子，按快捷键开启「余量标注」后，在 3D 场景中用**带数值的标注线**显示该盒子在各方向的余量（到容器内壁 / 到最近相邻盒）。
- 某个方向若与相邻盒或内壁**直接接触（余量 ≈ 0）则该方向不显示**标注。
- 数值绝对精确——来自已知 AABB 与容器内壁的确定性计算，不靠手动点取。

## 现状根因（要修掉的）

- `Workbench.tsx:1478` 写死 `axis:'spatial'` → `measurement.ts:80` 永远算 3D 斜边，手点两点不在同一轴线 → 系统性偏大（主因）。
- `ContainerScene.tsx:1099` 空中取点退化到地板平面、`:1093` 兜底取相机距离处一点（无几何意义）；`measureSnap.ts` 吸附只认边中点 + 默认 80mm 阈值 → 跳变。
- `measurement.ts:112` `measureBoxClearance()` 已能算六向余量 + 最近邻间距、有单测，但**零调用方=死代码**。

## 边界（改什么 / 不改什么）

- **拆除手动两点尺规**：移除 ruler 取点交互、草稿点、两点连线、`measurements[]` 手动标注流（`Workbench.tsx` 的 `rulerEnabled/measurements/measurementDraftPoint`、`handleMeasurementPoint:1467`、`ContainerScene.tsx` 取点分支 `1085-1116`、`syncMeasurementLines` 两点连线）。不保留、不做轴向修复版。
- **接线复用 `measureBoxClearance`**（消除死代码），不另写几何计算。它已算 `left/right/front/door/floor/top` 六向 + `nearestX/Y/Z` 最近邻；本功能消费它。
- 不改装箱算法、不改 `PackingResult`。容器内壁用装箱所用的**有效装载尺寸**（与 `measureBoxClearance` 传入的 container 口径一致，确保标注与算法同源）。
- 复用现有 `selectedBoxId`(`Workbench.tsx:1002`) 选中态，不新增第二套选中。
- `measureSnap.ts`、手动 `measurement` 的两点相关导出若变成无引用，随本次清理（仅清理本改动产生的孤儿，不动无关代码）。`measureBoxClearance`/`formatMeasurement`/`ClearanceMeasurements` 保留并启用。

## 模块划分

1. **`src/lib/measurement.ts`**：保留并启用 `measureBoxClearance`。**新增方向取舍逻辑**（可单测）：给定 clearance 结果 + epsilon，产出「应显示哪些方向的标注 + 各自数值 + 文案」。某向数值 ≤ epsilon（接触）则不显示。最近邻 vs 内壁：每个方向取「到最近相邻盒」与「到内壁」中较小者作为该向「可用空隙」（即真正能塞东西的余量），并标注它指向的是邻盒还是内壁。**接触判定 epsilon = 1mm**（计划内拍定；浮点与整数 mm 容差）。
2. **`src/components/ContainerScene.tsx`**：
   - 移除 ruler 取点分支与两点连线渲染。
   - 新增 `clearanceAnnotations` 渲染：当传入「选中盒子的待显示余量集」时，为每个方向画一条带端点、贴近盒面、标注数值（sprite/canvas 文字，mm/m 用 `formatMeasurement`）的标注线，方向沿对应坐标轴，从盒面延伸到障碍面（邻盒面或内壁）。
   - 标注随相机存在，但**数值文字朝向相机**（billboard sprite），保证可读；线本身在世界坐标。
3. **`src/Workbench.tsx`**：
   - 移除 ruler 相关 state/UI。
   - 新增 `clearanceEnabled` 开关，绑定**快捷键**（在既有 keydown handler `1415-1457` 内加一个键，如 `m`/`M` for measure，避开已用的 r/z/y/Escape；计划内定为 `m`）。
   - 开启 + 有 `selectedBoxId` 时，调 `measureBoxClearance(box, effectiveContainer, placed)` → 方向取舍 → 传给 `ContainerScene`。
   - i18n（zh/en）：开关提示、各方向文案（左/右/前/门侧/底/顶 ↔ left/right/front/door/floor/top）。复用现有未渲染的 `clearanceTitle` 文案（`Workbench.tsx:251/507`）。

## 交互约定（计划内拍定）

- 快捷键 `m` 切换余量标注开关；关时不显示任何标注。
- 仅对**当前选中盒子**显示（不全局标注所有盒子，避免杂乱）。未选中则即使开关开启也不显示。
- 接触方向（余量 ≤1mm）不画。
- 数值格式沿用 `formatMeasurement`（≥1000mm 显示 m，否则 mm）。

## 执行顺序与提交粒度

1. `measurement.ts`：新增方向取舍函数 + 单测 → commit `feat(measure): derive visible clearance directions from box AABB`。
2. `ContainerScene` 移除两点尺规 + 新增余量标注渲染 → commit `feat(scene): render clearance annotations for selected box`。
3. `Workbench` 拆 ruler state/UI + 加快捷键 + 接线 + i18n + 清理孤儿 → commit `refactor(measure): replace manual ruler with clearance annotation`。
4. E2E（见下）→ commit。

## 验收标准（可断言优先）

**单测（`src/lib/measurement.test.ts` 扩展，复用已有 `measureBoxClearance` 测试夹具）——编码业务意图：**
1. **接触不显示**：盒子贴着内壁（如 `front=0`）→ 方向取舍结果中**不含** front 方向。盒子两两相邻（某向 nearest≈0）→ 该向不显示。
2. **可用空隙取较小者**：某向同时有内壁余量 800 与邻盒间距 200 → 显示值 = 200 且标注指向「邻盒」；反之取内壁。
3. **数值精确**：构造已知坐标盒子，断言各显示方向数值等于手算 AABB 差值（整数 mm，零误差）——这条防「斜边/取点」类不精确回归。
4. epsilon 边界：余量 = 1mm（=epsilon）按接触处理不显示；= 2mm 显示。
5. 孤立盒子（容器中央、无邻盒）→ 六向全显示，各值 = 到内壁距离。

**E2E（`npm run test:e2e`，3D 测量流程）：**
- 计算出结果 → 选中一个盒子 → 按 `m` → 断言 3D 场景出现余量标注（标注 group 存在 / 标注数 >0）；某个贴壁方向不出现标注。再按 `m` 关闭 → 标注消失。
- 断言旧的「两点尺规」UI/交互已不存在（不再有 ruler 开关、点击不再产生草稿点）。

**回归门槛**：`npm run lint && npm test && npm run build` 全绿。`measureBoxClearance` 从死代码转为有调用方（可被 `codegraph_callers` 证实 >0）。移除手动尺规后无悬空引用、ESLint 无 unused。

## 风险

- 标注线在盒子密集处可能与几何重叠遮挡：本轮仅标注「选中盒子」可缓解；如仍拥挤，标注线可略微偏移盒面外侧绘制。
- 数值文字 sprite 的清晰度/朝向：用 billboard + 适当像素密度，复用现有 sprite/canvas 文字做法。
- 「门侧(door)」与「前(front)」方向命名需与现有 2D/文案一致，避免左右/前后语义错位——以 `measureBoxClearance` 既有字段语义为准（front=x 最小侧、door=x 最大侧、left=y 最小、right=y 最大、floor=z 最小、top=z 最大）。
