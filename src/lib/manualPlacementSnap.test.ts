import { describe, expect, it } from 'vitest'
import { applyManualPlacementSnap } from './manualPlacementSnap'
import { DEFAULT_PLACEMENT_SETTINGS } from './placementSettings'
import type { PlacedBox, ContainerSpec } from '../types'

const container: Pick<ContainerSpec, 'length' | 'width'> = {
  length: 5758,
  width: 2352,
}

const boxSize = {
  length: 400,
  width: 500,
}

function placedBox(overrides: Partial<PlacedBox>): PlacedBox {
  return {
    id: 'support',
    cargoId: 'cargo-support',
    name: 'Support',
    label: 'S',
    index: 0,
    x: 1000,
    y: 1000,
    z: 0,
    length: 400,
    width: 500,
    height: 600,
    orientationKey: 'LWH',
    labelRotationDeg: 0,
    weight: 1,
    color: '#64748b',
    stackable: true,
    physicalLayer: 1,
    workStep: 1,
    supportType: 'floor',
    supportedBy: [],
    ...overrides,
  }
}

describe('applyManualPlacementSnap', () => {
  it('uses the configured grid step for editable 2D top-view movement', () => {
    const snapped = applyManualPlacementSnap({
      x: 123,
      y: 76,
      boxSize,
      others: [],
      container,
      settings: {
        ...DEFAULT_PLACEMENT_SETTINGS,
        gridSnapEnabled: true,
        gridStepMm: 25,
        edgeSnapEnabled: false,
      },
    })

    expect(snapped).toEqual({ x: 125, y: 75 })
  })

  it('uses the configured edge tolerance before grid snapping', () => {
    const snapped = applyManualPlacementSnap({
      x: 26,
      y: 33,
      boxSize,
      others: [placedBox({ id: 'other' })],
      container,
      settings: {
        ...DEFAULT_PLACEMENT_SETTINGS,
        gridSnapEnabled: false,
        edgeSnapEnabled: true,
        edgeToleranceMm: 40,
      },
    })

    expect(snapped).toEqual({ x: 0, y: 0 })
  })
})
