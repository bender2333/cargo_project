# 计划：选模板即导入 + 列对不上红框（模板 = 映射 + 列表信息）

来源反馈（2026/6/18 第37轮）：模板设计仍不对，用户澄清三点——
1. 在导入弹窗里选了某个模板，**就应直接按该模板解析导入**，不该再让用户逐列确认映射。模板本质 = 列映射关系 + 列表信息（表头行/起始行/单位/合并模式/拆分顺序/默认值）。
2. 模板管理里这些映射应可再次编辑 —— **已实现**（`template-manager-edit-${id}` → `editImportTemplate` Workbench.tsx:2182 → 复用 `ImportMappingForm`，存走 `updateImportTemplate`:2203）。本轮**不改**，仅记录设计意图。
3. 新增模板/自定义配置就是配这些参数 —— **已实现**（`template-manager-new`:2848 → `newImportTemplateDraft` → 同一 `ImportMappingForm`，列名支持手填 datalist）。本轮**不改**。

**已决策（AskUserQuestion 2026/6/18）**：
- 触发方式：**默认不加载任何模板**；在导入弹窗中**选中某个模板的下拉项即直接触发解析+导入**（跳过"确认导入"那一步）。下拉「无」= 维持现在的手动逐列映射 + 确认按钮路径。
- 列对不上：**照常解析**（缺列的行按现有规则报错进 importLog），**同时在弹窗里把"映射了但文件中不存在的列"对应输入框显示红框**；有红框时弹窗保持打开让用户当场修正，全部命中才解析成功并关闭。

本轮只动两件事，其余（编辑/新增/导出模板）零改动。子任务顺序：1 → 2。每个单独 commit。

---

## 子任务 1 选模板下拉即触发解析导入；默认不再自动套用模板

- **根因**：
  - `importExcel`（`src/Workbench.tsx:2416`）打开弹窗前会**自动套用** `lastUsedTemplateId` 或上次原始配置（:2508-2519），与"默认不加载模板"冲突。
  - 弹窗模板下拉 `onChange`（:4301）只调 `applyImportTemplate` 做**预填**，用户仍须再点"确认导入"（`confirmMappingImport`:1961）。
  - `applyImportTemplate`（:2010）通过 `setState` 写入 mapping/units/headerRow… 都是**异步**，选完不能立即用 state 去 parse（会读到旧值）。
- **意图**：
  - **去掉 on-open 自动套用**：`importExcel` 进入手动弹窗分支（:2479-2521）时，删除 `applyImportTemplate(lastUsedTemplateId)` / `applyLastImportConfig(savedConfig)` 那段（:2508-2519）。弹窗打开时模板下拉默认「无」，仅保留 `preSelectCol` 的**列名启发式预选**（:2496-2498，这是列自动识别，不是"模板"）。
  - **新增纯数据函数**（放 `src/lib/importCargo.ts` 或新 helper）：`buildTemplateImportConfig(template: ImportTemplatePayload)` → 返回 `parseCargoRowsWithTemplate` 所需的 config 对象（mapping/units/headerRow/startRow/mergeRows:'none'/dimensionMode/combinedColumn/dimensionOrder/defaultValues），**直接从 template 对象取值，不经 React state**。
  - **新增 `importWithTemplate(template)`**（Workbench）：
    1. `applyImportTemplate(template.id)`（仍更新弹窗 UI 状态，让红框/预览反映所选模板）。
    2. 用 `buildTemplateImportConfig(template)` + 当前 `importRows` 调 `parseCargoRowsWithTemplate` 解析（**用模板对象直算，绕开 state 时序**）。
    3. 写 importMessages（沿用 `confirmMappingImport` 的消息组装，:1973-1980），命中行 `setCargoItems`。
    4. 计算 `missing`（见子任务 2）：`missing.length === 0` → `setShowMappingModal(false)` + `setActiveNav('report')`；`missing.length > 0` → **保持弹窗打开**（红框可见），importLog 已含报错。
    5. 记 `lastUsedTemplateId`（沿用 :2001-2006，仅作记录，不再用于 on-open 自动套用）。
  - 下拉 `onChange`（:4301）：选到非空模板 id → `importWithTemplate(template)`；选到「无」→ 仅 `applyImportTemplate('')` 清空（回到手动映射）。
- **边界**：
  - **保留**手动映射路径：「无」+ 逐列填 + `confirmMappingImport` + "确认导入"按钮（:4384）不变。
  - **保留**弹窗顶部命名+保存模板控件（`save-import-template`:4321）。
  - **保留** `autoMappable` 免弹窗快路径（:2458）不动。
  - **不改** `parseCargoRowsWithTemplate` 解析规则、不改后端模板 schema。
  - 因去掉 on-open 自动套用，`applyLastImportConfig`(:2029) 与 `loadLastImportConfig` 在此路径变为**孤儿**——只删本次改动产生的未用调用；`saveLastImportConfig` 写入侧若仍被 `confirmMappingImport` 使用则保留，确认无引用后再清，flag 给后续。
- **验证标准**：
  - 单测（`importCargo.test.ts` 新增）：`buildTemplateImportConfig(tpl)` 输出的 config 字段与 tpl 一一对应（mapping/units/headerRow/startRow/dimensionMode/combinedColumn/dimensionOrder/defaultValues），`mergeRows==='none'`，`combinedColumn` 回退到 `tpl.mapping.dimensions`。编码"模板对象 = 解析规则"，与 state 无关。
  - 单测：用真实夹具 `越南第十一批6.2海运.xlsx` 的行 + 一个合并尺寸列模板（combined + LWH + 数量=箱数）跑 `parseCargoRowsWithTemplate(rows, buildTemplateImportConfig(tpl))`，断言导入行数 = 数据行数、各行长宽高正确（如 530*305*310 → L530 W305 H310 mm）。这条编码"选模板即得到正确解析结果"。
  - E2E：保存一个模板 → 上传**同格式**文件打开弹窗（下拉默认「无」、未自动套用）→ 在下拉**选中该模板** → **不点确认**即导入成功、弹窗关闭、明细出现货物。这条编码点 1 的核心价值（旧实现此处仅预填、必须再点确认，能失败）。
  - E2E：上传文件，弹窗打开时模板下拉值为空（`import-template-select` value=''），编码"默认不加载模板"。

## 子任务 2 映射列在文件中缺失 → 弹窗对应输入框红框

- **根因**：`ImportMappingForm` 字段输入框（`src/components/ImportMappingForm.tsx:131-138`）与合并列选择器（:285 附近）无 invalid 态；用户看不出"我映射的列文件里没有"。
- **意图**：
  - `ImportMappingForm` 新增可选 prop `missingColumns?: string[]`（模板映射了、但 `availableColumns` 里不存在的列名集合）。
  - 渲染时：某字段/合并列的当前映射值非空且 ∈ `missingColumns` → 该 `<input>` 加红色边框 class（如 `border-red-500 ring-1 ring-red-400`）+ 字段下方红色小字"列在文件中未找到 / Column not found in file"。`data-testid` 不变；新增 `data-invalid="true"` 便于断言。
  - Workbench：`importWithTemplate` 解析后计算 `const present = new Set(importColumnsForHeaderRow(importRows, template.headerRow ?? 1)); const mapped = [combinedColumn||mapping.dimensions, ...各字段 mapping 值].filter(Boolean); const missing = mapped.filter(c => !present.has(c))`，传给弹窗内 `ImportMappingForm`（:4333）。手动映射路径 missing 始终为空（用户从该文件列选/填，命中即对）。
- **边界**：红框纯展示，不阻断（解析照常、importLog 照常报错）；不改 `canConfirmMapping` 必填校验逻辑（:1150）；不改解析。
- **验证标准**：
  - 组件/E2E：构造模板映射 `length:外箱长`，上传一个**没有**「外箱长」列的文件并选该模板 → `map-select-length` 输入框 `data-invalid="true"`（红框可见），且 importLog 出现对应行报错，弹窗**保持打开**。编码"列对不上要让用户看见在哪一列"。
  - 组件/E2E：模板所有映射列都在文件中 → 无任何 `data-invalid` 字段，弹窗关闭、导入成功。
  - 防回归：手动逐列映射路径下，从该文件下拉/填入的列不触发红框。

---

## 必跑验证
- 每个子任务：`npm run lint && npm test && npm run build`。
- 子任务 1/2（导入流程/UI）：额外 `npm run test:e2e`。
- 真实夹具 `越南第十一批6.2海运.xlsx` 必须跑通：保存模板 → 选模板即导入成功。测试失败先记 `decision.md`，不削弱断言。

## 风险与回归门槛
- **state 时序是子任务 1 的最大坑**：必须用 `buildTemplateImportConfig(template)` 直算解析，**禁止**"先 setState 再读 state parse"。新增单测锁定该纯函数。
- 去掉 on-open 自动套用后，确认 `importTemplates.test.ts` / `importCargo.test.ts` 全绿；确认没有别处依赖"打开弹窗即带出上次模板"的 E2E（若有则按本轮模型改写，不弱化断言）。
- 「无」+ 手动映射 + 确认按钮路径必须完好（回归门槛），避免把唯一的兜底手动路径也改没了。
- 点 2/3 本轮零代码改动：仅在 `decision.md` 记一句"模板编辑/新增已满足设计意图，本轮不改"，避免下一轮重复质疑。
