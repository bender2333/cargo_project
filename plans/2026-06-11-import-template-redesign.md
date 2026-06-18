# 计划：导入模板重构（模板 = 用户配置的读取规则）

来源反馈（2026/6/11）：导入模板不好用、泛化性差。复核（decision.md 2026-06-11 多条）确认：能力大多已存在，但**规则模型有缺口（合并顺序写死、标签 A-Z 会撞车）+ 必填项不突出 + 配好的模板复用链路弱**。

**设计模型**：模板是用户在选定表格范围内，把「我们的参数」显式映射到「他的表格标头」的规则。系统不猜格式，照规则读。必填项强制配置。

真实样本：`test-data/excel/越南第十一批6.2海运.xlsx`（R1 标题、R2 表头、尺寸合并在 `外箱尺寸（mm）` 列如 `530*305*310`、数量列 `箱数`、标签用超长 `物料名称`/SKU）。**此文件必须作为 E2E/单测夹具，跑通即验收。**

子任务顺序：1 → 2 → 3 → 4 → 5。每个单独 commit。

---

## 子任务 1 标签 A-Z 生成器（含进位，修撞车 bug）

- **根因**：`nextLabel`（`src/Workbench.tsx:761`）与 `fallbackLabel`（`src/lib/importCargo.ts:125`）都用 `String.fromCharCode(65 + index % 26)`，第 27 个（index=26）撞回 `A`，与 `normalizeCargoLabelColors`（`src/lib/labels.ts:13` 按 label 大写归一色）叠加 → 第 27 个货物和第 1 个**同标签同色**，分层/图例/3D 全部串味。
- **意图**：新增纯函数 `excelStyleLabel(index: number): string`（放 `src/lib/`），按 Excel 列名规则生成 `A..Z, AA, AB..`，0→A、25→Z、26→AA。`nextLabel` 与 `fallbackLabel` 改用它。
- **边界**：只改标签**生成**；不改 `normalizeCargoLabelColors` 的归一逻辑；不改已映射标签列的处理。
- **验证标准**：
  - 单测：`excelStyleLabel(0)='A'`、`(25)='Z'`、`(26)='AA'`、`(27)='AB'`、`(51)='AZ'`、`(52)='BA'`。
  - 单测（防回归）：生成 30 个标签，断言**全部唯一**（旧实现此处会重复，能失败）。
  - 单测：与 `normalizeCargoLabelColors` 组合，30 个货物得到 30 种不同 label→color 映射。

## 子任务 2 标签列映射 + A-Z 回退 + 原文进 name

- **根因/现状**：`parseCargoRows`（importCargo.ts:240）`label = sanitizeText(valueFor(row, fields.label),80) || fallbackLabel(index)`，且 name 已独立取（:241）。模板路径 `parseCargoRowsWithMapping`（:275）走相同 parse。
- **意图**：
  - 用户**映射了标签列** → label 取该列值（去控制字符、限长，**不再 slice(0,2)/toUpperCase**，沿用 import-template-system 既定）。
  - 用户**未映射标签列** → label 自动用 `excelStyleLabel(index)`（子任务 1）。
  - name 始终保留原文（映射的名称列或 SKU），供明细/图例 `A = 原文` 展示。
- **边界**：一行一标签（不做同箱规合并）；不改色彩分配规则。
- **验证标准**：
  - 单测：映射了标签列 → label=该列值；未映射 → label=A/B/C…且唯一。
  - 单测：name 永远是原文，不被 label 截断影响。
  - 夹具：真实文件未映射标签列时，30+ 行得到 A..Z,AA.. 且无重复。

## 子任务 3 合并尺寸顺序可配（强制选择）

- **根因**：`dimensionOrder` 在 UI 侧写死 `['length','width','height']`（`src/Workbench.tsx:1856,1969,2002`）；数据层 `parseCargoRowsWithTemplate`（importCargo.ts:386）其实支持任意 order，但 UI 不暴露。
- **意图**：
  - 弹窗合并模式下新增「拆分顺序」下拉（选项：LWH/LHW/WLH/WHL/HLW/HWL，或三个有序下拉），**新增 state `templateDimensionOrder`**。
  - **不预设**：合并模式下未选顺序 → 视为必填未完成，禁用「确认导入」。
  - 保存/应用/编辑模板时 `dimensionOrder` 用该 state，不再硬编码（改 1856/1969/2002/2017 等处）。
- **边界**：连接符拆分逻辑（`splitCombinedDimensions` importCargo.ts:326，已支持 `* × x 空格`）不改；分列模式不受影响。
- **验证标准**：
  - 单测：combined + order=`['width','length','height']`，输入 `530*305*310` → width=530,length=305,height=310（mm）。
  - 单测：combined 但 order 未设 → parse 前置校验报「需选择顺序」/上层禁用确认。
  - 夹具：真实文件 `外箱尺寸（mm）` 列 + 用户选 LWH → 各行长宽高正确（如 580*365*435 → L580 W365 H435）。

## 子任务 4 弹窗必填项重点显示 + 强制配置

- **根因**：当前弹窗（`src/Workbench.tsx:4188` 起）把所有字段平铺，必填(尺寸/数量)与选填混在一起，「确认导入」`confirmMappingImport`（:4291）无必填校验。
- **意图**：
  - 弹窗字段分两区：**必填区(高亮/置顶)**=尺寸(分列三项 或 合并列+顺序)、数量；**选填区**=名称/重量/可旋转/可堆叠/最大层数/颜色。
  - 「确认导入」按钮：必填未配齐 → `disabled` + 列出缺哪项（如「请映射：数量」「请选择尺寸拆分顺序」）。
  - 必填判定：分列模式需 length+width+height 三列都选；合并模式需合并列 + 顺序；数量需映射或有默认值(templateDefaults.quantity)。
- **边界**：纯 UI/校验层；不改 parse 规则；保留现有预览表（:4248）。
- **验证标准**：
  - E2E（真实文件）：上传 → 弹窗 → 必填区高亮可见；未配数量时确认按钮 disabled 且提示；配齐(尺寸合并列+LWH顺序+数量=箱数)后可确认，导入成功，明细显示 A/B/C 标签 + 原文 name。
  - 组件/E2E：缺顺序时 disabled，选后 enabled。

## 子任务 5 模板复用：下拉默认上次使用 + 预填确认

- **根因**：`importExcel`（Workbench.tsx:2219）失败即开**空白**弹窗，从不带出已存模板；`applyImportTemplate`（:1877）能预填但需用户手动选，且不记忆上次。
- **意图**（稳妥路线，不自动匹配、不自作主张）：
  - 新增 `lastUsedTemplateId` 持久化（localStorage，按用户区分，仿 placementSettingsKey）。
  - 打开弹窗时：模板下拉**默认选中 lastUsedTemplateId**（若仍存在），并自动 `applyImportTemplate` 预填该规则。
  - 用户在下拉切换模板 → 预填 + 实时预览（已有预览表随 headerRow/mapping 更新）。
  - 用户**确认**后才解析导入（保留现有"确认导入"一步）。
  - 确认导入成功后，把当前用的模板 id 记为 lastUsedTemplateId。
- **边界**：**不做上传自动匹配/指纹命中**（按用户决策：手选+记住上次）；多模板不自动择优，由用户在下拉选。
- **验证标准**：
  - 单测：lastUsedTemplateId 读写（含用户隔离 key、模板已删除时回退到「无」）。
  - E2E：保存一个模板 → 关闭 → 再次上传同格式文件 → 弹窗下拉默认选中该模板且字段已预填 → 直接确认即导入成功。这条编码「配过一次，下次默认带出」的核心价值。

---

## 必跑验证
- 每个子任务：`npm run lint && npm test && npm run build`。
- 子任务 3/4/5（UI/导入流程）：额外 `npm run test:e2e`。
- 真实文件 `越南第十一批6.2海运.xlsx` 必须作为夹具跑通（含合并尺寸+箱数+A-Z标签）。测试失败先记 decision.md，不削弱断言。

## 风险与回归门槛
- 子任务 1 改标签生成影响所有导入路径与示例数据——`labels.test.ts`、`importCargo.test.ts`、`importTemplates.test.ts` 必须全绿，新增「30 标签唯一」断言为硬门槛。
- 子任务 3 改 dimensionOrder 多处硬编码，确保保存→应用→编辑模板三条链路都用同一 state，避免存的和用的不一致。
- 子任务 5 只做「默认上次 + 预填确认」，不引入自动匹配，避免行为不可预期。
- 后端 import-templates 已含 dimensionOrder 字段，无需 schema 迁移；若发现缺字段，按 SQLite 幂等迁移处理并记 decision.md。
