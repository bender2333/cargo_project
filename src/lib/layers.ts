import type { PackingLayer, PlacedBox } from '../types'

export function buildPackingLayers(placed: PlacedBox[]): PackingLayer[] {
  const groups = new Map<number, PlacedBox[]>()
  placed.forEach((box) => {
    groups.set(box.physicalLayer, [...(groups.get(box.physicalLayer) ?? []), box])
  })

  return [...groups.entries()]
    .sort(([a], [b]) => a - b)
    .map(([physicalLayer, boxes]) => {
      const labelCounts = new Map<string, { label: string; color: string; count: number }>()
      boxes.forEach((box) => {
        const current = labelCounts.get(box.label)
        labelCounts.set(box.label, {
          label: box.label,
          color: box.color,
          count: (current?.count ?? 0) + 1,
        })
      })

      return {
        id: String(physicalLayer),
        physicalLayer,
        minZ: Math.min(...boxes.map((box) => box.z)),
        maxZ: Math.max(...boxes.map((box) => box.z + box.height)),
        count: boxes.length,
        weight: boxes.reduce((sum, box) => sum + box.weight, 0),
        volume: boxes.reduce((sum, box) => sum + box.length * box.width * box.height, 0),
        labels: [...labelCounts.values()].sort((a, b) => a.label.localeCompare(b.label)),
        supportedBy: [...new Set(boxes.flatMap((box) => box.supportedBy))].sort(),
      }
    })
}
