import type { CargoItem, LabelPackingStats, PlacedBox } from '../types'

export function normalizeBusinessLabel(label: string | undefined | null) {
  return String(label ?? '').trim().toUpperCase()
}

/**
 * Number of distinct business labels in a plan.
 * Keys match normalizeCargoLabelColors (case-insensitive).
 */
export function countDistinctLabels(labelStats: Pick<LabelPackingStats, 'label'>[]) {
  const keys = new Set<string>()
  for (const stat of labelStats) {
    const key = normalizeBusinessLabel(stat.label)
    if (key) keys.add(key)
  }
  return keys.size
}

/** Aggregate planned/placed/unplaced by normalized business label. */
export function buildLabelStats(cargoItems: CargoItem[], placed: PlacedBox[]): LabelPackingStats[] {
  if (cargoItems.length === 0) {
    const stats = new Map<string, LabelPackingStats>()
    for (const box of placed) {
      const rawLabel = String(box.label ?? '').trim() || box.name
      const key = normalizeBusinessLabel(rawLabel) || `__box_${box.id}`
      const current = stats.get(key)
      if (current) {
        current.planned += 1
        current.placed += 1
        current.layers = [...new Set([...current.layers, box.physicalLayer])].sort((a, b) => a - b)
      } else {
        stats.set(key, {
          label: rawLabel,
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

  const placedByCargoId = new Map<string, PlacedBox[]>()
  for (const box of placed) {
    const list = placedByCargoId.get(box.cargoId) ?? []
    list.push(box)
    placedByCargoId.set(box.cargoId, list)
  }

  const stats = new Map<string, LabelPackingStats>()
  cargoItems.forEach((item, index) => {
    const rawLabel = String(item.label ?? '').trim() || item.name || `Cargo ${index + 1}`
    const key = normalizeBusinessLabel(rawLabel) || `__unnamed_${item.id}`
    const boxes = placedByCargoId.get(item.id) ?? []
    const placedCount = boxes.length
    const unplacedCount = Math.max(0, item.quantity - placedCount)
    const layers = boxes.map((box) => box.physicalLayer)
    const current = stats.get(key)
    if (current) {
      current.planned += item.quantity
      current.placed += placedCount
      current.unplaced += unplacedCount
      current.layers = [...new Set([...current.layers, ...layers])].sort((a, b) => a - b)
      return
    }
    stats.set(key, {
      label: rawLabel,
      name: item.name,
      color: item.color,
      planned: item.quantity,
      placed: placedCount,
      unplaced: unplacedCount,
      layers: [...new Set(layers)].sort((a, b) => a - b),
    })
  })

  return [...stats.values()].sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true }))
}

export function normalizeCargoLabelColors(items: CargoItem[]) {
  const colorByLabel = new Map<string, string>()

  return items.map((item) => {
    const rawLabel = String(item.label ?? '').trim()
    const label = rawLabel.length <= 2 ? rawLabel.toUpperCase() : rawLabel
    if (!label) {
      return item
    }

    const colorKey = label.toUpperCase()
    const existingColor = colorByLabel.get(colorKey)
    if (existingColor) {
      return { ...item, label, color: existingColor }
    }

    colorByLabel.set(colorKey, item.color)
    return item.label === label ? item : { ...item, label }
  })
}
