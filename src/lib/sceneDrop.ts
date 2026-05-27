import type { PlacedBox, ContainerSpec } from '../types'
import { MIN_SUPPORT_OVERLAP_RATIO } from './manualPlacement'
import { DEFAULT_PLACEMENT_SETTINGS, type SupportPolicy } from './placementSettings'

export type DropSize = { length: number; width: number; height: number }
export type DropTarget = {
  x: number // mm — top-left X of dragged box
  y: number // mm — top-left Y
  z: number // mm — bottom Z of dragged box
  /** id of the box whose top surface we snapped to, or null when landing on the floor */
  surfaceBoxId: string | null
  supportRatio: number
  supportSeverity: 'ok' | 'warning'
}

function overlapArea(ax: number, ay: number, al: number, aw: number, bx: number, by: number, bl: number, bw: number) {
  const xOverlap = Math.max(0, Math.min(ax + al, bx + bl) - Math.max(ax, bx))
  const yOverlap = Math.max(0, Math.min(ay + aw, by + bw) - Math.max(ay, by))
  return xOverlap * yOverlap
}

/**
 * Resolve a building-game style drop point for a dragged box.
 *
 * Behaviour:
 *  - Raycast every other placed box's top face. Closest valid hit wins.
 *  - When snapping onto a surface, the dragged box must have at least
 *    `MIN_SUPPORT_OVERLAP_RATIO` (50%) of its footprint resting on the surface.
 *    We first try cursor-centred placement; if not enough, we try surface-centred;
 *    if still not enough we skip the snap entirely (no flicker on commit).
 *  - If no top face is hit, fall back to the ground plane (z = 0).
 *
 * The returned (x, y) is the top-left corner of the dragged box.
 */
export function resolveDropTarget(params: {
  rayOrigin: { x: number; y: number; z: number }
  rayDirection: { x: number; y: number; z: number }
  boxes: PlacedBox[]
  draggedBoxId: string | null
  draggedSize: DropSize
  container: Pick<ContainerSpec, 'length' | 'width' | 'height'>
  supportPolicy?: SupportPolicy
  surfaceSnapEnabled?: boolean
}): DropTarget {
  const { rayOrigin, rayDirection, boxes, draggedBoxId, draggedSize, container } = params
  const supportPolicy = params.supportPolicy ?? DEFAULT_PLACEMENT_SETTINGS.supportPolicy
  const minSupportRatio = supportPolicy.allowPartialOverhang
    ? supportPolicy.minSupportRatio
    : MIN_SUPPORT_OVERLAP_RATIO
  const baseArea = draggedSize.length * draggedSize.width

  let bestHit: { t: number; box: PlacedBox } | null = null
  if (params.surfaceSnapEnabled !== false) {
    for (const other of boxes) {
      if (other.id === draggedBoxId) continue
      const topZ = other.z + other.height
      if (topZ + draggedSize.height > container.height + 0.5) continue
      if (Math.abs(rayDirection.z) < 1e-6) continue
      const t = (topZ - rayOrigin.z) / rayDirection.z
      if (t <= 0) continue
      const hx = rayOrigin.x + rayDirection.x * t
      const hy = rayOrigin.y + rayDirection.y * t
      if (hx < other.x || hx > other.x + other.length) continue
      if (hy < other.y || hy > other.y + other.width) continue
      if (!bestHit || t < bestHit.t) bestHit = { t, box: other }
    }
  }

  if (bestHit) {
    const surface = bestHit.box
    const surfaceTopZ = surface.z + surface.height
    const cursorX = rayOrigin.x + rayDirection.x * bestHit.t
    const cursorY = rayOrigin.y + rayDirection.y * bestHit.t

    // Try cursor-centred first.
    const candidates: Array<{ x: number; y: number }> = [
      { x: cursorX - draggedSize.length / 2, y: cursorY - draggedSize.width / 2 },
      // Fallback: snap the box's centre to the surface's centre.
      { x: surface.x + (surface.length - draggedSize.length) / 2, y: surface.y + (surface.width - draggedSize.width) / 2 },
    ]
    for (const cand of candidates) {
      const overlap = overlapArea(cand.x, cand.y, draggedSize.length, draggedSize.width, surface.x, surface.y, surface.length, surface.width)
      const supportRatio = baseArea > 0 ? overlap / baseArea : 0
      if (supportRatio >= minSupportRatio) {
        return {
          x: cand.x,
          y: cand.y,
          z: surfaceTopZ,
          surfaceBoxId: surface.id,
          supportRatio,
          supportSeverity: supportRatio < supportPolicy.warningSupportRatio ? 'warning' : 'ok',
        }
      }
    }
    // Surface is too small; fall through to ground.
  }

  // Ground plane fallback.
  const groundT = Math.abs(rayDirection.z) < 1e-6 ? 0 : (0 - rayOrigin.z) / rayDirection.z
  const cursorX = rayOrigin.x + rayDirection.x * groundT
  const cursorY = rayOrigin.y + rayDirection.y * groundT
  return {
    x: cursorX - draggedSize.length / 2,
    y: cursorY - draggedSize.width / 2,
    z: 0,
    surfaceBoxId: null,
    supportRatio: 1,
    supportSeverity: 'ok',
  }
}
