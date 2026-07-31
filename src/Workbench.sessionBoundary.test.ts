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

  it('keeps workbook reads pending and commits cargo only from the confirmation callback', () => {
    const source = readFileSync(path.resolve(process.cwd(), 'src/Workbench.tsx'), 'utf8')
    const importBlock = source.slice(source.indexOf('const importExcel'), source.indexOf('const exportExcel'))

    expect(importBlock).toContain('setImportRows(rows)')
    expect(importBlock).toContain('setShowMappingModal(true)')
    expect(importBlock).not.toContain('cargoImported')
    expect(importBlock).toContain('parseWorkbookFileInWorker(file)')
    expect(importBlock).not.toContain("import('xlsx')")
    expect(source.match(/type: 'cargoImported'/g)).toHaveLength(1)
    expect(source.indexOf("type: 'cargoImported'")).toBeGreaterThan(source.indexOf('onConfirm={(items, messages) =>'))
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

  it('uses one active compliance context for every command and result button', () => {
    const workbenchSource = readFileSync(path.resolve(process.cwd(), 'src/Workbench.tsx'), 'utf8')
    const resultsSource = readFileSync(path.resolve(process.cwd(), 'src/components/ResultsPanel.tsx'), 'utf8')

    expect(workbenchSource).toContain('getActivePlanCompliance')
    expect(workbenchSource).toContain('const activePlanCompliance')
    expect(workbenchSource).toContain('planCompliance={activePlanCompliance}')
    expect(workbenchSource).not.toMatch(/assertPlanCompliant\(activeResult, manualIssues\)/)
    expect(resultsSource).toContain('planCompliance: ActivePlanCompliance')
    expect(resultsSource).toContain('planCompliance.ok')
    expect(resultsSource).not.toContain('evaluatePlanCompliance')
  })
  it('routes every plan export through one visible error boundary', () => {
    const source = readFileSync(path.resolve(process.cwd(), 'src/Workbench.tsx'), 'utf8')

    expect(source).toContain('const runPlanExport = async')
    expect(source).toContain('await operation()')
    expect(source).toContain("console.error('[plan-export]'")
    expect(source).toContain("alert(message || (locale === 'zh' ? '导出失败' : 'Export failed'))")
    expect(source).toContain("reject(new Error('3D canvas export failed'))")
    expect(source).toContain('try {')
    expect(source).toContain('catch (error)')
    for (const handler of [
      'exportExcel = () => runPlanExport',
      'exportPlaybackInstructions = () => runPlanExport',
      'exportLoadingSheet = () => runPlanExport',
      'exportReviewChecklistJson = () => runPlanExport',
      'exportReviewChecklistExcel = () => runPlanExport',
      'exportCurrentView = () => runPlanExport',
    ]) {
      expect(source).toContain(handler)
    }
  })

  it('scopes manual keyboard commands to the focused overview workspace', () => {
    const workbenchSource = readFileSync(path.resolve(process.cwd(), 'src/Workbench.tsx'), 'utf8')
    const workspaceSource = readFileSync(path.resolve(process.cwd(), 'src/components/VisualizationWorkspace.tsx'), 'utf8')
    const sceneSource = readFileSync(path.resolve(process.cwd(), 'src/components/ContainerScene.tsx'), 'utf8')

    expect(workbenchSource).toMatch(/const isManualWorkspaceTarget =\s*activeNav === 'overview'\s*&& placementMode === 'manual'\s*&& target !== null\s*&& workspaceRef\.current\?\.contains\(target\)/)
    expect(workbenchSource).toMatch(/if \(!isManualWorkspaceTarget\) return\s*\n\s*const isMeta/)
    expect(workbenchSource).toContain("tabIndex={activeNav === 'overview' && placementMode === 'manual' ? 0 : undefined}")
    expect(workbenchSource).toContain("manualKeyboardEnabled={activeNav === 'overview' && placementMode === 'manual'}")
    expect(workspaceSource).toContain('manualKeyboardEnabled={manualKeyboardEnabled}')
    expect(sceneSource).toContain('if (!manualEditableRef.current || !manualKeyboardEnabledRef.current) return')
    expect(sceneSource).toContain('if (!mount.contains(target)) return')
    expect(sceneSource).toContain('renderer.domElement.tabIndex = manualKeyboardEnabled ? 0 : -1')
    expect(sceneSource).toContain('onManualDeleteRef.current?.(boxId)')
  })
})
