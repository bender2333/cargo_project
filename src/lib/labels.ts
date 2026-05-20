import type { CargoItem } from '../types'

export function normalizeCargoLabelColors(items: CargoItem[]) {
  const colorByLabel = new Map<string, string>()

  return items.map((item) => {
    const label = (item.label ?? '').toUpperCase().slice(0, 2)
    if (!label) {
      return item
    }

    const existingColor = colorByLabel.get(label)
    if (existingColor) {
      return { ...item, label, color: existingColor }
    }

    colorByLabel.set(label, item.color)
    return item.label === label ? item : { ...item, label }
  })
}
