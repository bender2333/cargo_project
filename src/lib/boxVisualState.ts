import type { PlacedBox } from '../types'

const LAYER_FADE_OPACITY = 0.09
const LAYER_FADE_EDGE_OPACITY = 0.05
const GENERAL_FADE_OPACITY = 0.22
const GENERAL_FADE_EDGE_OPACITY = 0.14

export function boxVisualState(
  box: PlacedBox,
  activeLayerId: string,
  activeLabelId: string,
  selectedBoxId: string | null | undefined,
  highlightBoxIds: Set<string> | undefined,
  invalid: boolean,
) {
  const selected = box.id === selectedBoxId
  const highlighted = highlightBoxIds?.has(box.id) ?? false
  const currentLayer = activeLayerId === 'all' || String(box.physicalLayer) === activeLayerId
  const currentLabel = activeLabelId === 'all' || box.label === activeLabelId
  const active = selected || highlighted || (currentLayer && currentLabel)
  const fadingSpecificLayer = activeLayerId !== 'all' && !currentLayer
  return {
    selected,
    highlighted,
    active,
    invalid,
    opacity: active ? 1 : fadingSpecificLayer ? LAYER_FADE_OPACITY : GENERAL_FADE_OPACITY,
    edgeColor: invalid ? 0xef4444 : selected || highlighted ? 0xf3b21a : active ? 0x252525 : 0x777777,
    edgeOpacity: invalid ? 0.95 : active ? 0.72 : fadingSpecificLayer ? LAYER_FADE_EDGE_OPACITY : GENERAL_FADE_EDGE_OPACITY,
  }
}
