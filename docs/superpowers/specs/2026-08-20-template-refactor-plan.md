# 模板功能重构实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use `subagent-driven-development`（推荐）或 `executing-plans` 逐任务实施。所有步骤使用复选框跟踪；本计划本身不授权跳过测试、部署或提交要求。

**Goal:** 按已确认的模板行为稿，重建“模板选择 → 映射与预览 → 模板保存或确认导入”流程，并让模板更新、另存为、重量默认、有效性校验和中英文反馈形成不可混淆的端到端合同。

**Architecture:** 保留 `Workbench`、`CargoImportDialog`、`ImportMappingForm`、`useTemplateCatalogs` 和现有 REST API。导入确认只保留两个显式阶段：模板选择，以及持续可编辑的映射与预览；不使用模板时从空白映射开始。纯映射校验和完整配置比较放在 `src/lib/importWorkflow.ts`，模板目录写操作仍由 `useTemplateCatalogs` 统一管理；`CargoImportDialog` 只产生标准 `CargoItem[]`，`Workbench` 继续拥有整体替换语义。

**Tech Stack:** React 18、TypeScript 6、Vitest、Testing Library、Playwright、Express 5、SQLite、SheetJS。

## Global Constraints

- 唯一产品基准：`docs/superpowers/specs/2026-08-19-import-template-behavior-design.md`，状态为“已确认”。
- 不使用模板时不得自动映射；所有源列映射以空白状态开始。
- 独立尺寸模式的长、宽、高，以及组合尺寸模式的组合列和尺寸顺序必须显示 `*`。
- 重量映射可选；未映射或空白重量内部为 `1 kg`，不提供默认重量输入或警告；非空非法、零或负数重量整批阻止。
- 已有模板的“更新模板”和“另存为模板”是两个显式动作；另存为必须输入不同且唯一的新名称。
- 模板保存、更新、另存均不得触发货物导入。
- 本轮不增加已有货物替换警告、二次确认或追加模式；不得向 `CargoImportDialog` 传入无消费价值的 `currentCargos`。
- 新增文案必须同时进入中文和英文文案源；优先完成中文视觉验收，但英文功能不得缺项。
- 旧模板交互测试不作为兼容合同；删除或改写与新行为稿冲突的断言，不得仅增加测试捷径绕过模板选择。
- 不新增全局状态库、表单库或状态机依赖。
- 每个任务更新 `CHANGELOG.md`、运行任务内验证并独立提交；失败先记录到 `decision.md`，不得削弱断言。
- UI、导入、模板和用户流程变更最终必须通过本地 E2E、benchmark、生产部署和远程 E2E。

---

## 0. 已核对的实现依据

### 允许复用的现有接口

- `src/components/CargoImportDialog.tsx`
  - `onConfirm(items, messages)`：只提交解析后的标准货物。
  - `onCreateTemplate(payload)`：POST 新模板或另存为模板。
  - `onUpdateTemplate(id, payload)`：PUT 明确更新已选模板。
  - `onRefreshTemplates()`：重试模板目录加载。
- `src/hooks/useTemplateCatalogs.ts`
  - `createImportTemplate(payload)`、`updateImportTemplate(id, payload)` 返回保存后的服务端模板，并负责刷新共享目录。
  - 现有 request-id、lifecycle epoch 和卸载守卫继续使用，不另建目录状态。
- `src/components/TemplateManagerPage.tsx`
  - 页面草稿保持页面局部状态；目录数据继续来自 `useTemplateCatalogs`。
  - 样例文件“最后请求获胜”和实体写锁模式必须保留。
- `src/lib/importCargo.ts`
  - `parseCargoRowsWithTemplate(rows, template, options)` 是映射后生成 `CargoItem[]`、错误和警告的唯一解析入口。
- `src/Workbench.tsx`
  - `dispatchPackingSession({ type: 'cargoImported', items })` 继续整体替换货物并清空自动结果。

### 禁止沿用的旧模式

- 删除 `CargoImportDialog` 对 `preSelectCol`、`preselectMapping` 和 `IMPORT_REQUIRED_FIELDS` 的使用；它们把“不使用模板”变成自动映射。
- 不使用 `canConfirmMapping` 自动推进到独立 `preview-ready` 阶段。
- 不根据模板名称是否相同推断 update/create；按钮本身决定调用 PUT 还是 POST。
- 不保留 `defaultValues.weight` UI、传输或解析回退。
- 不在 React 组件中硬编码中文或英文。
- 不增加仅测试可用的 phase 跳过入口。

## 1. 文件与职责

### 新建

- `src/components/TemplateSelectionPanel.tsx`：模板选择、空目录、加载失败和“不使用模板”入口；不持有远程状态。
- `src/components/TemplateSelectionPanel.test.tsx`：选择面板的中文、英文、空目录、失败和重试合同。
- `server/importTemplatePayload.mjs`：服务端模板 payload 的确定性清洗和有效性校验。
- `server/importTemplatePayload.test.mjs`：服务端拒绝无效配置并接受可选重量映射。
- `e2e/import-templates.spec.ts`：按行为稿场景 A–O 重建模板与导入验收。

### 修改

- `src/types.ts`：从 `ImportTemplateDefaults` 删除 `weight`。
- `src/lib/importCargo.ts`、`src/lib/importCargo.test.ts`：实现隐藏的内部 `1 kg` 重量规则。
- `src/lib/importWorkflow.ts`、`src/lib/importWorkflow.test.ts`：空白映射、必填/重复/缺列校验和完整配置比较。
- `src/components/ImportMappingForm.tsx`、`src/components/ImportMappingForm.test.tsx`：移除默认重量输入，添加必填 `*` 和说明。
- `src/components/CargoImportDialog.tsx`、`src/components/CargoImportDialog.test.tsx`：两阶段流程、持续预览、显式更新/另存为、保存锁和错误反馈。
- `src/components/TemplateManagerPage.tsx`、`src/components/TemplateManagerPage.test.tsx`：共享有效性校验和必填反馈。
- `src/api/importTemplates.ts`、`src/api/importTemplates.test.ts`：去掉重量默认值传输并保留 400/409 错误类别。
- `src/hooks/useTemplateCatalogs.test.ts`：验证显式 create/update 结果继续正确更新共享目录。
- `server/index.mjs`：复用服务端 payload 校验并返回稳定错误码。
- `src/data/workbenchCopy.ts`：补齐中英文模板流程文案。
- `src/Workbench.tsx`：接入新 props；保持导入替换边界，不传当前货物数据。
- `e2e/container-calc.spec.ts`：删除与新行为冲突的旧模板用例；其他 Excel 流程显式经过模板选择和手动映射。
- `CHANGELOG.md`、`decision.md`：逐任务记录实现、失败和最终验证。

---

### Task 1: 重量合同清洁切换

**Files:**
- Modify: `src/types.ts`
- Modify: `src/lib/importCargo.ts`
- Test: `src/lib/importCargo.test.ts`
- Modify: `src/lib/importWorkflow.test.ts`
- Modify: `src/components/ImportMappingForm.tsx`
- Test: `src/components/ImportMappingForm.test.tsx`
- Modify: `src/components/CargoImportDialog.tsx`
- Test: `src/components/CargoImportDialog.test.tsx`
- Test: `src/components/TemplateManagerPage.test.tsx`
- Modify: `src/data/workbenchCopy.ts`
- Modify: `src/api/importTemplates.ts`
- Test: `src/api/importTemplates.test.ts`
- Modify: `server/index.mjs`
- Modify: `CHANGELOG.md`

**Interfaces:**
- `ImportTemplateDefaults` 不再包含 `weight`。
- `parseCargoRowsWithTemplate()` 对未映射或空白重量产生 `weight: 1`，不产生重量警告。
- `parseCargoRows()` 对同样输入采用相同规则，避免两个解析入口形成不同合同。

- [ ] **Step 1: 写重量合同的失败测试**

在 `src/lib/importCargo.test.ts` 使用直接可读的工作表矩阵覆盖三类输入：

```ts
const dimensionsOnlyRows: ImportCargoRow[] = [
  ['L', 'W', 'H'],
  [100, 80, 60],
]
const dimensionsOnlyTemplate: ImportTemplateConfig = {
  mapping: { length: 'L', width: 'W', height: 'H' },
  headerRow: 1,
  startRow: 2,
}

it('uses an internal 1kg weight when weight is unmapped', () => {
  const result = parseCargoRowsWithTemplate(
    dimensionsOnlyRows,
    dimensionsOnlyTemplate,
    { createId: () => 'unmapped-weight' },
  )
  expect(result.errors).toEqual([])
  expect(result.warnings).not.toEqual(expect.arrayContaining([
    expect.objectContaining({ code: 'invalid-weight' }),
  ]))
  expect(result.items[0].weight).toBe(1)
})

it('uses an internal 1kg weight for a blank mapped cell', () => {
  const result = parseCargoRowsWithTemplate(
    [['L', 'W', 'H', 'Weight'], [100, 80, 60, '']],
    { ...dimensionsOnlyTemplate, mapping: { ...dimensionsOnlyTemplate.mapping, weight: 'Weight' } },
    { createId: () => 'blank-weight' },
  )
  expect(result.errors).toEqual([])
  expect(result.items[0].weight).toBe(1)
})

it.each(['bad', 0, -1])('rejects a non-empty invalid mapped weight %p', (weight) => {
  const result = parseCargoRowsWithTemplate(
    [['L', 'W', 'H', 'Weight'], [100, 80, 60, weight]],
    { ...dimensionsOnlyTemplate, mapping: { ...dimensionsOnlyTemplate.mapping, weight: 'Weight' } },
    { createId: () => 'invalid-weight' },
  )
  expect(result.errors).toEqual([
    expect.objectContaining({ code: 'invalid-weight', row: 2 }),
  ])
  expect(result.items).toEqual([])
})
```

同时修改组件/API 现有夹具：`ImportMappingForm` 不再渲染默认重量输入；`CargoImportDialog` 不再显示模板默认重量来源；模板和 API payload 均丢弃历史 `defaultValues.weight`。

- [ ] **Step 2: 运行聚焦测试并确认 RED**

Run:

```bash
npx vitest run src/lib/importCargo.test.ts src/lib/importWorkflow.test.ts src/components/ImportMappingForm.test.tsx src/components/CargoImportDialog.test.tsx src/components/TemplateManagerPage.test.tsx src/api/importTemplates.test.ts
```

Expected: 旧实现对缺失/空白重量返回 `invalid-weight`，且默认重量控件或 payload 断言失败。

- [ ] **Step 3: 实现最小重量规则**

在两个解析入口统一使用：

```ts
const rawWeight = valueFor(row, fields.weight)
const weight = rawWeight === undefined || rawWeight === null || String(rawWeight).trim() === ''
  ? 1
  : Number(rawWeight)

if (!Number.isFinite(weight) || weight <= 0) {
  errors.push({
    row: rowNumber,
    code: IMPORT_CODES.INVALID_WEIGHT,
    params: { row: rowNumber },
    message: 'Missing or invalid weight.',
  })
  return
}
```

同时完成以下清洁切换：

- 从 `ImportTemplateDefaults`、`normalizeDefaults`、`parseTemplatePayload` 和映射表单删除默认重量字段；
- 删除 `CargoImportDialog` 的 `effectiveTemplateDefaults.weight`、重量来源提示和相关测试；
- 删除 `workbenchCopy.ts`、组件 label 类型及测试 labels 中的 `templateDefaultWeight`；
- 读取旧模板时忽略 defaults JSON 中的 `weight`，下一次保存不再写回；
- 更新所有含 `defaultValues.weight` 的测试夹具，使它们改为映射真实重量列或验证内部 `1 kg`；
- 保留可选 `mapping.weight`，不得删除真实重量列映射。

- [ ] **Step 4: 运行聚焦测试和 build**

Run:

```bash
npx vitest run src/lib/importCargo.test.ts src/lib/importWorkflow.test.ts src/components/ImportMappingForm.test.tsx src/components/CargoImportDialog.test.tsx src/components/TemplateManagerPage.test.tsx src/api/importTemplates.test.ts
npm run build
```

Expected: 聚焦测试全绿；TypeScript 中不存在 `ImportTemplateDefaults['weight']` 消费；build 退出码 0。

- [ ] **Step 5: 更新日志并提交**

```bash
git add src/types.ts src/lib/importCargo.ts src/lib/importCargo.test.ts src/lib/importWorkflow.test.ts src/components/ImportMappingForm.tsx src/components/ImportMappingForm.test.tsx src/components/CargoImportDialog.tsx src/components/CargoImportDialog.test.tsx src/components/TemplateManagerPage.test.tsx src/data/workbenchCopy.ts src/api/importTemplates.ts src/api/importTemplates.test.ts server/index.mjs CHANGELOG.md
git commit -m "fix(import): make cargo weight mapping optional"
```

---

### Task 2: 建立模板配置有效性和差异比较合同

**Files:**
- Modify: `src/lib/importWorkflow.ts`
- Test: `src/lib/importWorkflow.test.ts`
- Create: `server/importTemplatePayload.mjs`
- Create: `server/importTemplatePayload.test.mjs`
- Modify: `server/index.mjs`
- Modify: `src/api/importTemplates.ts`
- Test: `src/api/importTemplates.test.ts`
- Modify: `CHANGELOG.md`

**Interfaces:**

```ts
export type ImportMappingValidation = {
  missingRequired: Array<'length' | 'width' | 'height' | 'combinedColumn' | 'dimensionOrder'>
  duplicateColumns: string[]
  missingColumns: string[]
  valid: boolean
}

export function emptyImportMappingValue(): ImportMappingValue
export function validateImportMappingValue(
  value: ImportMappingValue,
  availableColumns: readonly string[] | null,
): ImportMappingValidation
export function sameImportMappingValue(
  left: ImportMappingValue,
  right: ImportMappingValue,
): boolean
```

服务端模块的接口合同：

```ts
type ImportTemplatePayloadResult =
  | { ok: true; value: NormalizedImportTemplatePayload }
  | { ok: false; code: 'invalid-template'; message: string }

export function parseImportTemplatePayload(body: unknown): ImportTemplatePayloadResult
```

客户端 API 导出：

```ts
export class ImportTemplateRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: 'duplicate-name' | 'invalid-template' | 'request-failed',
  )
}
```

- [ ] **Step 1: 写纯逻辑失败测试**

覆盖：

- 空白值在独立模式缺少 length/width/height；
- 组合模式只要求 combinedColumn 和三项唯一 dimensionOrder；
- 非活动尺寸映射不参与重复判断；
- 活动字段把同一列映射到两个业务字段时返回该列；
- `availableColumns === null` 表示没有加载样例文件，只校验必填和重复映射；空数组表示已加载文件但没有可用表头，必须报告缺列；
- 所选模板引用当前文件缺失列时返回 `missingColumns`；
- 完整配置比较覆盖 mapping、units、headerRow、startRow、dimensionMode、combinedColumn、dimensionOrder 和 defaults；
- 对象 key 顺序不同但语义相同不得判为修改；
- 服务端拒绝缺尺寸、重复映射和空名称，接受未映射重量；
- API 将 HTTP 409 映射为 `duplicate-name`，HTTP 400 映射为 `invalid-template`。

- [ ] **Step 2: 运行聚焦测试并确认 RED**

```bash
npx vitest run src/lib/importWorkflow.test.ts server/importTemplatePayload.test.mjs src/api/importTemplates.test.ts
```

Expected: 新接口尚未定义，测试失败。

- [ ] **Step 3: 实现纯校验并接入服务端**

- 使用活动尺寸模式构建参与校验的非空源列集合；
- `valid` 仅在 `missingRequired`、`duplicateColumns`、`missingColumns` 全空时为真；
- 服务端 `POST`/`PUT /api/import-templates` 先调用 `parseImportTemplatePayload`，失败返回 `400` 和稳定 `code`；
- SQLite `UNIQUE(user_id, name)` 仍是最终唯一性权威，冲突返回 `409`、`code: 'duplicate-name'`；
- 客户端读取 JSON 错误并抛出 `ImportTemplateRequestError`，不得把 400/409 都压成“保存模板失败”。

- [ ] **Step 4: 删除旧自动映射入口**

通过 LSP references 确认调用点后，删除 `canAutoMap`、`preSelectCol`、`preselectMapping`、`IMPORT_REQUIRED_FIELDS` 及其旧测试；真实 Excel 测试改为显式构造映射，不用另一个测试 helper 重现自动映射。

- [ ] **Step 5: 验证并提交**

```bash
npx vitest run src/lib/importWorkflow.test.ts server/importTemplatePayload.test.mjs src/api/importTemplates.test.ts
npm run build
git add src/lib/importWorkflow.ts src/lib/importWorkflow.test.ts server/importTemplatePayload.mjs server/importTemplatePayload.test.mjs server/index.mjs src/api/importTemplates.ts src/api/importTemplates.test.ts src/lib/importCargo.test.ts CHANGELOG.md
git commit -m "feat(template): validate import template configurations"
```

Expected: 聚焦测试和 build 全绿；服务端无第二套宽松校验路径。

---

### Task 3: 显示必填标识并补齐双语文案

**Files:**
- Modify: `src/components/ImportMappingForm.tsx`
- Test: `src/components/ImportMappingForm.test.tsx`
- Modify: `src/data/workbenchCopy.ts`
- Modify: `CHANGELOG.md`

**Interfaces:**

`ImportMappingForm` 根据 `value.dimensionMode` 自己派生必填尺寸字段，不新增可漂移的 `requiredFields` prop。新增 labels：

```ts
mappingRequiredMarkerHint: string
mappingRequiredField: string
```

模板流程同时增加以下中文/英文 key：

```ts
templateSelectionTitle
templateSelectionEmpty
templateSelectionBack
templateUseWithout
templateUpdateExplicit
templateSaveAs
templateSaveAsName
templateNameRequired
templateNameUnchanged
templateNameDuplicate
templateConfigInvalid
templateSaveFailed
```

- [ ] **Step 1: 写必填标识失败测试**

断言：

- separate 模式只有长、宽、高标签含视觉 `*` 和可访问 required 描述；
- combined 模式只有组合尺寸列和尺寸顺序含 `*`；
- 标签、名称、重量、数量、颜色和业务限制不含 `*`；
- 中文和英文 labels 均能完整渲染，不使用组件硬编码文本。

- [ ] **Step 2: 运行测试确认 RED**

```bash
npx vitest run src/components/ImportMappingForm.test.tsx
```

- [ ] **Step 3: 实现标识和 copy**

使用独立装饰节点而不是修改业务字段名称：

```tsx
<span aria-hidden="true" className="text-red-600">*</span>
<span className="sr-only">{labels.mappingRequiredField}</span>
```

在表单顶部显示 `mappingRequiredMarkerHint`。所有新文案只从 `workbenchCopy.ts` 读取。

- [ ] **Step 4: 验证并提交**

```bash
npx vitest run src/components/ImportMappingForm.test.tsx
npm run lint
git add src/components/ImportMappingForm.tsx src/components/ImportMappingForm.test.tsx src/data/workbenchCopy.ts CHANGELOG.md
git commit -m "feat(import): mark required mapping fields"
```

---

### Task 4: 重建模板选择和映射预览流程

**Files:**
- Create: `src/components/TemplateSelectionPanel.tsx`
- Create: `src/components/TemplateSelectionPanel.test.tsx`
- Modify: `src/components/CargoImportDialog.tsx`
- Test: `src/components/CargoImportDialog.test.tsx`
- Modify: `src/Workbench.tsx`
- Modify: `CHANGELOG.md`

**Interfaces:**

```ts
export type ImportPhase = 'template-selection' | 'mapping-preview'
export type TemplateSelectionMode = 'none' | 'existing'

export type TemplateSelectionPanelLabels = {
  templateSelectionTitle: string
  templateSelectionEmpty: string
  templateUseWithout: string
  importTemplateLoadFailed: string
  importTemplateRetry: string
}

export type TemplateSelectionPanelProps = {
  templates: ImportTemplate[]
  loadFailed: boolean
  labels: TemplateSelectionPanelLabels
  onSelectNone: () => void
  onSelectTemplate: (templateId: string) => void
  onRetry: () => void
}
```

`CargoImportDialog` 的本地 `Labels` 类型扩展 `TemplateSelectionPanelLabels`；选择状态使用 `TemplateSelectionMode | null`，其中 `null` 只表示用户尚未在首屏作出选择。

`CargoImportDialog` 保留现有 `colors`、`onConfirm`、`onClose`、`onRefreshTemplates`、`onCreateTemplate` 和 `onUpdateTemplate`；不增加 `currentCargos`。

- [ ] **Step 1: 写两阶段流程失败测试**

覆盖：

- 首次渲染只显示模板选择，不显示映射表单；
- 选择“不使用模板”后 `mapping` 全为空；
- 选择已有模板后完整应用模板配置；
- 映射有效后仍停留在 `mapping-preview`，映射和预览同时可见；
- “返回模板选择”可用，重新选择会替换未保存草稿；
- 模板目录加载失败时同时显示错误、重试和“不使用模板”，手动导入不被目录故障阻断；
- Escape 或取消不会调用 `onConfirm`。

- [ ] **Step 2: 运行组件测试确认 RED**

```bash
npx vitest run src/components/TemplateSelectionPanel.test.tsx src/components/CargoImportDialog.test.tsx
```

- [ ] **Step 3: 实现显式阶段和完整会话重置**

- 初始 phase 固定为 `template-selection`；
- `selectNone()` 使用 `emptyImportMappingValue()`，不读取表头；
- `selectTemplate(id)` 使用 `importMappingValueFromTemplate(template)`；
- 同一映射/预览阶段持续计算 `pendingImport`；
- 新 `importRows` 会重置 phase、选择、映射、保存名称、保存状态、比较基线、缺列和 pending action；
- 保留现有 focus trap 和 Escape 行为；
- `Workbench` 继续仅在 `onConfirm` 中 dispatch `cargoImported`。

- [ ] **Step 4: 验证并提交**

```bash
npx vitest run src/components/TemplateSelectionPanel.test.tsx src/components/CargoImportDialog.test.tsx
npm run build
git add src/components/TemplateSelectionPanel.tsx src/components/TemplateSelectionPanel.test.tsx src/components/CargoImportDialog.tsx src/components/CargoImportDialog.test.tsx src/Workbench.tsx CHANGELOG.md
git commit -m "feat(import): add explicit template selection flow"
```

---

### Task 5: 实现显式保存、更新和另存为

**Files:**
- Modify: `src/components/CargoImportDialog.tsx`
- Test: `src/components/CargoImportDialog.test.tsx`
- Modify: `src/hooks/useTemplateCatalogs.test.ts`
- Modify: `CHANGELOG.md`

**Interfaces:**

```ts
type TemplateWriteAction = 'create' | 'update' | 'copy'
type PendingTemplateWrite = TemplateWriteAction | null
```

动作和 API 必须一一对应：

| 当前状态 | 可见动作 | API |
| --- | --- | --- |
| 不使用模板，配置有效 | 保存为模板 | `onCreateTemplate(payload)` |
| 已有模板，配置未修改 | 无模板写动作 | 无 |
| 已有模板，配置已修改 | 更新模板 | `onUpdateTemplate(selectedId, payloadWithOriginalName)` |
| 已有模板，配置已修改 | 另存为模板 | `onCreateTemplate(payloadWithNewName)` |

- [ ] **Step 1: 写动作边界失败测试**

覆盖：

- 完整配置未变时不显示更新/另存为；
- 任一 mapping、unit、行号、尺寸模式、组合列、顺序或可见默认值变化后同时显示两个动作；
- 更新只调用 `onUpdateTemplate` 且使用原模板名称；
- 另存为在输入框前显示 `*`，空名称、原名称和目录重名在发请求前阻止；
- 另存为只调用 `onCreateTemplate`；
- 400/409/网络失败显示本地化错误并保留草稿；
- pending 时三个写动作全部禁用，重复点击只发一个请求；
- 保存成功后对话框保持打开、`onConfirm` 未调用，并以返回模板重置比较基线。

- [ ] **Step 2: 运行测试确认 RED**

```bash
npx vitest run src/components/CargoImportDialog.test.tsx src/hooks/useTemplateCatalogs.test.ts
```

- [ ] **Step 3: 实现三个明确 handler**

```ts
async function handleCreateTemplate(name: string): Promise<void>
async function handleUpdateTemplate(): Promise<void>
async function handleSaveTemplateCopy(name: string): Promise<void>
```

共同要求：

- 先执行 `validateImportMappingValue`；无效时不发请求；
- trim 名称并以当前 `importTemplates` 做即时唯一性检查，服务端 409 仍是最终权威；
- 请求成功后使用服务端返回对象更新 selected ID、选择模式和比较基线；
- 请求失败只更新错误状态，不清空输入、映射或模板选择；
- 不写入或自动读取 `cargo_last_used_template_id` 来跳过模板选择。

- [ ] **Step 4: 验证并提交**

```bash
npx vitest run src/components/CargoImportDialog.test.tsx src/hooks/useTemplateCatalogs.test.ts
npm run lint
npm run build
git add src/components/CargoImportDialog.tsx src/components/CargoImportDialog.test.tsx src/hooks/useTemplateCatalogs.test.ts CHANGELOG.md
git commit -m "feat(template): separate update and save-as actions"
```

---

### Task 6: 让模板管理页服从同一有效性合同

**Files:**
- Modify: `src/components/TemplateManagerPage.tsx`
- Test: `src/components/TemplateManagerPage.test.tsx`
- Modify: `CHANGELOG.md`

**Interfaces:**
- 新建和编辑草稿都调用 `validateImportMappingValue(draftToMappingValue(draft), sampleRows.length > 0 ? availableColumns : null)`。
- 没有样例文件时传 `null`，只校验必填和重复映射；加载样例后传真实列数组并额外校验缺列。
- 模板名称使用与导入对话框相同的 trim 和当前用户目录唯一性规则。

- [ ] **Step 1: 写管理页失败测试**

覆盖：

- 只有名称但缺尺寸映射时不能创建；
- 新建和编辑模板名称前显示 `*`，更新已有模板时名称仍不可为空；
- 重复源列同时标记两个目标字段并阻止保存；
- 重量未映射仍可保存有效模板；
- 编辑为无效配置时 PUT 不发送；
- 重名和 API 409 保留新建/编辑草稿；
- 连续样例读取最后请求获胜、失败清空旧列、同实体写锁和页面卸载守卫继续通过；
- 管理操作不调用任何货物导入回调，也不打开 `CargoImportDialog`。

- [ ] **Step 2: 运行测试确认 RED**

```bash
npx vitest run src/components/TemplateManagerPage.test.tsx
```

- [ ] **Step 3: 接入共享校验和错误显示**

- 保存按钮同时服从名称、映射有效性和 pending 状态；
- 错误显示在对应草稿内，不使用全局成功 notice 表示失败；
- 400、409 和网络失败采用 Task 3 的本地化文案；
- 不改变既有远程目录/页面草稿分层。

- [ ] **Step 4: 验证并提交**

```bash
npx vitest run src/components/TemplateManagerPage.test.tsx
npm run build
git add src/components/TemplateManagerPage.tsx src/components/TemplateManagerPage.test.tsx CHANGELOG.md
git commit -m "fix(template): block invalid template drafts"
```

---

### Task 7: 按场景 A–O 重建自动化验收

**Files:**
- Create: `e2e/import-templates.spec.ts`
- Modify: `e2e/container-calc.spec.ts`
- Modify: `src/components/CargoImportDialog.test.tsx`
- Modify: `src/components/TemplateManagerPage.test.tsx`
- Modify: `src/lib/importCargo.test.ts`
- Modify: `src/lib/importWorkflow.test.ts`
- Modify: `CHANGELOG.md`

**Acceptance mapping:**

| 行为稿场景 | 自动化层级 |
| --- | --- |
| A 模板选择首屏 | Component + E2E |
| B 空白手动映射与 `*` | Component + E2E |
| C 映射/预览不自动跳步 | Component + E2E |
| D 缺失/空白重量为 `1 kg` | Lib + E2E |
| E 非空非法重量阻止 | Lib + E2E |
| F 保存无模板映射 | Component + API + E2E |
| G 更新已选模板 | Component + API + E2E |
| H 另存为新模板 | Component + API + E2E |
| I 无效模板不能保存 | Lib + Server + Component + E2E |
| J 模板缺列 | Lib + Component + E2E |
| K 取消无隐藏修改 | Component + E2E |
| L 确认后整体替换 | Reducer existing contract + E2E |
| M 模板管理独立 | Component + E2E |
| N 中英文完整 | Component + E2E |
| O 两个真实文件 | Lib + E2E |

- [ ] **Step 1: 删除冲突的旧模板验收**

从 `e2e/container-calc.spec.ts` 删除或迁移依赖以下旧行为的测试步骤：弹窗打开即有映射、无模板自动选择列、名称相同即静默 PUT、无需模板选择即可确认。保留 Excel 导出、标签、装箱和真实业务结果断言，但把导入前置步骤改为真实模板选择和手动映射。

- [ ] **Step 2: 编写新的真实 UI 流程**

`e2e/import-templates.spec.ts` 必须通过可见控件完成 A–N，不直接调用组件 handler、localStorage 或仅测试可用 API。每个写操作使用唯一名称并在用例结束删除测试模板，避免并行污染。

关键断言：

```ts
await expect(page.getByTestId('template-selection-panel')).toBeVisible()
await page.getByTestId('use-without-template').click()
await expect(page.getByTestId('map-select-length')).toHaveValue('')
await expect(page.getByTestId('mapping-required-length')).toBeVisible()
await expect(page.getByTestId('mapping-preview')).toBeVisible()
```

更新/另存为用例必须重新打开同格式文件，分别证明原 ID 被更新和原模板仍存在的新模板创建结果；保存后均断言货物清单未变化。

- [ ] **Step 3: 使用真实夹具覆盖场景 O**

- 俄罗斯文件：明确选择“不使用模板”后手动映射，或先通过 UI 创建有效模板；识别 31 托，并在 `13400 × 2450 × 2650 mm` 下装入 31/31；
- 越南文件：明确设置表头行、数据行、组合尺寸列、顺序、单位、箱数和重量列；形成 24 条有效货物；
- 不得修改 `test-data/excel`、减少行数或放宽装箱约束。

- [ ] **Step 4: 运行聚焦自动化**

```bash
npx vitest run src/lib/importCargo.test.ts src/lib/importWorkflow.test.ts src/components/ImportMappingForm.test.tsx src/components/TemplateSelectionPanel.test.tsx src/components/CargoImportDialog.test.tsx src/components/TemplateManagerPage.test.tsx src/api/importTemplates.test.ts src/hooks/useTemplateCatalogs.test.ts server/importTemplatePayload.test.mjs
npx playwright test e2e/import-templates.spec.ts
```

Expected: 行为稿 A–O traceability 无空项，聚焦单元/组件/API/server/E2E 全绿且无跳过。

- [ ] **Step 5: 提交验收重建**

```bash
git add e2e/import-templates.spec.ts e2e/container-calc.spec.ts src/components/CargoImportDialog.test.tsx src/components/TemplateManagerPage.test.tsx src/lib/importCargo.test.ts src/lib/importWorkflow.test.ts CHANGELOG.md
git commit -m "test(template): rebuild import template acceptance"
```

---

### Task 8: 完整门禁、文档、部署和远程回归

**Files:**
- Modify: `CHANGELOG.md`
- Modify only on a real newly discovered decision: `decision.md`

- [ ] **Step 1: 检查禁止模式**

使用项目搜索确认：

- `CargoImportDialog` 不再引用 `preSelectCol`、`preselectMapping`、`IMPORT_REQUIRED_FIELDS`；
- 不存在 `preview-ready` 或基于 `canConfirmMapping` 的 phase 自动推进；
- 不存在 `defaultValues.weight`、默认重量输入或重量默认提示；
- `currentCargos` 没有作为未使用 props 加入导入对话框；
- 新增模板文案全部来自 `workbenchCopy.ts`；
- `cargo_last_used_template_id` 不会绕过初始模板选择。

- [ ] **Step 2: 运行本地完整门禁**

按固定顺序运行：

```bash
npm run lint
npm test
npm run build
npm run test:e2e
npm run benchmark
```

Expected: 所有命令退出码 0；Vitest 和 Playwright 无 skipped；benchmark 不修改 baseline、阈值、样本或 golden。

任何失败先按实际输出写入 `decision.md`；只修实现根因，不修改夹具或削弱断言，然后从受影响聚焦测试开始复验，最后重新执行完整门禁。

- [ ] **Step 3: 更新 CHANGELOG 并提交本地收口**

记录：各命令精确通过数量、A–O 覆盖、两份真实 Excel 的识别数量、俄罗斯 31/31、benchmark 结果，以及没有执行断言/基线降级。

```bash
git add CHANGELOG.md decision.md
git commit -m "docs: record import template verification"
```

只有 `decision.md` 实际发生变化时才加入该文件。

- [ ] **Step 4: 按仓库生产流程部署**

```bash
npm run deploy
```

记录生产备份路径、健康检查、发布版本和静态资产结果；部署脚本失败时停止，不得继续宣称远程验收。

- [ ] **Step 5: 运行远程 E2E**

使用生产 base URL 运行完整 Playwright 套件，并额外重复 `e2e/import-templates.spec.ts`：

```bash
PLAYWRIGHT_BASE_URL=http://101.33.232.150 npm run test:e2e
PLAYWRIGHT_BASE_URL=http://101.33.232.150 npx playwright test e2e/import-templates.spec.ts
```

Expected: 全量和模板聚焦套件均无失败、无跳过；远程模板写操作使用隔离名称并清理测试数据。

- [ ] **Step 6: 提交部署记录并推送通知**

```bash
git add CHANGELOG.md decision.md
git commit -m "docs: record import template deployment"
```

仅提交实际变化文件。通知必须列出行为变化、本地门禁、远程门禁、真实夹具结果和任何仍为 RED 的项目；存在 RED 时不得称为完成。

---

## 风险守卫

1. **映射自动跳步**：phase 只由用户动作改变，解析有效性只控制按钮，不控制阶段。
2. **写操作误路由**：update handler 固定 PUT；create/copy handler 固定 POST；禁止根据名称推断。
3. **隐藏默认重量掩盖脏数据**：只有缺失或 trim 后空白使用 `1 kg`，任何非空无效值进入结构化错误。
4. **目录竞态**：沿用 `useTemplateCatalogs` request ID 和 lifecycle epoch；对话框增加单写 pending 锁，不建立第二份目录。
5. **无效模板入库**：客户端改善即时反馈，服务端 400 是最终有效性权威，数据库 409 是最终唯一性权威。
6. **中英文漂移**：组件测试使用真实中文/英文 copy，不再只靠 identity proxy 证明文案存在。
7. **旧 E2E 假绿**：不得加入仅测试 phase 跳过、自动映射 helper 或直接状态注入；必须走用户可见控件。
8. **职责耦合**：`CargoImportDialog` 不读取当前货物；未来追加/替换模式由 `Workbench` 在 `onConfirm` 边界扩展。

## 完成定义

- 行为稿场景 A–O 各有明确自动化证据；
- 聚焦测试、本地 `lint/test/build/test:e2e/benchmark`、生产部署和远程 E2E 全部有真实输出记录；
- 两个真实 Excel 夹具满足 31 托和 24 条合同，俄罗斯装箱为 31/31；
- 未修改测试夹具、golden、benchmark baseline、阈值或业务断言；
- 每个任务有独立 commit 和 CHANGELOG 记录；
- 无兼容别名、废弃 props、默认重量旧路径或自动字段映射残留。
