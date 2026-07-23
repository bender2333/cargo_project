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
})
