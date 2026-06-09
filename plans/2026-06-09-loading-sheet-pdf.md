# 计划：装柜步骤 → 作业分解图导出（多页 PDF）

> 决策依据：`decision.md` 2026-06-09 议题 1（已拍板）。本文件是交付 Codex 的定稿计划，聚焦意图/边界/模块划分/验收，不写代码级细节。

## 目标

把现有「装柜步骤」导出成一份**多页 PDF 作业分解图**，形态参考 `test-data/越南40尺装柜分解图2026.6.2.pdf`：
- **第 1 页 = 物料清单图例**：每种货物一行（标签色块 + 名称/描述 + 件数 + 长×宽×高 + 重量），外加整柜汇总指标（总件数、总重、体积/容积利用率、装载长度）。
- **第 2…N 页 = 步骤卡片网格**：每页若干张卡片，每张卡片 = 一个 `LoadingTaskGroup`（一步），卡片内含：
  - 连续编号（跨页递增，1→M）。
  - 本步要装的标签 + 件数（如 `C ×3, J ×18`，复用 `group.summary` / `group.labels`）。
  - 一张**俯视图**：**已装货物用深色/低透明度铺底（累加快照）+ 本步新增货物高亮**。

## 边界（改什么 / 不改什么）

- **不重算装箱**：所有数据来自既有 `PackingResult`、`buildLoadingTaskGroups()`、`visibleBoxesAt()`。本功能是「读 + 排版 + 导出」，严禁在导出路径里重新跑装箱或重新推导层级/支撑。
- **复用现有 2D 渲染**：每格俯视图用 `ContainerPlan2D`（`mode="top"`）渲染，传 `boxes` 子集 + `highlightBoxIds`。不要新写一套投影逻辑（违反「2D/3D/明细不各自计算」）。
- **粒度固定**：一步 = 一个 `LoadingTaskGroup`，不引入新的合并/拆分规则。
- 仅前端实现，不引入服务端导出。
- 不改 `loadingTaskGroups.ts` 的合并逻辑、不改 `playback.ts`。

## 模块划分

1. **新增依赖**：`jsPDF`（pin 精确版本，写入 `package.json`）。SVG→位图：优先用 `XMLSerializer` + `Image`/`canvas` 把 `ContainerPlan2D` 的 SVG 栅格化为 PNG 再 `addImage`；若分辨率不足，提高离屏 canvas 像素密度（如 2×）。**不引入 puppeteer/html2canvas**。
2. **新增 `src/lib/loadingSheet.ts`**（纯逻辑，可单测）：
   - 输入：`PackingResult`（或已算好的 `LoadingTaskGroup[]` + `placed` + `container` + `labelStats`）。
   - 输出：一个**与渲染无关的结构化数据模型** `LoadingSheetModel`，含：
     - `legend`: 物料清单行数组（label, color, name, count, length, width, height, weight）+ 汇总指标。
     - `steps[]`: 每步 `{ sequence, labelSummary: {label,color,count}[], cumulativeBoxIds, newBoxIds }`，其中 `cumulativeBoxIds = visibleBoxesAt(...)` 到本步为止、`newBoxIds = group.boxIds`。
   - 这一层**不碰 jsPDF、不碰 DOM**——纯数据，便于单测断言。
3. **新增导出执行函数**（建议放 `Workbench.tsx` 导出区或新 `src/lib/exportLoadingSheet.ts`，依赖 jsPDF + DOM，故不放纯 lib）：消费 `LoadingSheetModel` + 离屏渲染 `ContainerPlan2D` → 组装多页 PDF → `downloadBlob`。
4. **`Workbench.tsx`**：在导出区新增「导出作业分解图（PDF）」按钮 + i18n（zh/en）。按钮在 `result` 为空时禁用。

## 版式默认值（计划内拍定，无需再问）

- 纸张 **A4 横向**；每页步骤卡片 **2 列 × 3 行 = 6 格**（与参考件接近）。
- 卡片俯视图保持容器长宽比；编号画在卡片左上角，标签+件数画在卡片下方。
- 文案**双语**按当前 `locale` 渲染（与 app 其它导出一致）。
- 尺寸图例列单位用 **mm**（内部单位，保持全局一致；不在导出里做 mm→cm 转换）。
- 累加快照：已装 `opacity ≈ 0.25` 灰底，本步新增用各自标签色实色。

## 执行顺序与提交粒度

1. 加 jsPDF 依赖 + `npm ci` 验证可解析 → commit `chore(deps): add jsPDF for loading sheet export`。
2. `src/lib/loadingSheet.ts` + 单测（见验收）→ commit `feat(loading-sheet): build sheet data model`。
3. 离屏渲染 + 多页 PDF 组装 + Workbench 按钮 + i18n → commit `feat(loading-sheet): export multi-page PDF`。
4. E2E 冒烟（见下）→ commit。

## 验收标准（可断言优先）

**单测（`src/lib/loadingSheet.test.ts`）——编码业务意图，不止「返回了东西」：**
1. `steps.length === buildLoadingTaskGroups(result).length`，且 `steps[i].sequence` 连续 1..N。
2. **累加正确性**：`steps[i].cumulativeBoxIds` ⊇ `steps[i-1].cumulativeBoxIds`，且 `steps[i].cumulativeBoxIds \ steps[i-1].cumulativeBoxIds` 恰等于 `steps[i].newBoxIds`（本步新增 = 累加增量）。断言用一个含多步、多标签的固定夹具。
3. `steps[i].newBoxIds` 等于对应 `LoadingTaskGroup.boxIds`。
4. **图例件数守恒**：`legend` 中每个标签的 `count` 之和 == `placed` 总箱数；每个标签 count == 该标签实际放置箱数（防止图例与实际脱节）。
5. 图例汇总的总重/总体积与 `PackingResult` 既有统计一致（引用同源字段，不重算）。
6. 空 `PackingResult`（placed 为空）→ 返回空 steps、空 legend，不抛异常。

**E2E（`npm run test:e2e`，作业图导出冒烟）：**
- 加载示例数据 → 计算 → 点「导出作业分解图」→ 断言触发了一次 PDF blob 下载（文件名 / 下载事件），不验证 PDF 像素内容。

**回归门槛**：`npm run lint && npm test && npm run build` 全绿；现有 2D/导出相关测试不退化；包体增量仅来自 jsPDF。

## 风险

- SVG→PNG 栅格化在高 DPI 下可能糊/慢：用离屏 canvas 提高像素密度，单页一图、量级（≤几十步）可接受。
- `ContainerPlan2D` 现为「整柜满图」样式，缩成小格后字号/标注可能过密：导出渲染时可传更简的标注模式（仅色块、不逐箱文字），如需新增 prop 要保持对现有页面无副作用（默认值不变）。
- jsPDF 中文字体：图例/标签可能含中文，需确认 jsPDF 默认字体能否渲染中文；若不能，**文字部分也走「渲染成图片再 addImage」**（与俯视图同管线），规避字体嵌入复杂度。这是落地时第一个要验证的点。
