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
})
