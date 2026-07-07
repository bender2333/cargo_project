import type { PlacedBox } from '../types'

export const GAP_FILL_SOURCE = 'gap-fill'

export function isGapFillBox(box: PlacedBox): boolean {
  return (box as PlacedBox & { placementSource?: string }).placementSource === GAP_FILL_SOURCE
}
