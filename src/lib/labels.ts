import type { CargoItem } from '../types'

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
