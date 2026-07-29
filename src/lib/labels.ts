import type { CargoItem, LabelPackingStats } from '../types'

/**
 * Number of distinct business labels in a plan.
 *
 * `labelStats` holds one entry per `CargoItem`, so its length is a cargo-row count,
 * not a type count: two rows entered under the same label are one business type.
 * Keys are upper-cased to match `normalizeCargoLabelColors`, which assigns one color
 * per label case-insensitively — using a different key here would make the summary
 * contradict the colors shown in 2D/3D. Blank labels carry no type and are ignored.
 */
export function countDistinctLabels(labelStats: Pick<LabelPackingStats, 'label'>[]) {
  const keys = new Set<string>()
  for (const stat of labelStats) {
    const key = String(stat.label ?? '').trim().toUpperCase()
    if (key) keys.add(key)
  }
  return keys.size
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
