import { describe, expect, it } from 'vitest'
import type { PackingResult, PlacedBox } from '../types'
import { canonicalizePackingResult } from './packingContract'

function placedBox(overrides: Partial<PlacedBox>): PlacedBox {
  return {
    id: 'box-b',
    cargoId: 'cargo-b',
    name: 'Cargo B',
    label: 'B',
    index: 2,
    x: 1.2345678,
    y: 20,
    z: 0,
    length: 100,
    width: 200,
    height: 300,
    orientationKey: 'WLH',
    labelRotationDeg: 90,
    weight: 10,
    color: '#222222',
    canRotate: true,
    stackable: true,
    physicalLayer: 2,
    workStep: 2,
    supportType: 'fully-supported',
    supportedBy: ['support-z', 'support-a'],
    ...overrides,
  }
}

function packingResult(): PackingResult {
  return {
    placed: [
      placedBox({
        orientationAxes: { x: 'W+', y: 'L-', z: 'H+' },
        verticalSupportedBy: ['vertical-z', 'vertical-a'],
      }),
      placedBox({ id: 'box-a', cargoId: 'cargo-a', label: 'A', index: 1, workStep: 1, supportedBy: [] }),
    ],
    unplaced: [
      { cargoId: 'cargo-z', name: 'Cargo Z', label: 'Z', quantity: 2, reason: 'No room', reasonCode: 'no-space' },
      { cargoId: 'cargo-a', name: 'Cargo A', label: 'A', quantity: 1, reason: 'No room', reasonCode: 'no-space' },
    ],
    layers: [
      { id: 'layer-2', physicalLayer: 2, minZ: 300, maxZ: 600, count: 1, weight: 10, volume: 6_000_000, labels: [{ label: 'B', color: '#222222', count: 1 }], supportedBy: ['support-z', 'support-a'] },
      { id: 'layer-1', physicalLayer: 1, minZ: 0, maxZ: 300, count: 1, weight: 10, volume: 6_000_000, labels: [{ label: 'A', color: '#111111', count: 1 }], supportedBy: [] },
    ],
    workSteps: [
      { step: 2, boxId: 'box-b', cargoId: 'cargo-b', label: 'B', physicalLayer: 2, supportType: 'fully-supported' },
      { step: 1, boxId: 'box-a', cargoId: 'cargo-a', label: 'A', physicalLayer: 1, supportType: 'floor' },
    ],
    labelStats: [
      { label: 'B', name: 'Cargo B', color: '#222222', planned: 2, placed: 1, unplaced: 1, layers: [2, 1] },
      { label: 'A', name: 'Cargo A', color: '#111111', planned: 2, placed: 1, unplaced: 1, layers: [1] },
    ],
    diagnostics: [
      { id: 'z-check', severity: 'warning', message: 'Mutable copy', params: { z: 1.2345678, a: 'first' } },
      { id: 'a-check', severity: 'info', message: 'Another mutable copy' },
    ],
    totalCargoCount: 5,
    placedCount: 2,
    usedVolume: 12_000_000,
    containerVolume: 97_200_000,
    volumeUtilization: 0.12345678,
    usedWeight: 20,
    weightUtilization: -0,
  }
}

describe('canonicalizePackingResult', () => {
  it('freezes stable packing fields while normalizing order, precision, and optional values', () => {
    const summary = canonicalizePackingResult(packingResult())

    expect(summary.totals).toMatchObject({ unplacedCount: 3, volumeUtilization: 0.123457, weightUtilization: 0 })
    expect(summary.placements.map((box) => box.id)).toEqual(['box-a', 'box-b'])
    expect(summary.placements[1]).toMatchObject({
      x: 1.234568,
      maxStackLayers: null,
      verticalLayer: null,
      supportedBy: ['support-a', 'support-z'],
      verticalSupportedBy: ['vertical-a', 'vertical-z'],
    })
    expect(summary.layers.map((layer) => layer.physicalLayer)).toEqual([1, 2])
    expect(summary.workSteps.map((step) => step.step)).toEqual([1, 2])
    expect(summary.labelStats.map((stat) => stat.label)).toEqual(['A', 'B'])
    expect(summary.unplaced.map((entry) => entry.cargoId)).toEqual(['cargo-a', 'cargo-z'])
    expect(summary.diagnostics.map((entry) => entry.id)).toEqual(['a-check', 'z-check'])
    expect(summary.diagnostics[1].params).toEqual({ a: 'first', z: 1.234568 })
    expect(summary.diagnostics[1]).not.toHaveProperty('message')
  })
})
