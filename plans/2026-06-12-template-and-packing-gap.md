# 计划：导入模板入口收敛 + 装箱缝隙修复（同货物同朝向）

来源：2026/06/12 用户复核反馈两点 —— ①导入导出模板不完善（合并模式选完尺寸列还要继续选 L/W/H，应自动填充；模板分散在模板管理页/导入弹窗/合并模式三处，设计不完整）；②越南测试 Excel 总出现箱子之间有缝隙。

根因已用真实文件 `test-data/excel/越南第十一批6.2海运.xlsx` 实测，详见 decision.md「2026-06-12」条目。决策：缝隙＝**同货物同朝向**；模板＝**统一为导入弹窗式 UI**。

真实样本 = 验收夹具：`越南第十一批6.2海运.xlsx`（R1 标题、R2 表头、`外箱尺寸（mm）`列合并如 `530*305*310`、`箱数`列数量、超长`物料名称`做标签）。**跑通即验收。**

子任务顺序：1 →（2、3 可并行）→ 4。每个单独 commit。

---

## 子任务 1 装箱：同货物同朝向约束（消除行距交替留缝）

- **根因**：`placementScore`（`src/lib/packing.ts:275`）中 `labelFacingPenalty = (item.length - item.width) * 0.01`（:289）偏好 LWH 太弱，压不过 `point.x/point.y` 位置主序项。实测同一品类被拆成 LWH/WLH 混排（label D=42 LWH+89 WLH），地面行距 530/305 交替 → 46%（365/785）箱体侧面悬空留缝。单一品类 `canRotate:false`（锁单朝向）时地面整齐 `x=0,530,1060,1590`，证明缝隙源自朝向不一致而非支撑/floating（-z 悬空实测=0）。
- **意图**：在装箱过程中维护「每个 cargoId 已承诺朝向」——某 cargoId 第一个成功放置的箱体确定其 `orientationKey`，后续同 cargoId 箱体**强烈优先**沿用同一朝向。让同一货物在柜内朝向一致，行距统一，消除交替缝隙。
- **边界**：
  - 只改朝向**选择倾向**，不改 `orientations()`（:91）候选生成、不改 `canPlace`/`overlaps`/`supportDetails` 几何与支撑逻辑、不改 `splitCombinedDimensions`、不改分层 `layers.ts`。
  - 「承诺朝向」是**强惩罚而非硬过滤**：当承诺朝向在所有候选点都放不下、而另一朝向能放下时，仍允许换朝向放置（避免本可装下却判为 unplaced，触发 `fail loudly` 反模式）。惩罚量级建议与 `tiltPenalty` 同档（`container.length*width*height`），确保盖过位置项但低于「放不下」。
  - 承诺朝向只在「直立朝向」之间约束（`box.height === item.height` 的那些，即 LWH/WLH），不强迫躺倒货物（tilt 仍由 tiltPenalty 单独压制）。
  - 不引入跨 cargoId 的全局朝向统一（不同货物可不同朝向）。
- **模块划分**：改 `packing.ts`。承诺朝向状态在 `calculatePacking`（:650）主循环内维护（如 `Map<cargoId, OrientationKey>`，`placeEntry` :709 写入首个朝向），传入 `bestPlacement`/`placementScore` 参与评分。`volume` 与非 `volume` 两条放置路径都要覆盖（:755 与 :827）。
- **验证标准（硬门槛，新增到 `packing.test.ts`）**：
  - 单测「同货物同朝向」：单一品类 `530×305×310 ×60`、`canRotate:true` 放入 40HQ → 断言**所有 placed 的 `orientationKey` 唯一**（当前实现会出现 ≥2 种，能失败）。
  - 单测「缝隙回归」：同上场景，断言**地面层(z≈0) 侧面悬空箱体数 = 0**（定义：每个非贴墙箱体其 -y 面必与某箱 +y 面在重叠 x/z 上贴合；或更简单——断言地面 y 起点集合中相邻间距等于箱宽整数倍，无碎片偏移）。给出可断言的数值用例，不要「跑通就行」。
  - 单测「换朝向兜底」：构造一个承诺朝向放不下、另一朝向恰好放下的窄槽场景 → 断言该箱仍被放置（`placed` 含它，`unplaced` 不含），证明强惩罚未退化成硬过滤。
  - 单测「不退化利用率」：越南夹具或等价混合品类场景，断言修复后 `placed.length` **不低于**修复前（允许相等或更高；若略降需在 decision.md 记录权衡）。
  - 防回归：现有 `packing.test.ts` 全绿；`342f6cb`/`0dc8d9a` 引入的 LWH/同label/同高断言不被破坏。

## 子任务 2 模板映射组件抽取（三处共用一套）

- **根因**：列映射 UI 存在两套不一致实现——模板管理页 `templateManagerPanel`（`Workbench.tsx:2663`，新建 :2679 / 编辑 :2748）用**自由文本 `<input>`** 填列名（:2724、:2798），无下拉、无预览、无必填校验；导入弹窗（:4188+）用**下拉 `<select>` + 预览表 + 必填校验**（`canConfirmMapping` :1120）。两套各自维护 state，能力割裂。
- **意图**：抽出**单一映射配置组件**（建议 `src/components/ImportMappingForm.tsx` 或同等），封装：表头行/起始行、尺寸模式（分列/合并）、合并列+拆分顺序、必填高亮区（尺寸+数量）、选填区（名称/重量/可旋转/可堆叠/最大层数/颜色）、列下拉（来源 = 选定表头行的标头）、必填校验提示。导入弹窗与模板管理页**都复用它**。
- **边界**：
  - 复用既有数据层：`importTemplates.ts`、`parseCargoRowsWithTemplate`、`canConfirmMapping` 校验规则、`importColumnsForHeaderRow`，**不改 parse 规则与后端 schema**。
  - 不改导入弹窗已验收的交互（预览表、lastUsedTemplateId 默认带出，来自 2026-06-11 计划），只把其映射区抽成可复用组件后让模板管理页也用。
  - 删除模板管理页的自由文本映射输入分支（:2724、:2798 那两组 `<input>`），改用抽出的组件；保留模板列表/新建/编辑/删除外壳。
- **模块划分**：新建映射组件于 `src/components/`；`Workbench.tsx` 导入弹窗与 `templateManagerPanel` 改为引用它。中英文文案沿用现有 `t.*` key，不新造重复 key。
- **验证标准**：
  - 组件单测/E2E：模板管理页新建模板时，列映射用**下拉**（非文本框），下拉项 = 上传/已存样本表头；合并模式显示合并列+拆分顺序、隐藏 L/W/H（见子任务 3）；必填未配齐时「保存/创建」按钮 disabled 且列出缺项。
  - E2E（真实文件）：模板管理页与导入弹窗两处的映射区视觉/行为一致（同一组件）。
  - 防回归：导入弹窗既有 E2E（含 lastUsedTemplateId 默认带出、确认导入成功、明细显示 A/B/C 标签+原文 name）全绿。

## 子任务 3 合并模式自动填充 / 隐藏 L/W/H 选择器

- **根因**：导入弹窗合并模式分支（`Workbench.tsx:4256`）设置 `templateCombinedColumn` 并同步 `customMapping.dimensions`（:4269），但下方字段循环（:4304 `Object.keys(customMapping).map`）仍渲染独立的 length/width/height 三个选择器（:4319 `isDimension`）。用户选了合并尺寸列后「下面还要继续选」L/W/H，正是这里。
- **意图**：合并模式（`templateDimensionMode === 'combined'`）下，字段映射区**自动隐藏 length/width/height 三个独立选择器**（它们由合并列+拆分顺序统一提供）；分列模式下保持显示。即「选了合并队列，下边自动填充/不再要求继续选」。
- **边界**：纯 UI 渲染条件；不改 parse（`parseCargoRowsWithTemplate` 已按 dimensionMode 走不同路径）、不改必填校验规则（`canConfirmMapping` :1124 合并分支已只校验合并列，符合）。此子任务并入子任务 2 的组件实现（组件内按 mode 条件渲染），但单独验收。
- **验证标准**：
  - E2E（真实文件）：选「合并尺寸列」模式 → 选 `外箱尺寸（mm）` 列 + LWH 顺序 → **下方不再出现 length/width/height 独立选择器**；确认导入后各行长宽高正确（如 `580*365*435` → L580 W365 H435）。
  - E2E：切回「分列」模式 → length/width/height 选择器重新出现。
  - 单测/组件测试：combined 模式渲染不含 `map-select-length/width/height` testid；separate 模式含。

## 子任务 4 文案与回归收口

- **意图**：统一中英文文案 key（移除因三处合一而冗余的 key），跑全量验证。
- **边界**：不新增业务逻辑；只清理本轮改动产生的孤儿 state/文案/import。
- **验证标准**：`npm run lint && npm test && npm run build` 全绿；`npm run test:e2e` 中模板与导入相关用例全绿；越南夹具端到端跑通（合并尺寸+箱数+A-Z标签+无明显缝隙）。失败先记 decision.md，不削弱断言。

---

## 必跑验证
- 每子任务：`npm run lint && npm test && npm run build`。
- 子任务 2/3/4（UI/导入流程）：额外 `npm run test:e2e`。
- 真实文件 `越南第十一批6.2海运.xlsx` 必须作为夹具：导入跑通 + 装箱后侧面悬空箱体数显著下降（理想地面层=0）。测试失败先记 decision.md，不削弱断言。

## 风险与回归门槛
- 子任务 1 改装箱评分影响所有装箱路径——`packing.test.ts` 全绿是硬门槛；新增「同货物同朝向」「地面无侧面缝隙」「换朝向兜底」「利用率不退化」四条断言。务必覆盖 `volume` 与非 `volume` 两条放置路径。
- 强惩罚误设成硬过滤会让本可装下的货物变 unplaced（静默失败）——「换朝向兜底」单测专门守这条。
- 子任务 2 抽组件可能漏接既有 state/校验——导入弹窗既有 E2E 必须全绿，确保抽取无行为回归。
- 模板管理页删自由文本输入是破坏性 UI 改动——确认已存模板（后端数据）仍能在新下拉式编辑器中正确加载/保存（dimensionMode/combinedColumn/dimensionOrder/mapping 往返一致）。
