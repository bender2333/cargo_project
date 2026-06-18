# 计划：导入弹窗"保存模板"= 选中即更新 + 失败不再静默

来源反馈（2026/6/18 第39轮）：用户对导入弹窗顶部「保存模板」按钮（`save-import-template`）提出两点：
1. **生效语义不对**：选中了某个模板、在弹窗里改了参数（如把分列改成合并、补了合并尺寸列）后点「保存模板」，期望是**更新当前这条模板**；现状却是永远新建一条，且因后端名字唯一约束会撞 409 失败。
2. **失败静默**：保存失败时（401/网络/409 等）按钮看起来"什么都没发生"，无任何提示，违反"Fail Loudly"。

**已决策（与用户确认）**：
- 保存语义＝**选中了就更新，改名才新建**（PUT vs POST）。
- 失败反馈＝**alert**，与旁边 `saveNewImportTemplate`(:2282)、`saveEditedImportTemplate`(:2216) 一致（Convention Over Novelty，不引入第二种风格）。

单一子任务，一个 commit。

---

## 子任务 1 handleSaveImportTemplate 改为"选中即更新"并补失败提示

- **根因**：`handleSaveImportTemplate`（`src/Workbench.tsx:2179`）**只调 `saveImportTemplate`（POST）**，从不调 `updateImportTemplate`（PUT）。后端 `POST /api/import-templates`（`server/index.mjs:371`）永远 `INSERT` 新 UUID，且 name 有 UNIQUE 约束 → 同名 POST 返回 409（:386-388）。叠加 `if (!saved) return`（:2194）静默 → 用户改完参数点保存，撞 409 后毫无反馈，参数没存进去。
- **意图**（最小改动，复用现有 PUT/POST 两条 lib 通道）：
  - 在 `handleSaveImportTemplate` 内判定**是否更新**：
    - 取当前选中模板 `const selected = importTemplates.find(t => t.id === selectedImportTemplateId)`。
    - **更新条件**：`selectedImportTemplateId` 非空 **且** 选中模板存在 **且** `name === selected.name`（名字未改）→ 走 `updateImportTemplate(selected.id, payload)`（PUT，`importTemplates.ts:32`）。
    - 否则（未选模板 / 改了名字 / 选中项已不存在）→ 走 `saveImportTemplate(payload)`（POST，新建/另存为）。
  - payload 字段与现状一致（mapping/units/headerRow/startRow/mergeRows:'none'/dimensionMode/combinedColumn(`|| customMapping.dimensions || ''`)/dimensionOrder/defaultValues），**用弹窗当前最新 state 打包**——这正是"补了合并列后点保存能存进去"的关键，state 已是最新值，无时序问题。
  - **成功反馈**：更新走 `t.templateUpdated`（已存在，:239/:538「模板已更新」），新建走 `t.templateSaved`。沿用现有 `setTemplateSaveNotice` 绿条 + `setImportMessages` 插一条 + `setSelectedImportTemplateId(saved.id)` + 把返回对象 upsert 进 `importTemplates`（更新时 `map` 替换该条，新建时前插）。
  - **失败反馈（修静默）**：`updateImportTemplate`/`saveImportTemplate` 返回 `null` 时，`alert(locale==='zh' ? '保存模板失败' : 'Failed to save template')`（与 :2282/:2216 同风格），**不再静默 return**。
- **边界**：
  - 只改 `handleSaveImportTemplate`（:2179-2206）一个函数。**不动**后端、不动 `saveImportTemplate`/`updateImportTemplate` lib、不动导航页新建/编辑路径、不动下拉选模板 onChange（那是 plans/2026-06-18-template-apply-only-prefill.md 的事，独立）。
  - 名字唯一约束：更新走 PUT 不受 name UNIQUE 影响（同名即自身）；新建走 POST 若用户键入了一个**已存在的别的模板名** → 后端 409 → 现在会 `alert` 告知（不再静默）。本轮**不做**"同名覆盖确认"——超出范围，如需另开一轮。
  - 「保存模板」按钮 `disabled={!templateName.trim()}`（:4322）不变；按钮文案保持 `t.templateSave`（更新/新建共用一个按钮，由逻辑自动判定，符合用户"就一个保存按钮"的现状预期）。
- **验证标准**：
  - E2E（核心，编码"选中即更新"）：保存一个分列模板（如名 `T1`）→ 重新上传文件、下拉选中 `T1`（预填）→ 在弹窗把维度模式改成合并、选合并尺寸列 → **不改名字**点「保存模板」→ 断言：模板总数**不增加**（仍只有 `T1` 一条，`import-template-select` option 数量不变），且重新选 `T1` 后维度模式=合并、合并列=刚选的列。旧实现此处会撞 409 静默失败或多出一条，能失败。
  - E2E（改名=新建/另存为）：选中 `T1` → 把名字改成 `T2` → 保存 → 断言模板列表新增 `T2`，`T1` 原样保留。
  - E2E（失败不静默）：模拟保存失败（断后端 / 拦截 `/api/import-templates` 返回非 2xx）→ 点保存 → 断言出现失败提示（alert 文案"保存模板失败"/"Failed to save template"）。编码"Fail Loudly"。
  - 防回归：未选任何模板（下拉「无」）+ 手动配映射 + 命名 + 保存 → 走新建，列表新增该模板（现有行为不破）。

---

## 必跑验证
- `npm run lint && npm test && npm run build`。
- 导入流程/UI → 额外 `npm run test:e2e`，重点：选中更新、改名另存、保存失败提示、未选新建。
- 真实夹具 `越南第十一批6.2海运.xlsx` 可作为保存/更新对象。测试失败先记 `decision.md`，不弱化断言。

## 风险与回归门槛
- **判定条件要精确**：必须 `selectedImportTemplateId` 有值 **且** 选中模板仍存在 **且** 名字未改，三者同时满足才 PUT；任一不满足走 POST。避免"删了该模板后又点保存"PUT 到不存在的 id（后端 PUT 返回 404 → 现在会 alert，可接受）。
- 与 `plans/2026-06-18-template-apply-only-prefill.md` **相互独立**，两份计划可任意先后执行；都改 `Workbench.tsx` 但不同函数（本轮 `handleSaveImportTemplate`，那轮下拉 onChange + 删 `importWithTemplate`），注意合并时别互相覆盖。
- `decision.md` 记一条：保存语义＝选中即更新/改名新建；失败 alert 不静默；不做同名覆盖确认（范围外）。
