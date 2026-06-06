import type { PlacedBox } from '../types'

export type FaceLabelIcon = 'rotate' | 'no-rotate' | 'stack' | 'no-stack'

export type FaceLabelContent = {
  badge: string
  name: string
  icons: FaceLabelIcon[]
  stackLayersText: string
  weightDimText: string
}

export type FaceLabelBand = {
  left: number
  top: number
  right: number
  bottom: number
}

export type FaceLabelLayout = {
  mode: 'full' | 'compact'
  nameBand: FaceLabelBand
  badgeBand: FaceLabelBand
  weightBand: FaceLabelBand
  iconBand: FaceLabelBand
  badgeFontPx: number
  nameFontPx: number
  weightFontPx: number
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
    weightDimText: `${box.weight}kg / ${box.length}x${box.width}x${box.height}`,
  }
}

export function faceLabelLayout(_content: FaceLabelContent, mode: 'full' | 'compact'): FaceLabelLayout {
  if (mode === 'compact') {
    return {
      mode,
      nameBand: { left: 0, top: 0, right: 0, bottom: 0 },
      badgeBand: { left: 20, top: 24, right: 116, bottom: 120 },
      weightBand: { left: 0, top: 0, right: 0, bottom: 0 },
      iconBand: { left: 166, top: 28, right: 226, bottom: 88 },
      badgeFontPx: 46,
      nameFontPx: 0,
      weightFontPx: 0,
    }
  }

  return {
    mode,
    nameBand: { left: 16, top: 0, right: 240, bottom: 40 },
    badgeBand: { left: 50, top: 44, right: 206, bottom: 148 },
    weightBand: { left: 16, top: 154, right: 240, bottom: 198 },
    iconBand: { left: 44, top: 204, right: 212, bottom: 248 },
    badgeFontPx: 84,
    nameFontPx: 18,
    weightFontPx: 15,
  }
}

export function faceLabelContentSignature(box: PlacedBox) {
  const content = faceLabelContent(box)
  return [
    content.badge,
    content.name,
    content.icons.join(','),
    content.stackLayersText,
    content.weightDimText,
  ].join('|')
}
