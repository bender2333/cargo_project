import { buildExportRowsFromTemplate, isExportDimensionField, projectExportRow } from './exportPlan'
import type { ExportPlanRow } from './exportPlan'
import { describe, expect, it } from 'vitest'
import type { CargoItem, ContainerSpec } from '../types'
import { buildExportPlanRows } from './exportPlan'
import { calculatePacking } from './packing'
import { GAP_FILL_SOURCE } from './placementSource'

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
      cargo({ id: 'b', name: 'Beta', label: 'B', length: 500, width: 500, weight: 25, maxStackLayers: 4 }),
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
        maxStackLayers: '',
        plannedQuantity: 2,
        placedQuantity: 1,
        unplacedQuantity: 1,
        layer: '1',
        workStep: '1',
        placementNote: '',
        failureReason: 'Exceeds maximum payload',
        failureReasonCode: 'exceeds-payload',
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
        maxStackLayers: 4,
        plannedQuantity: 1,
        placedQuantity: 1,
        unplacedQuantity: 0,
        // B rests on A at z=500, so it exports as vertical layer 2. It previously read
        // layer 1 because both boxes sat at x=0 in the same push-against wave.
        layer: '2',
        workStep: '2',
        placementNote: '',
        failureReason: '',
        failureReasonCode: '',
      },
    ])
  })

  it('exports the global max stack layer fallback for cargo without its own limit', () => {
    const items = [
      cargo({ id: 'a', name: 'Alpha', label: 'A', quantity: 3, weight: 10 }),
    ]
    const result = calculatePacking({
      ...container,
      height: 2000,
      maxWeight: 1000,
    }, items, { defaultMaxStackLayers: 2 })

    expect(buildExportPlanRows(items, result, { defaultMaxStackLayers: 2 })[0]).toMatchObject({
      maxStackLayers: 2,
      plannedQuantity: 3,
      placedQuantity: 2,
      unplacedQuantity: 1,
    })
  })

  it('exports a mixed gap-fill note when any placed box for the cargo came from filler placement', () => {
    const items = [cargo({ id: 'a', name: 'Alpha', label: 'A', quantity: 1, weight: 10 })]
    const result = calculatePacking(container, items)
    ;(result.placed[0] as typeof result.placed[0] & { placementSource?: string }).placementSource = GAP_FILL_SOURCE

    expect(buildExportPlanRows(items, result)[0]).toMatchObject({
      placementNote: 'Mixed gap-fill',
    })
  })
})

const sampleRow: ExportPlanRow = {
  label: 'A',
  name: 'Alpha crate',
  originalLength: 800,
  originalWidth: 600,
  originalHeight: 400,
  actualLength: 800,
  actualWidth: 600,
  actualHeight: '',
  weight: 33,
  maxStackLayers: 2,
  plannedQuantity: 5,
  placedQuantity: 4,
  unplacedQuantity: 1,
  layer: '1, 2',
  workStep: '1',
  placementNote: '',
  failureReason: '',
  failureReasonCode: '',
}

describe('isExportDimensionField', () => {
  it('flags only the mm dimension columns', () => {
    expect(isExportDimensionField('originalLength')).toBe(true)
    expect(isExportDimensionField('actualHeight')).toBe(true)
    expect(isExportDimensionField('weight')).toBe(false)
    expect(isExportDimensionField('label')).toBe(false)
  })
})

describe('projectExportRow', () => {
  it('selects only the templated columns, in order, under their custom headers', () => {
    const out = projectExportRow(sampleRow, [
      { field: 'name', header: 'Goods' },
      { field: 'label', header: 'Tag' },
      { field: 'plannedQuantity', header: 'Qty' },
    ])
    expect(Object.keys(out)).toEqual(['Goods', 'Tag', 'Qty'])
    expect(out).toEqual({ Goods: 'Alpha crate', Tag: 'A', Qty: 5 })
  })

  it('converts mm dimension columns to cm only when unit is cm', () => {
    const out = projectExportRow(sampleRow, [
      { field: 'originalLength', header: 'L', unit: 'cm' },
      { field: 'originalWidth', header: 'W', unit: 'mm' },
      { field: 'originalHeight', header: 'H' },
    ])
    expect(out).toEqual({ L: 80, W: 600, H: 400 })
  })

  it('never scales a non-dimension column even if a stray cm unit is set', () => {
    const out = projectExportRow(sampleRow, [{ field: 'weight', header: 'kg', unit: 'cm' }])
    expect(out).toEqual({ kg: 33 })
  })

  it('emits empty strings for blank values and falls back to the field key when the header is blank', () => {
    const out = projectExportRow(sampleRow, [
      { field: 'actualHeight', header: '   ' },
      { field: 'failureReason', header: 'Reason' },
    ])
    expect(out).toEqual({ actualHeight: '', Reason: '' })
  })
})

describe('buildExportRowsFromTemplate', () => {
  it('projects every row through the same column set', () => {
    const rows: ExportPlanRow[] = [sampleRow, { ...sampleRow, label: 'B', name: 'Beta' }]
    const out = buildExportRowsFromTemplate(rows, [{ field: 'label', header: 'Tag' }])
    expect(out).toEqual([{ Tag: 'A' }, { Tag: 'B' }])
  })
})

// P1-9 RED tests — actual orientation in export
describe('buildExportPlanRows orientation accuracy', () => {
  it('emits actual dimensions from placedBoxes[0] when all placed boxes share the same orientation', () => {
    const items = [
      cargo({ id: 'a', name: 'Uniform', label: 'A', length: 600, width: 400, height: 300, quantity: 2, weight: 10, canRotate: false }),
    ]
    const result = calculatePacking({ ...container, maxWeight: 1000 }, items)
    const rows = buildExportPlanRows(items, result)

    // Both boxes are LWH — actual dims should match original
    expect(rows[0]!.actualLength).toBe(600)
    expect(rows[0]!.actualWidth).toBe(400)
    expect(rows[0]!.actualHeight).toBe(300)
  })

  it('emits empty actual dimensions when the same cargo is placed in multiple orientations', () => {
    // Manually build a result with two boxes of same cargoId but different orientations
    const item: CargoItem = cargo({ id: 'a', name: 'Mixed', label: 'A', length: 600, width: 400, height: 300, quantity: 2, weight: 10 })
    const result = calculatePacking({ ...container, maxWeight: 1000 }, [item])

    // Force two different orientations on the placed boxes for this test
    if (result.placed.length >= 2) {
      result.placed[0]!.orientationKey = 'LWH'
      result.placed[0]!.length = 600
      result.placed[0]!.width = 400
      result.placed[0]!.height = 300
      result.placed[1]!.orientationKey = 'WLH'
      result.placed[1]!.length = 400
      result.placed[1]!.width = 600
      result.placed[1]!.height = 300
    }

    const rows = buildExportPlanRows([item], result)

    // Mixed orientations → actual dims should be empty
    if (result.placed.length >= 2) {
      expect(rows[0]!.actualLength).toBe('')
      expect(rows[0]!.actualWidth).toBe('')
      expect(rows[0]!.actualHeight).toBe('')
    }
  })
})
