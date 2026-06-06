import type { PlacedBox } from '../types'

export type FaceLabelIcon = 'rotate' | 'no-rotate' | 'stack' | 'no-stack'

export type FaceLabelContent = {
  badge: string
  name: string
  icons: FaceLabelIcon[]
  stackLayersText: string
  orientationText: string
  weightDimText: string
}

export function faceLabelContent(box: PlacedBox): FaceLabelContent {
  return {
    badge: box.label.toUpperCase().slice(0, 2),
    name: box.name,
    icons: [
      box.canRotate ? 'rotate' : 'no-rotate',
      box.stackable ? 'stack' : 'no-stack',
    ],
    stackLayersText: box.stackable && box.maxStackLayers && box.maxStackLayers > 0
      ? String(box.maxStackLayers)
      : '',
    orientationText: box.orientationLabel ?? box.orientationKey,
    weightDimText: `${box.weight}kg / ${box.length}x${box.width}x${box.height}`,
  }
}

export function faceLabelContentSignature(box: PlacedBox) {
  const content = faceLabelContent(box)
  return [
    content.badge,
    content.name,
    content.icons.join(','),
    content.stackLayersText,
    content.orientationText,
    content.weightDimText,
  ].join('|')
}
