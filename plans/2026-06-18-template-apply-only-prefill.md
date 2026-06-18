# 计划：选模板=仅应用参数预填（撤销"选模板即导入"）

来源反馈（2026/6/18 第38轮）：上一轮 `plans/2026-06-18-template-select-triggers-import.md` 把"选模板"设计成**直接解析+关窗导入**（commit `e2eaa6b`），是**架构师理解错误**。用户实测现象：「选择了模板以后，直接弹窗就消失了」。

**用户真实诉求（已澄清）**：
- 选模板 = **只把模板的参数（列映射 + 表头行/起始行/单位/合并模式/拆分顺序/默认值）应用、预填到映射弹窗**。
- 弹窗**保持打开**，预览表与各列映射照常可见，**用户查看确认后再点"确认导入"**才真正导入。
- "再次导入不用重新选映射" = 选了模板这些映射就自动填好了，省掉逐列手选；**不是**省掉查看/确认那一步。

**本质**：回到 `e2eaa6b` 之前 `applyImportTemplate` 的"仅预填"语义，但**保留** `e2eaa6b` 引入的有用增量（缺列红框 / `missingColumns`），只去掉"自动解析+关窗"。

单一子任务，一个 commit。

---

## 子任务 1 下拉选模板只预填、不导入、不关窗

- **根因**：commit `e2eaa6b` 把弹窗模板下拉 `onChange`（`src/Workbench.tsx:4356` 附近）从 `applyImportTemplate(value)` 改成了 `importWithTemplate(template)`，后者（:2010 区域新增）会 `parseCargoRowsWithTemplate` 解析、`applyImportedCargo` 写货物、`setShowMappingModal(false)` 关窗、`setActiveNav('report')` 跳走。于是"选模板=确认导入"。
- **意图**（精确回退该处，保留红框能力）：
  1. **下拉 `onChange` 改回只预填**：选中模板 → `applyImportTemplate(template.id)`；选「无」→ `applyImportTemplate('')`。**不解析、不 setCargoItems、不关窗、不跳 nav**。
  2. **删除 `importWithTemplate` 函数**（`e2eaa6b` 新增的那个），它是"选即导入"的载体，回退后无引用。
  3. **保留缺列红框**：`applyImportTemplate` 里在预填后计算 `missingMappedColumns` 并 `setMissingImportColumns(...)`，让用户预填后立刻看到"模板映射的某列在该文件中不存在"的红框（红框来自 `ImportMappingForm` 的 `missingColumns` prop，已实现，保留）。选「无」时清空 missing。
  4. **导入仍只走"确认导入"按钮** → `confirmMappingImport`（:1961 区域），该函数已用当前 state（含模板预填后的 `customMapping` 等）解析，**不动**。这样选模板→预填→（看预览/改任意列）→点确认→导入，符合诉求。
  5. **`rememberSelectedImportTemplate`**：从"选模板时记"挪到**确认导入成功后记**（`confirmMappingImport` 内，沿用 `e2eaa6b` 已有的 `rememberSelectedImportTemplate(selectedImportTemplateId)` 调用即可），避免"只是选来看看没导入"也被记成上次用。
- **边界**：
  - **不恢复** on-open 自动套用 lastUsedTemplate（用户明确："默认不加载模板"仍成立）；弹窗打开时下拉默认「无」、仅 `preSelectCol` 列名启发式预选保留。
  - **保留** `e2eaa6b` 的纯函数 `importMappingValueFromTemplate` / `mappedColumnsForTemplateValue` / `missingMappedColumns` / `buildTemplateImportConfig`（仍被 `applyImportTemplate` 红框计算与单测使用）。若删 `importWithTemplate` 后 `buildTemplateImportConfig` 无引用，可保留导出 + 单测（它编码"模板对象→解析config"，留作纯函数无害）或一并清理，**二选一并在 commit 说明里讲清**。
  - **不改** `confirmMappingImport` 解析逻辑、`ImportMappingForm`、后端 schema、编辑/新增模板路径。
  - 手动逐列映射路径（「无」+ 手填 + 确认）完全不变。
- **验证标准**：
  - E2E（核心，编码本轮诉求）：保存一个模板 → 上传同格式文件 → 弹窗打开（下拉「无」）→ 在下拉**选中该模板** → **断言弹窗仍可见**（`mapping-modal` 可见）、各列映射输入框已按模板**预填**（如 `map-select-quantity` value=模板里的列名）、`confirm-mapping` 按钮可见 → **点确认** → 弹窗关闭、明细出现货物。旧实现此处选完即关窗，本断言能让旧行为失败。
  - E2E（防回归）：选模板后**不点确认直接关弹窗** → 明细**没有**新货物（编码"选模板≠导入"）。
  - E2E（红框保留）：模板映射了文件中不存在的列 → 选模板后该列输入框 `data-invalid="true"`（红框可见），弹窗仍开。
  - E2E（默认不加载）：上传文件时下拉默认 value=''（不自动套模板）。
  - 单测：`importCargo.test.ts` 关于 `buildTemplateImportConfig` 的断言保持（若保留该函数）。

---

## 必跑验证
- `npm run lint && npm test && npm run build`。
- 本轮属导入流程/UI → 额外 `npm run test:e2e`，重点跑模板相关用例（选模板预填、确认导入、红框、默认无模板）。
- 真实夹具 `越南第十一批6.2海运.xlsx`：保存模板 → 选模板预填 → 确认 → 导入成功。测试失败先记 `decision.md`，不弱化断言。

## 风险与回归门槛
- **核心是精确回退一处 onChange + 删一个函数**，不要顺手改 `confirmMappingImport` / 解析 / `ImportMappingForm`，避免扩大改动面。
- 必须保证"确认导入"按钮路径用的是模板预填后的 state（`customMapping`/`templateHeaderRow`/…），即 `applyImportTemplate` 的 setState 已生效后用户才点确认——天然满足（用户手动点击，state 早已落定），无 `e2eaa6b` 那种"setState 后立刻 parse 读旧值"的时序坑。
- 之前 `e2eaa6b` 写过的 E2E「选模板即导入」用例需**改写**为「选模板预填、确认才导入」，**不为通过弱化断言**；改不动先记 `decision.md`。
- `decision.md` 记一条：撤销"选模板即导入"决策，更正为"选模板=仅应用参数预填，确认才导入"，注明上一轮理解偏差的根因（架构师误读诉求）。
