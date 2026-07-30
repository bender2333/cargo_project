import type { CargoItem, ExportTemplateColumn, PackingResult } from '../types'
import { isGapFillBox } from './placementSource'

export type ExportPlanRow = {
  label: string
  name: string
  originalLength: number
  originalWidth: number
  originalHeight: number
  actualLength: number | ''
  actualWidth: number | ''
  actualHeight: number | ''
  orientationKey: string
  weight: number
  maxStackLayers: number | ''
  plannedQuantity: number
  placedQuantity: number
  unplacedQuantity: number
  layer: string
  workStep: string
  placementNote: string
  failureReason: string
  failureReasonCode: string
}

function formatNumberList(values: number[]) {
  return values.join(', ')
}

export function buildExportPlanRows(cargoItems: CargoItem[], result: PackingResult, options: { defaultMaxStackLayers?: number } = {}): ExportPlanRow[] {
  return cargoItems.flatMap((item): ExportPlanRow[] => {
    const placedBoxes = result.placed.filter((box) => box.cargoId === item.id)
    const unplaced = result.unplaced.find((entry) => entry.cargoId === item.id)
    const maxStackLayers = item.maxStackLayers ?? options.defaultMaxStackLayers ?? ''
    const gapFillNote = placedBoxes.some(isGapFillBox) ? 'Mixed gap-fill' : ''

    const byOrientation = new Map<string, typeof placedBoxes>()
    for (const box of placedBoxes) {
      const key = box.orientationKey || 'LWH'
      const list = byOrientation.get(key) ?? []
      list.push(box)
      byOrientation.set(key, list)
    }

    const orientationKeys = [...byOrientation.keys()].sort()
    if (orientationKeys.length === 0) {
      return [{
        label: item.label ?? '',
        name: item.name,
        originalLength: item.length,
        originalWidth: item.width,
        originalHeight: item.height,
        actualLength: '',
        actualWidth: '',
        actualHeight: '',
        orientationKey: '',
        weight: item.weight,
        maxStackLayers,
        plannedQuantity: item.quantity,
        placedQuantity: 0,
        unplacedQuantity: unplaced?.quantity ?? item.quantity,
        layer: '',
        workStep: '',
        placementNote: gapFillNote,
        failureReason: unplaced?.reason ?? '',
        failureReasonCode: unplaced?.reasonCode ?? '',
      }]
    }

    return orientationKeys.map((orientationKey, index) => {
      const boxes = byOrientation.get(orientationKey) ?? []
      const first = boxes[0]!
      const isPrimary = index === 0
      return {
        label: item.label ?? '',
        name: item.name,
        originalLength: item.length,
        originalWidth: item.width,
        originalHeight: item.height,
        actualLength: first.length,
        actualWidth: first.width,
        actualHeight: first.height,
        orientationKey,
        weight: item.weight,
        maxStackLayers,
        plannedQuantity: isPrimary ? item.quantity : 0,
        placedQuantity: boxes.length,
        unplacedQuantity: isPrimary ? (unplaced?.quantity ?? 0) : 0,
        layer: formatNumberList([...new Set(boxes.map((box) => box.physicalLayer))].sort((a, b) => a - b)),
        workStep: formatNumberList(boxes.map((box) => box.workStep).sort((a, b) => a - b)),
        placementNote: gapFillNote,
        failureReason: isPrimary ? (unplaced?.reason ?? '') : '',
        failureReasonCode: isPrimary ? (unplaced?.reasonCode ?? '') : '',
      }
    })
  })
}

// Ordered list of every column an export template can include. Drives the
// "add column" picker and the default export template.
export const EXPORT_FIELD_KEYS: (keyof ExportPlanRow)[] = [
  'label',
  'name',
  'originalLength',
  'originalWidth',
  'originalHeight',
  'actualLength',
  'actualWidth',
  'actualHeight',
  'orientationKey',
  'weight',
  'maxStackLayers',
  'plannedQuantity',
  'placedQuantity',
  'unplacedQuantity',
  'layer',
  'workStep',
  'placementNote',
  'failureReason',
  'failureReasonCode',
]

const DIMENSION_FIELDS: Record<string, true> = {
  originalLength: true,
  originalWidth: true,
  originalHeight: true,
  actualLength: true,
  actualWidth: true,
  actualHeight: true,
}

// Dimension columns are stored in mm; only these accept a cm unit override.
export function isExportDimensionField(field: string): boolean {
  return DIMENSION_FIELDS[field] === true
}

export function projectExportRow(row: ExportPlanRow, columns: ExportTemplateColumn[]): Record<string, string | number> {
  const out: Record<string, string | number> = {}
  for (const col of columns) {
    const raw = (row as Record<string, unknown>)[col.field]
    let value: string | number = typeof raw === 'number' || typeof raw === 'string' ? raw : ''
    if (col.unit === 'cm' && typeof value === 'number' && isExportDimensionField(col.field)) {
      value = value / 10
    }
    out[col.header.trim() || col.field] = value
  }
  return out
}

export function buildExportRowsFromTemplate(rows: ExportPlanRow[], columns: ExportTemplateColumn[]): Record<string, string | number>[] {
  return rows.map((row) => projectExportRow(row, columns))
}
