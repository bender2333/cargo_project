# 计划：模板入口收敛（去掉「新建无数据源」+ 合并重复入口）

来源反馈（2026/6/17 第34轮复核）：第33轮 4 点已实现，但模板设计仍有问题：
1. 导航页「模板管理」点「新建模板」要选数据列，但新建时**没有数据源**，列下拉全空，根本选不了。
2. 工具栏还有一个「导入模板管理」按钮，与导航页重复，应去掉、合并到导航页模板管理。

决策已拍板（decision.md 2026-06-17）：
- 合并进**导航页「模板管理」**，作为唯一管理入口；保留并允许在此新建/自定义模板。
- 去掉工具栏「导入模板管理」按钮（`open-template-manager`）。
- 新建/编辑模板时列下拉数据源：**允许手填列名**（不强制先上传样本；有样本则给下拉建议）。
- 导入真实 Excel 的弹窗：**保留**顶部「命名 + 保存模板」控件（看着真列配是最自然的创建路径，存后也进同一列表）。
- 导出模板（exportTemplateManagerPanel）本轮不动。

子任务顺序：1 → 2 → 3 → 4。每个单独 commit。

---

## 子任务 1 列选择器支持手填列名（核心，修「无数据源」根因）

- **根因**：`ImportMappingForm`（`src/components/ImportMappingForm.tsx`）的列映射用纯 `<select>`（字段选择器 :132-142、合并列选择器 :286-295），选项只来自 `columns = availableColumns ∪ 已选值`（:97）。导航页新建时 `availableColumns` 来自 `templateSampleRows`，未加载样本即为空 → 下拉无可选项。
- **意图**：把字段列选择器（`map-select-<field>`）与合并列选择器（`map-select-dimensions` 对应的合并输入）从纯 `<select>` 改为 **`<input>` + `<datalist>`**：
  - `<input>` 的值即映射列名，用户可**直接手打**任意列名；
  - 关联 `<datalist>` 用 `columns`（已有样本/已选值）提供下拉建议；
  - `data-testid` 沿用 `map-select-<field>`、合并列同名，保持选择器定位不变。
  - 空值（未映射）= 空字符串，行为与现在一致。
- **边界**：
  - 只改列名选择控件；**不改**单位选择器（`map-unit-*` 保持 `<select>`：auto/mm/cm 是固定枚举）、表头行/起始行/默认值/拆分顺序/维度模式等其它控件。
  - 不改 `ImportMappingValue` 数据结构、不改 `mapping`/`combinedColumn` 字段语义。
  - 不改 parse 逻辑——手填的列名照样进 `mapping`，由现有 `parseCargoRowsWithMapping`/`parseCargoRowsWithTemplate` 按列名读。
- **同时修复：合并模式下多余的「dimensions」列下拉**（用户反馈「选了合并列后仍要选长宽高」）：
  - **根因**：`FIELD_KEYS`（:65-78）含 `'dimensions'`；字段循环隐藏条件 `dimensionMode==='combined' && dimensionKey`（:122）只对 length/width/height 生效（`DIMENSION_FIELDS` 仅这三）。合并模式下真正的 L/W/H 已隐藏，但 `dimensions` 项 `dimensionKey===undefined` → 不被隐藏，渲染出一个裸 "dimensions" 下拉（`fieldLabel` 无此键，显示原始 key），与底部专门的「合并尺寸列」选择器 `template-combined-column`（:285）重复，二者都写 `mapping.dimensions`。
  - **意图**：字段循环**跳过 `dimensions`**（任何模式都不作为普通字段渲染）。合并列统一由底部维度区的 `template-combined-column` 负责。`mapping.dimensions` 仍由 `combinedColumn` 的 onChange 写入，数据语义与 parse 不变。
  - **边界**：分列模式字段区不变（本就无 dimensions 可见价值）；合并模式字段区只剩 label/name/weight/quantity/color/可旋转/可堆叠/最大层数 + 底部「合并列 + 拆分顺序」。
- **验证标准**：
  - 组件/E2E：导航页直接点「新建模板」（**不**先加载样本）→ 列输入框可手打列名（如在 `map-select-length` 填入 `外箱长`）→ 该值进入模板 mapping → 保存成功，导航页列表显示 `length:外箱长`。这条编码「新建不再依赖数据源」的核心价值（旧实现此处下拉为空、无法填，能失败）。
  - 组件/E2E：有样本时（加载样本或真实导入），datalist 给出该文件的列作为建议，仍可选中（断言可见建议或填入后预览命中）。
  - 组件/E2E：切到合并模式 → 字段区**不再出现** "dimensions" 下拉（断言 `map-select-dimensions` `toHaveCount(0)`），只保留底部「合并尺寸列 + 拆分顺序」；切回分列模式 L/W/H 三选择器恢复。这条编码「合并列后不再要求选长宽高」。
  - 既有断言迁移：所有 `getByTestId('map-select-*').selectOption(x)` 改为 `.fill(x)`（见子任务 4）。

## 子任务 2 去掉工具栏「导入模板管理」按钮

- **根因**：工具栏按钮（`src/Workbench.tsx:3958-3971`，`data-testid="open-template-manager"`）`setImportRows([{}])` 后开空数据映射弹窗，与导航页 `template-manager` 功能重叠，且喂 `[{}]` 同样列下拉为空。
- **意图**：删除该按钮及其 onClick。模板管理统一走导航页「模板管理」（`nav-template-manager`）。
- **边界**：
  - **保留**工具栏「导入 Excel」`<label>`（真实导入入口）与「导出模板下拉 + 导出 Excel」等其它工具栏项，不动。
  - **保留**真实导入弹窗顶部的命名+保存控件（`import-template-controls`，:4301）。删按钮**不**影响该弹窗经真实导入打开的路径。
- **验证标准**：
  - E2E：工具栏不再有 `open-template-manager`（`toHaveCount(0)`）。
  - E2E：真实导入 Excel → 映射弹窗照常打开（`mapping-modal` 可见），顶部保存控件仍在（`save-import-template` 可见）。

## 子任务 3 导航页「新建模板」不再要求先加载样本

- **根因**：导航页「新建模板」按钮（`src/Workbench.tsx:2839-2846`）虽不强制，但因子任务 1 之前下拉为空、用户被迫先点「加载样本表头」（:2829-2838）才能配。子任务 1 落地后，手填列名已可用。
- **意图**：
  - 「新建模板」直接展开空白草稿表单即可配（列名手填或借助 datalist 建议）。
  - 「加载样本表头」**保留为可选辅助**（加载后给 datalist 建议 + 预览），不再是新建前置条件。文案/位置可微调以表达「可选」。
- **边界**：不改保存/编辑/删除已存模板的链路（`saveNewImportTemplate`/`saveEditedImportTemplate`/`removeImportTemplate`）；不改 `draftToMappingValue`/`applyMappingValueToDraft` 适配器。
- **验证标准**：
  - E2E（已在子任务 1 覆盖）：导航页未加载样本 → 新建 → 手填列名 → 保存成功并在列表可见。
  - 回归：加载样本后新建/编辑仍正常（datalist 建议 + 预览不回归）。

## 子任务 4 更新受影响的 E2E 与文案

- **根因**：现有 `e2e/container-calc.spec.ts` 依赖被删/被改的元素：
  - `:917-920` 用工具栏 `open-template-manager` 打开弹窗（子任务 2 删除）。
  - 多处 `map-select-*` 用 `selectOption(...)`（:906-909 等；子任务 1 改为 input）。
- **意图**：
  - 删除/改写 `open-template-manager` 相关断言段（改为「真实导入 → 弹窗」或直接移除这段复用断言，保留其余流程）。
  - 所有 `map-select-<field>.selectOption(x)` → `.fill(x)`；合并列选择器同理。
  - 导航页新建模板测试（:1007-1019）去掉「必须先 `template-manager-sample-input`」前置（保留一条覆盖样本辅助路径、一条覆盖纯手填路径）。
- **边界**：**不为通过而弱化断言**；导入成功条数、标签、尺寸等业务断言保持。测试失败先记 decision.md。
- **验证标准**：`npm run test:e2e` 中模板相关用例（创建/复用/编辑/删除/记忆上次）全绿，且至少新增/保留一条「导航页纯手填新建」用例。

---

## 必跑验证
- 每个子任务：`npm run lint && npm test && npm run build`。
- 子任务 1/2/3/4（UI/导入流程）：额外 `npm run test:e2e`。
- 真实文件 `越南第十一批6.2海运.xlsx` 仍作为夹具：用其表头作为 datalist 建议，配映射后导入成功。

## 风险与回归门槛
- 子任务 1 改控件类型（select→input+datalist）是本轮最大改动：必须保证 `data-testid` 不变、空值语义不变、已选值回填正确（编辑已存模板时输入框显示存的列名）。`importCargo.test.ts`/`importTemplates.test.ts` 全绿为硬门槛。
- 子任务 2 删按钮：确认没有其它代码/测试依赖 `open-template-manager`（已查：仅 `container-calc.spec.ts:917`）。
- 子任务 4：E2E 断言迁移面较大，逐条对照，避免漏改导致假绿。
- 导出模板本轮零改动，回归确认其面板与下拉不受影响。
