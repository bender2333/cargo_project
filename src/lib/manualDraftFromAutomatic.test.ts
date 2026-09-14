import { describe, expect, it } from 'vitest'
import { draftFromAutomaticResult } from './manualDraftFromAutomatic'
import { calculatePacking } from './packing'
import { validateDraft } from './manualPlacement'
import { DEFAULT_PLACEMENT_SETTINGS } from './placementSettings'
import type { CargoItem, ContainerSpec } from '../types'

const container: ContainerSpec = {
  id: 'c', label: 'c', description: '', length: 2000, width: 1000, height: 1000,
  maxWeight: 10000, doorGap: 0, topGap: 0, sideGap: 0,
}

const items: CargoItem[] = [{
  id: 'a', name: 'A', label: 'A', length: 1000, width: 1000, height: 500,
  weight: 10, quantity: 2, color: '#f59e0b', canRotate: false, stackable: true,
}]

describe('draftFromAutomaticResult support continuity', () => {
  it('imports automatic placements into a manual draft with zero blocking issues under the same support policy', () => {
    const policy = DEFAULT_PLACEMENT_SETTINGS.supportPolicy
    const result = calculatePacking(container, items, { supportPolicy: policy })
    expect(result.placedCount).toBeGreaterThan(0)
    const draft = draftFromAutomaticResult(result, items, (id) => `m-${id}`)
    const issues = validateDraft(draft, container, policy)
    expect(issues.filter((issue) => issue.severity === 'error')).toEqual([])
  })
})
