# 模板功能重构方案与实施计划

- 日期：2026-08-20
- 文档类型：技术实施方案
- 前置文档：`2026-08-19-import-template-behavior-design.md`

## 1. 重构目标

按产品行为稿 `2026-08-19-import-template-behavior-design.md` 重构模板功能，实现：

1. **文件导入后先进入模板选择**：解析成功后展示"选择已有模板"或"不使用模板"。
2. **模板选择属于导入确认流程**：不跳转到独立模板管理页，在当前导入确认中完成。
3. **未选择模板时可保存映射为新模板**：保存成功后当前导入确认保持打开，不自动导入。
4. **模板管理是独立功能**：独立页面维护模板新建、编辑、重命名、删除，可加载样例文件辅助配置，但不直接导入货物。
5. **选择已有模板后修改映射不静默改原模板**：本次导入的修改只影响当前确认，需明确"更新"或"另存为"才保存。

## 2. 当前实现分析

### 2.1 现有架构

当前代码已有良好的基础架构：

- **模板存储与 CRUD**：`src/api/importTemplates.ts` 提供 `readImportTemplates`、`saveImportTemplate`、`updateImportTemplate`、`deleteImportTemplate`。
- **模板 Hook**：`src/hooks/useTemplateCatalogs.ts` 统一管理导入和导出模板，提供 `importTemplates`、`createImportTemplate`、`updateImportTemplate`、`removeImportTemplate`。
- **导入确认对话框**：`src/components/CargoImportDialog.tsx` 已包含映射配置、预览和模板应用逻辑。
- **模板管理页**：`src/components/TemplateManagerPage.tsx` 已实现独立的模板 CRUD 界面。
- **类型定义**：`src/types.ts` 中有 `ImportTemplate`、`ImportTemplateDefaults`、`ImportTemplateUnits`。

### 2.2 现有流程

当前工作流：

1. 用户在 `Workbench` 选择文件 → 触发 `importExcel(file)` → 解析文件。
2. 解析成功后打开 `CargoImportDialog`，传入 `importRows` 和 `importTemplates`。
3. `CargoImportDialog` 内部维护：
   - `selectedImportTemplateId`：当前选择的模板 ID。
   - `customMapping`、`customUnits` 等：当前映射配置。
   - `templateName`：模板名称输入框。
   - `applyImportTemplate(template)`：从模板填充映射。
   - `handleSaveImportTemplate()`：保存当前映射为模板。
4. 用户确认导入后，`CargoImportDialog` 调用 `onConfirm(cargos)` → `Workbench` 替换货物。

### 2.3 现有模板管理

`TemplateManagerPage` 已支持：

- 新建模板：`newImportDraft` 状态 + `onCreateImport(payload)`。
- 编辑模板：`editingImport` 状态 + `onUpdateImport(id, payload)`。
- 删除模板：`onDeleteImport(id)`。
- 加载样例文件：`loadSampleHeaders(file)` + `sampleRows`。
- 模板列表展示：`importTemplates.map(...)` + `templateEmpty` / `importTemplateLoadFailed`。

### 2.4 当前问题

对照产品行为稿，现有实现存在以下偏差：

#### 问题 1：文件导入后未先展示模板选择

- **现状**：`CargoImportDialog` 打开后直接展示映射配置表单，用户需要手动从下拉框选择模板。
- **期望**：文件解析成功后，首先展示模板选择界面，明确"选择已有模板"或"不使用模板"，选择后才进入映射配置。

#### 问题 2：模板选择与映射配置未分阶段

- **现状**：模板选择下拉框和映射配置表单同时展示，没有"先选模板、后映射"的流程感知。
- **期望**：模板选择是独立阶段，用户选择模板后立即应用并生成预览；用户可以在确认前重新选择模板。

#### 问题 3：未选择模板时保存行为不明确

- **现状**：`handleSaveImportTemplate` 同时支持新建和更新，逻辑混在一起。
- **期望**：
  - 未选择模板时，显示"保存为模板"，保存成功后不自动导入。
  - 选择已有模板并修改后，提供"另存为"，避免静默修改原模板。

#### 问题 4：模板管理页与导入确认混在一起

- **现状**：`TemplateManagerPage` 是独立页面，但与导入确认的模板保存逻辑部分重叠。
- **期望**：模板管理页只管理模板，不打开导入；导入确认中可以保存新模板，但保存后不自动导入。

#### 问题 5：模板选择后修改映射可能静默改原模板

- **现状**：`selectedImportTemplateId` 存在时，`handleSaveImportTemplate` 可能直接调用 `onUpdateTemplate`。
- **期望**：选择已有模板后，本次导入的映射修改只影响当前确认；需要明确点击"更新"或"另存为"才保存。

## 3. 重构方案

### 3.1 架构调整

保留现有架构，增强流程感知和状态管理：

#### 3.1.1 导入确认流程分阶段

`CargoImportDialog` 增加 `phase` 状态：

```ts
type ImportPhase = 'template-selection' | 'mapping-config' | 'preview-ready'
```

- `template-selection`：文件解析成功后的初始阶段，展示模板选择界面。
- `mapping-config`：选择模板或"不使用模板"后，展示映射配置。
- `preview-ready`：映射有效时，展示完整预览和确认按钮。

#### 3.1.2 模板选择状态

增加模板选择状态：

```ts
type TemplateSelectionMode = 'none' | 'existing' | 'sample'
```

- `none`：明确选择"不使用模板"。
- `existing`：选择已有模板。
- `sample`：在模板管理页加载样例文件（不适用于导入确认）。

#### 3.1.3 模板保存策略

区分三种保存行为：

```ts
type TemplateSaveAction = 'save-as-new' | 'save-as-copy' | 'update-existing'
```

- `save-as-new`：未选择模板时，保存当前映射为新模板。
- `save-as-copy`：选择已有模板并修改后，另存为新模板。
- `update-existing`：在模板管理页编辑模板时，更新原模板。

### 3.2 组件调整

#### 3.2.1 CargoImportDialog 重构

**新增状态**：

```ts
const [importPhase, setImportPhase] = useState<ImportPhase>('template-selection')
const [templateSelectionMode, setTemplateSelectionMode] = useState<TemplateSelectionMode | null>(null)
```

**流程控制**：

```ts
// 1. 文件解析成功后进入模板选择阶段
useEffect(() => {
  if (importRows.length > 0) {
    setImportPhase('template-selection')
    setTemplateSelectionMode(null)
  }
}, [importRows])

// 2. 用户选择模板或"不使用模板"后进入映射配置
const handleTemplateSelection = (mode: TemplateSelectionMode, templateId?: string) => {
  setTemplateSelectionMode(mode)
  if (mode === 'existing' && templateId) {
    applyImportTemplate(importTemplates.find(t => t.id === templateId))
  } else if (mode === 'none') {
    // 使用自动建议映射
    applyAutoMapping()
  }
  setImportPhase('mapping-config')
}

// 3. 映射有效时自动进入预览阶段
useEffect(() => {
  if (importPhase === 'mapping-config' && canConfirmMapping) {
    setImportPhase('preview-ready')
  }
}, [importPhase, canConfirmMapping])
```

**UI 分阶段渲染**：

```tsx
{importPhase === 'template-selection' && (
  <TemplateSelectionPanel
    templates={importTemplates}
    loadFailed={importTemplateLoadFailed}
    onSelect={handleTemplateSelection}
    onRetry={onRefreshTemplates}
  />
)}

{importPhase === 'mapping-config' && (
  <ImportMappingForm
    value={importMappingValue}
    onChange={setImportMappingValue}
    columns={columns}
    // ...
  />
)}

{importPhase === 'preview-ready' && (
  <>
    <ImportPreviewTable rows={previewRows} />
    <div className="actions">
      {templateSelectionMode === 'none' && (
        <button onClick={handleSaveAsNew}>保存为模板</button>
      )}
      {templateSelectionMode === 'existing' && mappingChanged && (
        <button onClick={handleSaveAsCopy}>另存为</button>
      )}
      <button onClick={handleConfirmImport} disabled={!canConfirm}>
        确认导入
      </button>
    </div>
  </>
)}
```

**模板保存逻辑**：

```ts
const handleSaveAsNew = async () => {
  if (!templateName.trim()) {
    setTemplateSaveNotice('模板名称不能为空')
    return
  }
  try {
    const saved = await onCreateTemplate(buildPayload())
    if (saved) {
      setTemplateSaveNotice('模板已保存')
      setSelectedImportTemplateId(saved.id)
      setTemplateSelectionMode('existing')
      // 注意：不自动导入，当前对话框保持打开
    }
  } catch (error) {
    setTemplateSaveNotice('保存失败')
  }
}

const handleSaveAsCopy = async () => {
  // 与 handleSaveAsNew 类似，但需要明确用户意图是另存为
  // 可以弹出二次确认对话框或要求修改名称
}

const handleUpdateExisting = async () => {
  // 只在模板管理页使用，导入确认中不提供此选项
}
```

#### 3.2.2 TemplateSelectionPanel 新组件

创建独立的模板选择面板：

```tsx
// src/components/TemplateSelectionPanel.tsx
export type TemplateSelectionPanelProps = {
  templates: ImportTemplate[]
  loadFailed: boolean
  onSelect: (mode: TemplateSelectionMode, templateId?: string) => void
  onRetry: () => void
}

export function TemplateSelectionPanel({
  templates,
  loadFailed,
  onSelect,
  onRetry,
}: TemplateSelectionPanelProps) {
  return (
    <div className="template-selection-panel">
      <h3>选择导入模板</h3>
      {loadFailed ? (
        <div className="load-error">
          <span>模板加载失败</span>
          <button onClick={onRetry}>重试</button>
        </div>
      ) : (
        <>
          <div className="template-list">
            {templates.length === 0 ? (
              <div className="empty-hint">暂无保存的模板</div>
            ) : (
              templates.map(template => (
                <button
                  key={template.id}
                  className="template-card"
                  onClick={() => onSelect('existing', template.id)}
                >
                  <div className="template-name">{template.name}</div>
                  <div className="template-summary">
                    {/* 显示模板摘要：映射字段、单位等 */}
                  </div>
                </button>
              ))
            )}
          </div>
          <button
            className="no-template-button"
            onClick={() => onSelect('none')}
          >
            不使用模板
          </button>
        </>
      )}
    </div>
  )
}
```

#### 3.2.3 TemplateManagerPage 保持独立

`TemplateManagerPage` 不需要大改，确保：

- **新建模板**：`newImportDraft` 状态 + 可加载样例文件 + `onCreateImport`。
- **编辑模板**：`editingImport` 状态 + `onUpdateImport`。
- **删除模板**：`onDeleteImport`。
- **不打开导入**：模板管理页的所有操作都不触发货物导入，也不打开 `CargoImportDialog`。

### 3.3 数据流调整

#### 3.3.1 模板应用流程

```
用户选择文件
  ↓
Workbench.importExcel(file)
  ↓
解析文件 → importRows
  ↓
打开 CargoImportDialog (phase: 'template-selection')
  ↓
用户选择模板 / 不使用模板
  ↓
CargoImportDialog.handleTemplateSelection(mode, templateId?)
  ↓
  - mode === 'existing' → applyImportTemplate(template)
  - mode === 'none' → applyAutoMapping()
  ↓
进入 'mapping-config' 阶段
  ↓
用户调整映射 (可选)
  ↓
映射有效 → 自动进入 'preview-ready' 阶段
  ↓
预览数据
  ↓
用户选择：
  - 保存为模板 (mode === 'none')
  - 另存为 (mode === 'existing' && 映射已修改)
  - 确认导入
  ↓
确认导入 → onConfirm(cargos) → Workbench 替换货物
```

#### 3.3.2 模板保存流程

```
导入确认中：
  未选择模板 + 完成映射 + 点击"保存为模板"
    ↓
  填写模板名称
    ↓
  onCreateTemplate(payload)
    ↓
  保存成功 → 模板进入列表 + 当前对话框保持打开
    ↓
  用户仍需点击"确认导入"
```

```
模板管理页：
  新建模板 → newImportDraft
    ↓
  填写名称 + 配置映射 (可加载样例文件)
    ↓
  onCreateImport(payload)
    ↓
  保存成功 → 模板进入列表
    ↓
  不打开导入，不替换货物
```

### 3.4 类型与接口调整

#### 3.4.1 新增类型

```ts
// src/types.ts or CargoImportDialog.tsx
export type ImportPhase = 'template-selection' | 'mapping-config' | 'preview-ready'
export type TemplateSelectionMode = 'none' | 'existing'
export type TemplateSaveAction = 'save-as-new' | 'save-as-copy' | 'update-existing'
```

#### 3.4.2 组件 Props 调整

`CargoImportDialog` 已有的 props 不需要大改，确保：

```ts
export type CargoImportDialogProps = {
  importRows: ImportCargoRow[]
  importTemplates: ImportTemplate[]
  importTemplateLoadFailed: boolean
  locale: Locale
  labels: Labels
  userId: string | null
  currentCargos: CargoItem[]
  onConfirm: (cargos: CargoItem[], logMessages: string[]) => void
  onClose: () => void
  onRefreshTemplates: () => void
  onCreateTemplate: (payload: ImportTemplatePayload) => Promise<ImportTemplate | null>
  onUpdateTemplate: (id: string, payload: ImportTemplatePayload) => Promise<ImportTemplate | null>
}
```

`TemplateManagerPage` props 保持不变。

## 4. 实施计划

### 阶段 1：基础重构（第 1-2 天）

#### 任务 1.1：增加 `ImportPhase` 状态和流程控制

- 文件：`src/components/CargoImportDialog.tsx`
- 工作：
  - 增加 `importPhase` 和 `templateSelectionMode` 状态。
  - 增加 `handleTemplateSelection` 函数。
  - 增加 phase 自动推进逻辑。
- 验证：
  - 单元测试：`CargoImportDialog.test.tsx` 增加 phase 流转场景。
  - 手动测试：打开导入对话框，确认初始 phase 为 `template-selection`。

#### 任务 1.2：创建 `TemplateSelectionPanel` 组件

- 文件：`src/components/TemplateSelectionPanel.tsx` (新建)
- 工作：
  - 实现模板列表展示。
  - 实现"不使用模板"按钮。
  - 实现模板加载失败提示和重试。
- 验证：
  - 单元测试：`TemplateSelectionPanel.test.tsx` (新建)。
  - 手动测试：模拟模板列表、空列表、加载失败场景。

#### 任务 1.3：`CargoImportDialog` 分阶段 UI 渲染

- 文件：`src/components/CargoImportDialog.tsx`
- 工作：
  - 根据 `importPhase` 条件渲染不同阶段 UI。
  - 集成 `TemplateSelectionPanel`。
  - 确保映射配置和预览按阶段显示。
- 验证：
  - 单元测试：验证 phase 切换后 UI 正确渲染。
  - 手动测试：完整走通"选择模板 → 映射配置 → 预览"流程。

### 阶段 2：模板保存逻辑拆分（第 3 天）

#### 任务 2.1：拆分 `handleSaveImportTemplate`

- 文件：`src/components/CargoImportDialog.tsx`
- 工作：
  - 重命名为 `handleSaveAsNew`，只处理未选择模板时的保存。
  - 新增 `handleSaveAsCopy`，处理选择已有模板并修改后的另存为。
  - 确保保存成功后对话框保持打开，不自动导入。
- 验证：
  - 单元测试：验证 `save-as-new` 和 `save-as-copy` 分别调用 `onCreateTemplate`。
  - 手动测试：保存模板后确认对话框仍打开，货物未导入。

#### 任务 2.2：检测映射是否修改

- 文件：`src/components/CargoImportDialog.tsx`
- 工作：
  - 增加 `mappingChanged` 计算属性，对比当前映射与选择模板的原始映射。
  - 只有 `mappingChanged === true` 且 `templateSelectionMode === 'existing'` 时显示"另存为"。
- 验证：
  - 单元测试：验证映射修改检测逻辑。
  - 手动测试：选择模板后修改映射，确认"另存为"按钮出现。

### 阶段 3：模板管理页确认独立性（第 4 天）

#### 任务 3.1：审查 `TemplateManagerPage` 独立性

- 文件：`src/components/TemplateManagerPage.tsx`
- 工作：
  - 确认新建、编辑、删除模板不触发货物导入。
  - 确认加载样例文件只辅助配置，不打开 `CargoImportDialog`。
  - 确认更新模板调用 `onUpdateImport`，不影响当前工作台货物。
- 验证：
  - 单元测试：`TemplateManagerPage.test.tsx` 验证独立性。
  - 手动测试：在模板管理页操作，确认货物不变。

### 阶段 4：集成测试与文档（第 5 天）

#### 任务 4.1：端到端测试

- 文件：`e2e/import.spec.ts` (新建或扩展现有)
- 工作：
  - 测试"选择文件 → 模板选择 → 映射配置 → 预览 → 确认导入"完整流程。
  - 测试"未选择模板 → 保存为模板 → 确认导入"流程。
  - 测试"选择模板 → 修改映射 → 另存为 → 确认导入"流程。
  - 测试模板管理页新建、编辑、删除模板，确认不导入货物。
- 验证：
  - 浏览器自动化测试通过。

#### 任务 4.2：更新文档

- 文件：`CHANGELOG.md`、`decision.md`
- 工作：
  - 记录重构完成日期、主要变更和验证结果。
  - 记录关键技术决策：phase 状态管理、模板保存策略拆分。

### 阶段 5：验收与回归（第 6 天）

#### 任务 5.1：产品行为验收

- 文件：`docs/superpowers/specs/2026-08-19-import-template-behavior-design.md` § 9 关键验收场景
- 工作：
  - 逐一验证场景 A 到 J。
  - 特别关注新增场景 G（不使用模板后保存映射）。
- 验证：
  - 手动测试每个场景，记录通过/失败。

#### 任务 5.2：回归测试

- 文件：所有 `*.test.ts` 和 `*.test.tsx`
- 工作：
  - 运行 `npm run lint`、`npm test`、`npm run build`。
  - 运行 `npm run test:e2e`。
  - 确认所有现有测试通过，新增测试覆盖重构部分。
- 验证：
  - 所有测试绿色。

## 5. 风险与缓解

### 5.1 风险：phase 状态管理复杂度

- **描述**：增加 `importPhase` 状态后，组件内部状态转换逻辑变复杂，容易出现 phase 卡住或跳过某阶段。
- **缓解**：
  - 单元测试覆盖每个 phase 转换路径。
  - 增加 phase 转换日志（开发环境）。
  - 保持 phase 自动推进逻辑简单，避免循环依赖。

### 5.2 风险：现有测试失败

- **描述**：`CargoImportDialog.test.tsx` 现有测试假设对话框打开后直接展示映射配置，增加 phase 后可能失败。
- **缓解**：
  - 先运行现有测试，记录失败场景。
  - 逐个修复测试，确保测试意图不变，只调整交互步骤。
  - 增加 phase 跳过辅助函数（仅测试用），快速进入特定 phase。

### 5.3 风险：用户体验退化

- **描述**：增加模板选择阶段可能让"快速导入"用户觉得多了一步。
- **缓解**：
  - 模板选择界面提供"不使用模板"快捷按钮。
  - 未来可考虑"记住我的选择"或"默认使用上次模板"（本轮不实现）。

### 5.4 风险：模板保存逻辑遗漏

- **描述**：`save-as-new` 和 `save-as-copy` 逻辑拆分后，可能遗漏某些边界条件（如模板名称重复、保存失败）。
- **缓解**：
  - 复用现有 `onCreateTemplate` 和 `onUpdateTemplate` 错误处理。
  - 增加保存失败单元测试和手动测试。

## 6. 完成标准

重构完成时，以下条件必须全部满足：

1. **功能验收**：产品行为稿 § 9 关键验收场景全部通过，包括新增场景 G。
2. **测试通过**：`npm run lint && npm test && npm run build && npm run test:e2e` 全部通过。
3. **无回归**：现有导入和模板功能无破坏，旧测试修复后全部通过。
4. **文档完整**：`CHANGELOG.md` 和 `decision.md` 记录重构内容和决策。
5. **代码整洁**：无未使用的 import、变量或函数，代码风格一致。

## 7. 后续改进

本轮重构后，以下能力暂不实现，可作为后续迭代：

- **自动应用上次模板**：记住用户上次使用的模板，下次导入时自动应用（但仍需确认）。
- **模板标签和分类**：支持给模板打标签或分组，方便多模板场景管理。
- **模板导入导出**：支持模板的跨设备或跨用户分享。
- **多工作表合并导入**：当前只读取第一个工作表，未来可支持多工作表按规则合并。
- **按标签自动合并多行**：需要先定义数量、重量和尺寸冲突时的业务规则。

## 8. 附录：关键文件清单

### 8.1 需要修改的文件

- `src/components/CargoImportDialog.tsx`：主要重构文件，增加 phase 状态和流程控制。
- `src/components/CargoImportDialog.test.tsx`：修复和增加测试。
- `src/components/TemplateSelectionPanel.tsx`（新建）：模板选择面板。
- `src/components/TemplateSelectionPanel.test.tsx`（新建）：模板选择面板测试。
- `e2e/import.spec.ts`（新建或扩展）：端到端测试。
- `CHANGELOG.md`：记录重构内容。
- `decision.md`：记录技术决策。

### 8.2 需要确认但可能不修改的文件

- `src/hooks/useTemplateCatalogs.ts`：确认 CRUD 接口符合预期。
- `src/api/importTemplates.ts`：确认 API 接口符合预期。
- `src/components/TemplateManagerPage.tsx`：确认独立性，可能微调样式或文案。
- `src/lib/importCargo.ts`、`src/lib/importWorkflow.ts`：确认映射和解析逻辑符合预期。

### 8.3 参考文件

- `docs/superpowers/specs/2026-08-19-import-template-behavior-design.md`：产品行为基准。
- `decision.md`：已有决策记录。
- `AGENTS.md`：开发规范和验证要求。
