import { describe, expect, it } from 'vitest'
import { suggestFillItems } from './fillSuggestion'
import type { ContainerSpec, PackingResult } from '../types'

function makeContainer(): ContainerSpec {
  return { id: 't', label: 'T', description: '', length: 12000, width: 2400, height: 2600, maxWeight: 28000, doorGap: 0, topGap: 0, sideGap: 0 }
}

function emptyResult(): PackingResult {
  return {
    placed: [],
    unplaced: [],
    layers: [],
    workSteps: [],
    labelStats: [],
    diagnostics: [],
    totalCargoCount: 0,
    placedCount: 0,
    usedVolume: 0,
    containerVolume: 0,
    volumeUtilization: 0,
    usedWeight: 0,
    weightUtilization: 0,
  }
}

describe('suggestFillItems', () => {
  it('returns one suggestion per preset', () => {
    const suggestions = suggestFillItems(emptyResult(), makeContainer())
    expect(suggestions.length).toBeGreaterThanOrEqual(3)
    for (const s of suggestions) {
      expect(s.preset.id).toMatch(/^std-/)
      expect(s.maxCount).toBeGreaterThanOrEqual(0)
    }
  })

  it('returns 0 when both volume and weight are exhausted', () => {
    const c = makeContainer()
    const filled: PackingResult = {
      ...emptyResult(),
      placed: [{
        id: 'big', cargoId: 'c', name: 'big', label: 'B', index: 0,
        x: 0, y: 0, z: 0, length: c.length, width: c.width, height: c.height,
        orientationKey: 'LWH', labelRotationDeg: 0, weight: c.maxWeight, color: '#000',
        canRotate: true, stackable: true, physicalLayer: 1, workStep: 1, supportType: 'floor', supportedBy: [],
      }],
    }
    for (const s of suggestFillItems(filled, c)) {
      expect(s.maxCount).toBe(0)
    }
  })

  it('caps by weight when volume would otherwise allow more', () => {
    const c: ContainerSpec = { ...makeContainer(), maxWeight: 50 } // 50 kg total
    // Empty container: max small carton (4 kg) by weight = 50/4 = 12; by volume thousands.
    const suggestions = suggestFillItems(emptyResult(), c)
    const small = suggestions.find((s) => s.preset.id === 'std-s')!
    expect(small.weightCap).toBe(12)
    expect(small.maxCount).toBe(12)
  })

  it('returns volume-bounded count when weight cap is generous', () => {
    const c = makeContainer()
    // For a small 400×300×200 = 0.024 m³ box, container volume 74.88 m³ → ≈3120 boxes;
    // weight cap at 28000kg / 4kg = 7000. Smaller wins.
    const small = suggestFillItems(emptyResult(), c).find((s) => s.preset.id === 'std-s')!
    expect(small.maxCount).toBeLessThan(small.weightCap)
  })
})
