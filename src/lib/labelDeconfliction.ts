import type { PlacedBox } from '../types'

export type LabelProjectionMode = 'top' | 'front' | 'side'
export type BoxLabelMode = 'full' | 'compact'

type LabelModeOptions = {
  boxes: PlacedBox[]
  projectionMode: LabelProjectionMode
  activeLayerId: string
  activeLabelId: string
  selectedBoxId?: string | null
  highlightBoxIds?: Set<string>
}

function projection(box: PlacedBox, mode: LabelProjectionMode) {
  if (mode === 'front') {
    return { x: box.x, y: box.z, width: box.length, height: box.height }
  }
  if (mode === 'side') {
    return { x: box.y, y: box.z, width: box.width, height: box.height }
  }
  return { x: box.x, y: box.y, width: box.length, height: box.width }
}

function overlapsProjection(a: ReturnType<typeof projection>, b: ReturnType<typeof projection>) {
  return (
    a.x < b.x + b.width &&
    b.x < a.x + a.width &&
    a.y < b.y + b.height &&
    b.y < a.y + a.height
  )
}

function isProtectedLabel(box: PlacedBox, options: LabelModeOptions) {
  if (box.id === options.selectedBoxId) return true
  if (options.highlightBoxIds?.has(box.id)) return true
  if (options.activeLayerId !== 'all' && String(box.physicalLayer) === options.activeLayerId) return true
  if (options.activeLabelId !== 'all' && box.label === options.activeLabelId) return true
  return false
}

function isHigherPriority(covering: PlacedBox, covered: PlacedBox, mode: LabelProjectionMode) {
  if (mode === 'top') {
    if (covering.z !== covered.z) return covering.z > covered.z
    if (covering.physicalLayer !== covered.physicalLayer) return covering.physicalLayer > covered.physicalLayer
  } else if (covering.physicalLayer !== covered.physicalLayer) {
    return covering.physicalLayer > covered.physicalLayer
  }
  return covering.workStep > covered.workStep
}

export function buildBoxLabelModes(options: LabelModeOptions): Map<string, BoxLabelMode> {
  const modes = new Map<string, BoxLabelMode>()
  for (const box of options.boxes) {
    modes.set(box.id, 'full')
  }

  if (options.activeLayerId !== 'all' || options.activeLabelId !== 'all') {
    return modes
  }

  const projections = new Map(options.boxes.map((box) => [box.id, projection(box, options.projectionMode)]))
  for (const box of options.boxes) {
    if (isProtectedLabel(box, options)) continue
    const projected = projections.get(box.id)
    if (!projected) continue

    const covered = options.boxes.some((other) => {
      if (other.id === box.id) return false
      const otherProjection = projections.get(other.id)
      if (!otherProjection || !overlapsProjection(projected, otherProjection)) return false
      return isHigherPriority(other, box, options.projectionMode)
    })

    if (covered) {
      modes.set(box.id, 'compact')
    }
  }
  return modes
}
