import type { CargoItem, PackingResult } from '../types'

export type ExportPlanRow = {
  label: string
  name: string
  originalLength: number
  originalWidth: number
  originalHeight: number
  actualLength: number | ''
  actualWidth: number | ''
  actualHeight: number | ''
  weight: number
  plannedQuantity: number
  placedQuantity: number
  unplacedQuantity: number
  layer: string
  workStep: string
  failureReason: string
  failureReasonCode: string
}

function formatNumberList(values: number[]) {
  return values.join(', ')
}

export function buildExportPlanRows(cargoItems: CargoItem[], result: PackingResult): ExportPlanRow[] {
  return cargoItems.map((item): ExportPlanRow => {
    const placedBoxes = result.placed.filter((box) => box.cargoId === item.id)
    const unplaced = result.unplaced.find((entry) => entry.cargoId === item.id)
    const stats = result.labelStats.find((entry) => entry.label === item.label && entry.name === item.name)

    return {
      label: item.label ?? '',
      name: item.name,
      originalLength: item.length,
      originalWidth: item.width,
      originalHeight: item.height,
      actualLength: placedBoxes[0]?.length ?? '',
      actualWidth: placedBoxes[0]?.width ?? '',
      actualHeight: placedBoxes[0]?.height ?? '',
      weight: item.weight,
      plannedQuantity: item.quantity,
      placedQuantity: stats?.placed ?? placedBoxes.length,
      unplacedQuantity: stats?.unplaced ?? unplaced?.quantity ?? 0,
      layer: formatNumberList(stats?.layers ?? [...new Set(placedBoxes.map((box) => box.physicalLayer))].sort((a, b) => a - b)),
      workStep: formatNumberList(placedBoxes.map((box) => box.workStep).sort((a, b) => a - b)),
      failureReason: unplaced?.reason ?? '',
      failureReasonCode: unplaced?.reasonCode ?? '',
    }
  })
}
