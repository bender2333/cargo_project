# 计划：Excel 导入模板系统（适配异形客户表）

> 决策依据：`decision.md` 2026-06-09 议题 2（已拍板）。交付 Codex 的定稿计划。

## 目标

重新设计一轮 Excel 导入，使其能**适配某一类异形客户表**：用户为某种格式建立/选择一个「导入模板」，模板描述如何从该格式抽取货物（表头行、列→字段映射、单位、合并尺寸列拆分、标签列），之后**同类 Excel 直接选该模板导入**，不再每次手工对列。

以真实样本 `test-data/excel/越南第十一批6.2海运.xlsx` 为必须跑通的验收夹具，其特征：
- 第 1 行合并标题，**真表头在第 2 行**，数据从第 3 行起，末行 `汇总` 合计行。
- 长宽高合并在一格 `530*305*310`（mm）。
- 数量列陷阱：`预计发货数量`(总件 7056) / `箱数`(装箱数 126，**正确取这列**) / `箱规`(每箱件数)。
- 无独立标签列，只有 SKU `物料代码SKU`（如 `TB-C10-EV_v1.1`）。
- 备注列含换行。

## 边界（改什么 / 不改什么）

- **模板匹配方式 = 用户手动选**：导入时从下拉选一个已存模板套用。**不实现按表头指纹自动匹配**。
- **标签来源 = 用户在模板/导入时指定哪一列**。**移除 `slice(0,2)` 压缩**（它破坏 SKU 唯一性，是核心字段损坏）。不默认用 SKU 前缀分组。
- 不改装箱算法、不改 `PackingResult` 形态。`label` 仍需端到端贯穿（录入→计算→2D/3D→分层→明细→导出→历史），导入侧只负责正确取到 label。
- 复用并扩展现有列映射模板基础设施（`src/lib/importTemplates.ts` + 服务端 `/api/import-templates`），不另起一套持久化。
- 自动零配置探测（原方案 C）**本轮不做**，留待后续；本轮聚焦「模板可正确描述并复用异形格式」。

## 模块划分

### A. `src/lib/importCargo.ts`（解析核心，纯逻辑可单测）

1. **让 `headerRow` 真正生效**（当前 `ImportTemplateConfig.headerRow:46` 声明但 `parseCargoRowsWithTemplate:270` 从不使用）：
   - 解析入口改为接收 `header:1` 的**原始二维矩阵**（`sheet_to_json(sheet,{header:1})`），而非「电子表格首行当 key」的对象数组。
   - 按模板 `headerRow`（1-based 电子表格行号）取该行作为列名，`startRow` 起为数据行。这样合并标题行不再污染列名。
2. **合并尺寸列拆分**：模板可声明某一列为「合并尺寸列」并指定：
   - 分隔符集合：`*`、`×`、`x`、`X`、`*`（全角）、空格 —— 用正则一次性切分。
   - 维度顺序：默认 `长×宽×高`（L×W×H），可在模板里覆盖顺序。
   - 单位：随该列单位设置（mm/cm/auto），auto 时按数值量级或表头括号 `（mm/cm）` 判定。
   - 切分得到 3 个值后，喂给现有 length/width/height 解析路径。
3. **数量列别名优先级修正**：`fields.quantity`(`:63`) 中**「箱数/箱數/carton_count」优先级高于「数量/數量/预计发货数量」**，避免命中总件数列。但模板显式指定数量列时，以模板为准（显式 > 启发式）。
4. **合计/空行剔除**：跳过名称列匹配 `汇总|合计|小计|total|合計` 的行、以及尺寸全空的行，**不产生 `INVALID_DIMENSIONS` 噪声错误**（这些是已知非数据行，静默跳过并在 summary 里计一个「skippedRows」计数，fail-loudly 地告诉用户跳了几行）。
5. **标签列**：模板指定 `label` 映射到哪一列时，**原样取该列值（去控制字符、限长），不再 `slice(0,2)`、不再 `toUpperCase` 截断**。未指定标签列时，回退到 `fallbackLabel(index)`（A/B/C…）而不是误用「代码/名称」列。

### B. `src/lib/importTemplates.ts` + 服务端模板存储

- 扩展模板 payload，新增字段以承载上述能力：
  - `headerRow`（已有字段，确保前后端持久化）、`startRow`。
  - `dimensionMode`: `'separate' | 'combined'`；当 `combined` 时记 `combinedColumn`、`dimensionOrder`、分隔符（或固定用内置集合）。
  - `labelColumn`（标签取哪一列；可空=用 fallback）。
- 服务端 `/api/import-templates`（`server/index.mjs`）schema 增列；**做好向后兼容**：旧模板缺新字段时按默认（separate / 无 combined / 无 labelColumn）解释。

### C. `src/Workbench.tsx`（导入流程 UI）

当前流程：`importExcel:2087` → `sheet_to_json`(默认首行 key, `:2100`) → `canAutoMap:2059` → 否则弹手动映射 modal。改为：

1. 选文件后，用 `sheet_to_json(sheet,{header:1})` 拿原始矩阵 + sheet 列表 + `!merges`。
2. **导入对话框**：
   - **模板下拉**：列出已存模板（`readImportTemplates()`），选中即套用其 headerRow/映射/单位/合并尺寸/标签列，直接进预览。
   - **「新建/编辑映射」**：让用户指定「表头在第几行」「数据从第几行」「各字段对应哪列」「是否合并尺寸列及其列/顺序/单位」「标签取哪列」；预览前 N 行解析结果。
   - 预览必须**显式展示**：识别到的表头行、各字段→列、单位、合并尺寸拆分结果、将跳过的合计/空行数 —— 用户确认后才导入（fail-loudly）。
   - 满意可「存为模板」供下次手动选。
3. 移除/改造 `canAutoMap` 自动直通路径（异形表本就不该自动直通）；保留：选了模板即可一键导入。

## 标签贯穿验证（核心业务约束）

导入后的 `CargoItem.label` 必须是用户指定列的真实值（如 `TB-C10-EV_v1.1`），并能继续走完 计算→2D/3D→分层→明细→导出→历史。计划要求至少一条 E2E 断言导入后某货物 label 在明细表/导出中保持原值。

## 执行顺序与提交粒度

1. `importCargo.ts`：header:1 矩阵 + headerRow 生效 + 合并尺寸拆分 + 合计行剔除 + 数量优先级 + 标签不截断 + 单测 → commit `feat(import): template-driven parsing for irregular sheets`。
2. `importTemplates.ts` + 服务端 schema 扩展 + 向后兼容 → commit `feat(import): persist header/dimension/label template fields`。
3. `Workbench` 导入对话框改造（模板下拉 + 映射编辑 + 预览确认 + 存模板）+ i18n → commit `feat(import): template picker and mapping preview`。
4. E2E（导入越南样本走通）→ commit。

## 验收标准（可断言优先）

**单测（`src/lib/importCargo.test.ts` 扩展）——用越南样本的真实行结构构造夹具：**
1. **表头行生效**：给「第 1 行合并标题 + 第 2 行真表头 + 第 3 行起数据」的矩阵 + `headerRow=2`，解析出的列名是真表头（`物料名称`/`箱数`/`外箱尺寸（mm）`…），不是 `__EMPTY`。
2. **合并尺寸拆分**：`"530*305*310"`（combined, mm, L×W×H）→ length=530,width=305,height=310（mm）。再测 `530×305×310`、`530 305 310`、全角 `＊` 至少各一例。cm 单位时 ×10。
3. **数量取箱数**：同时存在「预计发货数量=7056」「箱数=126」时，未显式指定则取 126；显式映射 quantity→`预计发货数量` 时取 7056（显式 > 启发式）。
4. **标签不被截断**：标签列=`物料代码SKU`，`TB-C10-EV_v1.1` 导入后 `label === 'TB-C10-EV_v1.1'`（断言**不等于** `'TB'`——这条专门防 `slice(0,2)` 回归）。
5. **合计行剔除**：含 `汇总` 行的矩阵解析后，`汇总` 行不进 items、不产生 `INVALID_DIMENSIONS` 错误，summary.skippedRows ≥1。
6. **向后兼容**：旧模板（无 dimensionMode/labelColumn）仍按 separate + fallback 解析，不抛错。
7. 端到端取数正确：用越南样本全 25 行夹具，断言 items 数=25、每行 label=对应 SKU、尺寸单位为 mm、quantity=箱数列。

**E2E（`npm run test:e2e`）：**
- 上传 `test-data/excel/越南第十一批6.2海运.xlsx` → 新建映射（表头第 2 行、合并尺寸列、标签列=SKU）→ 预览显示正确字段 → 导入 → 货物列表出现 25 项且某项 label 为完整 SKU。
- 存为模板 → 再次导入同文件选该模板 → 一键得到同样结果。

**回归门槛**：`npm run lint && npm test && npm run build` 全绿；现有导入测试（标准模板/标准表头）不退化；标签贯穿到明细/导出不丢。

## 遗留与风险

- 合并尺寸分隔符/顺序、合计行匹配词表为启发式，预览里必须可见、可纠正（已纳入流程）。
- 服务端 schema 变更需注意已部署库的迁移（加列 + 默认值），属中风险，部署时确认 better-sqlite3 迁移不破坏现有模板/历史。
- 备注列里的「实际数量只有15箱」这类自然语言修正**本轮不解析**（不让 LLM/启发式读自由文本），如客户有此需求由人工在导入后调整，记入 decision 后续项。
