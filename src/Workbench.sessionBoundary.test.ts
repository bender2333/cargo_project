import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

describe('Workbench packing-session boundary', () => {
  it('routes automatic packing inputs and results through usePackingSession', () => {
    const source = readFileSync(path.resolve(process.cwd(), 'src/Workbench.tsx'), 'utf8')

    expect(source).toContain("from './hooks/usePackingSession'")
    expect(source).toContain('usePackingSession({')
    expect(source).not.toMatch(/\bsetCargoItems\b/)
    expect(source).not.toMatch(/\bsetSelectedContainerId\b/)
    expect(source).not.toMatch(/\bsetLoadingMode\b/)
    expect(source).not.toMatch(/\bsetContainerOverrides\b/)
    expect(source).not.toMatch(/\bsetCustomContainer\b/)
    expect(source).not.toMatch(/\bsetCalculatedResult\b/)
    expect(source).not.toMatch(/\bsetHasCalculated\b/)
    expect(source).not.toMatch(/\bsetProjectName\b/)
    expect(source).not.toMatch(/\bsetShipmentName\b/)
    expect(source).not.toContain('markPlacementDirty')
    expect(source).toContain('restoreHistory({')
    expect(source).not.toContain("type: 'calculationCompleted'")
    expect(source).toContain('container.label !== selectedContainer.label')
    expect(source).toContain('container.description !== selectedContainer.description')
  })

  it('routes manual editing through one session and one active result', () => {
    const source = readFileSync(path.resolve(process.cwd(), 'src/Workbench.tsx'), 'utf8')

    expect(source).toContain("from './hooks/useManualPlacementSession'")
    expect(source).toContain('useManualPlacementSession({')
    expect(source).toContain('activeResult')
    expect(source).not.toMatch(/\bsetManualHistory\b/)
    expect(source).not.toMatch(/\bsetManualSelectedId\b/)
    expect(source).not.toContain('const result = automaticResult')
    expect(source).not.toContain('activeStepsResult')
  })

  it('delegates history request state and page rendering to the history boundary', () => {
    const source = readFileSync(path.resolve(process.cwd(), 'src/Workbench.tsx'), 'utf8')

    expect(source).toContain("from './hooks/useHistoryPlans'")
    expect(source).toContain("from './components/HistoryPage'")
    expect(source).toContain('<HistoryPage')
    expect(source).not.toContain("from './api/historyPlans'")
    expect(source).not.toMatch(/\b(?:read|delete|save)HistoryPlan(?:s)?\b/)
    expect(source).not.toMatch(/\bhistoryRequestIdRef\b/)
  })

  it('delegates custom cargo requests and form rendering to the cargo library boundary', () => {
    const source = readFileSync(path.resolve(process.cwd(), 'src/Workbench.tsx'), 'utf8')

    expect(source).toContain("from './hooks/useCustomCargoLibrary'")
    expect(source).toContain("from './components/CargoLibraryPage'")
    expect(source).toContain('<CargoLibraryPage')
    expect(source).toContain('} = useCustomCargoLibrary()')
    expect(source).not.toContain("from './api/customCargo'")
    expect(source).not.toMatch(/\bcustomCargoRequestIdRef\b/)
    expect(source).not.toMatch(/\bfetchCustomCargo\b/)
    expect(source).not.toMatch(/\bcargoLibraryForm\b/)
    expect(source).not.toMatch(/\beditingLibraryCargoId\b/)
    expect(source).not.toMatch(/\bcargoLibraryNotice\b/)
  })

  it('delegates import and export template request state to the catalog boundary', () => {
    const source = readFileSync(path.resolve(process.cwd(), 'src/Workbench.tsx'), 'utf8')
    const dialogSource = readFileSync(path.resolve(process.cwd(), 'src/components/CargoImportDialog.tsx'), 'utf8')

    // Workbench still owns the shared catalog lifecycle via useTemplateCatalogs
    expect(source).toContain("from './hooks/useTemplateCatalogs'")
    expect(source).toContain('} = useTemplateCatalogs()')
    expect(source).not.toContain("from './api/importTemplates'")
    expect(source).not.toContain("from './api/exportTemplates'")
    expect(source).not.toMatch(/\bimportTemplateRequestIdRef\b/)
    expect(source).not.toMatch(/\bexportTemplateRequestIdRef\b/)
    expect(source).not.toMatch(/\bsetImportTemplates\b/)
    expect(source).not.toMatch(/\bsetExportTemplates\b/)
    expect(source).not.toMatch(/\bsetImportTemplateLoadFailed\b/)
    expect(source).not.toMatch(/\bsetExportTemplateLoadFailed\b/)

    // Export template ID reconciliation still lives in Workbench (no dialog boundary yet)
    expect(source).toContain('shouldClearTemplateReference(selectedExportTemplateId, exportTemplates, exportTemplateLoadFailed)')

    // Import template dialog state and mapping logic are now owned by CargoImportDialog
    expect(source).not.toMatch(/\bselectedImportTemplateId\b/)
    expect(source).not.toMatch(/\bcustomMapping\b/)
    expect(source).not.toMatch(/\bapplyImportTemplate\b/)
    expect(source).not.toMatch(/\bhandleSaveImportTemplate\b/)
    expect(source).not.toMatch(/\breconcileSelectedTemplateName\b/)

    // Workbench delegates to CargoImportDialog and passes catalog as props
    expect(source).toContain("from './components/CargoImportDialog'")
    expect(source).toContain('<CargoImportDialog')
    expect(source).toContain('importTemplates={importTemplates}')
    expect(source).toContain('importTemplateLoadFailed={importTemplateLoadFailed}')
    expect(source).toContain('onCreateTemplate={createImportTemplateRecord}')
    expect(source).toContain('onUpdateTemplate={updateImportTemplateRecord}')

    // CargoImportDialog owns the reconciliation, mapping state, and template CRUD
    expect(dialogSource).toContain('selectedImportTemplateId')
    expect(dialogSource).toContain('applyImportTemplate')
    expect(dialogSource).toContain('handleSaveImportTemplate')
    expect(dialogSource).toContain('importMappingValueFromTemplate')
  })

  it('delegates template manager drafts and rendering to the page boundary', () => {
    const source = readFileSync(path.resolve(process.cwd(), 'src/Workbench.tsx'), 'utf8')

    expect(source).toContain("type TemplateManagerPageComponent = typeof import('./components/TemplateManagerPage')")
    expect(source).toContain("void import('./components/TemplateManagerPage')")
    expect(source).toContain('setTemplateManagerPage(() => module.TemplateManagerPage)')
    expect(source).toContain('templateManagerPageLoadFailed')
    expect(source).not.toContain("const TemplateManagerPage = lazy(() => import('./components/TemplateManagerPage')")
    expect(source).not.toContain("import { TemplateManagerPage } from './components/TemplateManagerPage'")
    expect(source).toContain('<TemplateManagerPage')
    expect(source).not.toMatch(/\bnewImportTemplateDraft\b/)
    expect(source).not.toMatch(/\beditingImportTemplate(?:Id|Draft)\b/)
    expect(source).not.toMatch(/\bnewExportTemplateDraft\b/)
    expect(source).not.toMatch(/\beditingExportTemplate(?:Id|Draft)\b/)
    expect(source).not.toMatch(/\btemplateSampleRows\b/)
    expect(source).not.toMatch(/\btemplateManagerPanel\b/)
    expect(source).not.toMatch(/\bexportTemplateManagerPanel\b/)
    expect(source).not.toMatch(/\bonImport(?:Created|Updated|Deleted)=/)
    expect(source).not.toMatch(/\bonExport(?:Created|Deleted)=/)
  })
})
