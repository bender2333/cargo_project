import type { PlacedBox, ContainerSpec } from '../types'

export type DropSize = { length: number; width: number; height: number }
export type DropTarget = {
  x: number // mm — top-left X of dragged box
  y: number // mm — top-left Y
  z: number // mm — bottom Z of dragged box
  /** id of the box whose top surface we snapped to, or null when landing on the floor */
  surfaceBoxId: string | null
}

/**
 * Resolve a building-game style drop point for a dragged box.
 *
 * Behaviour:
 *  - Iterate every other placed box and compute the parametric hit distance of the
 *    pointer ray against its top face (z = box.z + box.height) restricted to the box's
 *    XY rectangle.
 *  - The closest valid top-face hit wins; the dragged box is placed *on top* of it
 *    (z = surface.top, centred on the cursor).
 *  - If no top face is hit, fall back to the ground plane (z = 0).
 *
 * The returned (x, y) is the top-left corner of the dragged box, centred on the cursor.
 * The caller is responsible for validating overlap / boundary / support afterwards.
 */
export function resolveDropTarget(params: {
  rayOrigin: { x: number; y: number; z: number }
  rayDirection: { x: number; y: number; z: number }
  boxes: PlacedBox[]
  draggedBoxId: string | null
  draggedSize: DropSize
  container: Pick<ContainerSpec, 'length' | 'width' | 'height'>
}): DropTarget {
  const { rayOrigin, rayDirection, boxes, draggedBoxId, draggedSize, container } = params

  let bestHit: { t: number; box: PlacedBox } | null = null
  for (const other of boxes) {
    if (other.id === draggedBoxId) continue
    const topZ = other.z + other.height
    if (topZ + draggedSize.height > container.height + 0.5) continue // would overflow
    if (Math.abs(rayDirection.z) < 1e-6) continue
    const t = (topZ - rayOrigin.z) / rayDirection.z
    if (t <= 0) continue
    const hx = rayOrigin.x + rayDirection.x * t
    const hy = rayOrigin.y + rayDirection.y * t
    if (hx < other.x || hx > other.x + other.length) continue
    if (hy < other.y || hy > other.y + other.width) continue
    if (!bestHit || t < bestHit.t) {
      bestHit = { t, box: other }
    }
  }

  // Fallback: ground plane z = 0.
  const useGround = !bestHit
  const hitZ = useGround ? 0 : bestHit!.box.z + bestHit!.box.height
  const groundT = Math.abs(rayDirection.z) < 1e-6 ? 0 : (hitZ - rayOrigin.z) / rayDirection.z
  const t = bestHit ? bestHit.t : groundT
  const cursorX = rayOrigin.x + rayDirection.x * t
  const cursorY = rayOrigin.y + rayDirection.y * t

  // Cursor sits at the centre of the box footprint; the caller stores the top-left corner.
  const x = cursorX - draggedSize.length / 2
  const y = cursorY - draggedSize.width / 2

  return {
    x,
    y,
    z: hitZ,
    surfaceBoxId: bestHit ? bestHit.box.id : null,
  }
}
