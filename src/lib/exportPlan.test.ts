import { describe, expect, it } from 'vitest'
import type { CargoItem, ContainerSpec } from '../types'
import { buildExportPlanRows } from './exportPlan'
import { calculatePacking } from './packing'

const container: ContainerSpec = {
  id: 'export-test',
  label: 'Export test',
  description: 'Export test container',
  length: 1000,
  width: 1000,
  height: 1000,
  maxWeight: 150,
  doorGap: 0,
  topGap: 0,
  sideGap: 0,
}

function cargo(overrides: Partial<CargoItem>): CargoItem {
  return {
    id: 'cargo',
    name: 'Cargo',
    label: 'A',
    length: 1000,
    width: 1000,
    height: 500,
    weight: 100,
    quantity: 1,
    color: '#f59e0b',
    canRotate: false,
    stackable: true,
    ...overrides,
  }
}

describe('buildExportPlanRows', () => {
  it('exports labels, original and actual dimensions, layers, work steps, and failure reasons from the packing result', () => {
    const items = [
      cargo({ id: 'a', name: 'Alpha', label: 'A', quantity: 2 }),
      cargo({ id: 'b', name: 'Beta', label: 'B', length: 500, width: 500, weight: 25 }),
    ]
    const result = calculatePacking(container, items)

    expect(buildExportPlanRows(items, result)).toEqual([
      {
        label: 'A',
        name: 'Alpha',
        originalLength: 1000,
        originalWidth: 1000,
        originalHeight: 500,
        actualLength: 1000,
        actualWidth: 1000,
        actualHeight: 500,
        weight: 100,
        plannedQuantity: 2,
        placedQuantity: 1,
        unplacedQuantity: 1,
        layer: '1',
        workStep: '1',
        failureReason: 'Exceeds maximum payload',
      },
      {
        label: 'B',
        name: 'Beta',
        originalLength: 500,
        originalWidth: 500,
        originalHeight: 500,
        actualLength: 500,
        actualWidth: 500,
        actualHeight: 500,
        weight: 25,
        plannedQuantity: 1,
        placedQuantity: 1,
        unplacedQuantity: 0,
        layer: '2',
        workStep: '2',
        failureReason: '',
      },
    ])
  })
})
