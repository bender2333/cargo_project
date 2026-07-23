import type { CargoItem, ContainerSpec, LabelPackingStats, PackingResult, PlacedBox } from '../types'
import { assignDepthLayers, buildPackingLayers } from './layers'

export const MANUAL_UNPLACED_REASON_CODE = 'manual-not-placed'
const MANUAL_UNPLACED_REASON = 'Not placed in manual plan'

function buildPlacedOnlyLabelStats(boxes: PlacedBox[]): LabelPackingStats[] {
  const stats = new Map<string, LabelPackingStats>()
  for (const box of boxes) {
    const key = `${box.cargoId}\u0000${box.label}`
    const current = stats.get(key)
    if (current) {
      current.planned += 1
      current.placed += 1
      current.layers = [...new Set([...current.layers, box.physicalLayer])].sort((a, b) => a - b)
    } else {
      stats.set(key, {
        label: box.label,
        name: box.name,
        color: box.color,
        planned: 1,
        placed: 1,
        unplaced: 0,
        layers: [box.physicalLayer],
      })
    }
  }
  return [...stats.values()].sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true }))
}

function enrichPlacedBoxes(boxes: PlacedBox[], cargoItems: CargoItem[]) {
  const cargoById = new Map(cargoItems.map((cargo) => [cargo.id, cargo]))
  const indexes = new Map<string, number>()
  return boxes.map((box) => {
    const index = (indexes.get(box.cargoId) ?? 0) + 1
    indexes.set(box.cargoId, index)
    const cargo = cargoById.get(box.cargoId)
    return {
      ...box,
      name: cargo?.name ?? box.name,
      label: cargo?.label || box.label,
      color: cargo?.color ?? box.color,
      index,
      supportedBy: [...box.supportedBy],
    }
  })
}

function buildPlannedLabelStats(cargoItems: CargoItem[], boxes: PlacedBox[]): LabelPackingStats[] {
  return cargoItems.map((cargo) => {
    const placed = boxes.filter((box) => box.cargoId === cargo.id)
    return {
      label: cargo.label || cargo.name,
      name: cargo.name,
      color: cargo.color,
      planned: cargo.quantity,
      placed: placed.length,
      unplaced: Math.max(0, cargo.quantity - placed.length),
      layers: [...new Set(placed.map((box) => box.physicalLayer))].sort((a, b) => a - b),
    }
  })
}

export function buildManualPackingResult(
  boxes: PlacedBox[],
  container: ContainerSpec,
  cargoItems?: CargoItem[],
): PackingResult {
  const inputBoxes = cargoItems
    ? enrichPlacedBoxes(boxes, cargoItems)
    : boxes.map((box) => ({ ...box, supportedBy: [...box.supportedBy] }))
  const placed = assignDepthLayers(inputBoxes)
  const ordered = [...placed].sort((a, b) =>
    a.physicalLayer - b.physicalLayer ||
    a.z - b.z ||
    a.y - b.y ||
    a.x - b.x ||
    a.id.localeCompare(b.id, undefined, { numeric: true }),
  )

  ordered.forEach((box, index) => {
    box.workStep = index + 1
  })

  const byId = new Map(ordered.map((box) => [box.id, box.workStep]))
  for (const box of placed) {
    box.workStep = byId.get(box.id) ?? box.workStep
  }

  const usedVolume = placed.reduce((sum, box) => sum + box.length * box.width * box.height, 0)
  const containerVolume = container.length * container.width * container.height
  const usedWeight = placed.reduce((sum, box) => sum + box.weight, 0)
  const placedByCargoId = new Map<string, number>()
  for (const box of placed) {
    placedByCargoId.set(box.cargoId, (placedByCargoId.get(box.cargoId) ?? 0) + 1)
  }
  const unplaced = (cargoItems ?? []).flatMap((cargo) => {
    const quantity = Math.max(0, cargo.quantity - (placedByCargoId.get(cargo.id) ?? 0))
    return quantity > 0
      ? [{
          cargoId: cargo.id,
          name: cargo.name,
          label: cargo.label || cargo.name,
          quantity,
          reason: MANUAL_UNPLACED_REASON,
          reasonCode: MANUAL_UNPLACED_REASON_CODE,
        }]
      : []
  })

  return {
    placed,
    unplaced,
    layers: buildPackingLayers(placed),
    workSteps: ordered.map((box) => ({
      step: box.workStep,
      boxId: box.id,
      cargoId: box.cargoId,
      label: box.label,
      physicalLayer: box.physicalLayer,
      supportType: box.supportType,
    })),
    labelStats: cargoItems
      ? buildPlannedLabelStats(cargoItems, placed)
      : buildPlacedOnlyLabelStats(placed),
    diagnostics: [],
    totalCargoCount: cargoItems
      ? cargoItems.reduce((sum, cargo) => sum + cargo.quantity, 0)
      : placed.length,
    placedCount: placed.length,
    usedVolume,
    containerVolume,
    volumeUtilization: containerVolume ? (usedVolume / containerVolume) * 100 : 0,
    usedWeight,
    weightUtilization: container.maxWeight ? (usedWeight / container.maxWeight) * 100 : 0,
  }
}
