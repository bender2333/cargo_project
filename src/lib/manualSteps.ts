import type { ContainerSpec, LabelPackingStats, PackingResult, PlacedBox } from '../types'
import { assignDepthLayers, buildPackingLayers } from './layers'

function buildLabelStats(boxes: PlacedBox[]): LabelPackingStats[] {
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

export function buildManualPackingResult(boxes: PlacedBox[], container: ContainerSpec): PackingResult {
  const placed = assignDepthLayers(boxes.map((box) => ({ ...box, supportedBy: [...box.supportedBy] })))
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

  return {
    placed,
    unplaced: [],
    layers: buildPackingLayers(placed),
    workSteps: ordered.map((box) => ({
      step: box.workStep,
      boxId: box.id,
      cargoId: box.cargoId,
      label: box.label,
      physicalLayer: box.physicalLayer,
      supportType: box.supportType,
    })),
    labelStats: buildLabelStats(placed),
    diagnostics: [],
    totalCargoCount: placed.length,
    placedCount: placed.length,
    usedVolume,
    containerVolume,
    volumeUtilization: containerVolume ? (usedVolume / containerVolume) * 100 : 0,
    usedWeight,
    weightUtilization: container.maxWeight ? (usedWeight / container.maxWeight) * 100 : 0,
  }
}
