import type { ContainerSpec, PlacedBox } from '../types'

export type SnapGuide = {
  /** World axis of the alignment line */
  axis: 'x' | 'y'
  /** World coordinate where the guide line should be drawn */
  coordinate: number
  /** What the alignment line matches */
  kind: 'wall' | 'center' | 'neighbor-edge'
  /** For neighbor-edge kinds, the id of the box being aligned to */
  neighborBoxId?: string
}

type EdgeSnapBox = Pick<PlacedBox, 'id' | 'x' | 'y' | 'length' | 'width'>

/**
 * Derive visual snap guide lines from a post-snap box position.
 *
 * Given the snapped position and snapped axes, determines which alignment
 * candidates were matched and returns guide descriptors for the renderer.
 * Pure function — no side effects, safe for render-hot paths.
 */
export function snapGuides(params: {
  /** The snapped top-left x of the dragged box */
  x: number
  /** The snapped top-left y of the dragged box */
  y: number
  length: number
  width: number
  snappedAxes: ('x' | 'y')[]
  others: EdgeSnapBox[]
  container: Pick<ContainerSpec, 'length' | 'width'>
}): SnapGuide[] {
  const { x, y, length, width, snappedAxes, others, container } = params
  const guides: SnapGuide[] = []

  const EPS = 0.001

  for (const axis of snappedAxes) {
    const coord = axis === 'x' ? x : y
    const boxDim = axis === 'x' ? length : width
    const containerDim = axis === 'x' ? container.length : container.width

    // Check container walls and center first (priority: wall > center > neighbor)
    // Front/left wall
    if (Math.abs(coord) < EPS) {
      guides.push({
        axis,
        coordinate: 0,
        kind: 'wall',
      })
      continue
    }

    // Rear/right wall
    if (Math.abs(coord - (containerDim - boxDim)) < EPS) {
      guides.push({
        axis,
        coordinate: containerDim,
        kind: 'wall',
      })
      continue
    }

    // Centerline
    if (Math.abs(coord - (containerDim - boxDim) / 2) < EPS) {
      guides.push({
        axis,
        coordinate: containerDim / 2,
        kind: 'center',
      })
      continue
    }

    // Check neighbor box edges
    let found = false
    for (const o of others) {
      const oPos = axis === 'x' ? o.x : o.y
      const oDim = axis === 'x' ? o.length : o.width

      // Box left/top edge aligned to neighbor left/top edge
      if (Math.abs(coord - oPos) < EPS) {
        guides.push({
          axis,
          coordinate: oPos,
          kind: 'neighbor-edge',
          neighborBoxId: o.id,
        })
        found = true
        break
      }
      // Box left/top edge aligned to neighbor right/bottom edge (edge-to-edge)
      if (Math.abs(coord - (oPos + oDim)) < EPS) {
        guides.push({
          axis,
          coordinate: oPos + oDim,
          kind: 'neighbor-edge',
          neighborBoxId: o.id,
        })
        found = true
        break
      }
      // Box right/bottom edge aligned to neighbor right/bottom edge
      if (Math.abs(coord - (oPos + oDim - boxDim)) < EPS) {
        guides.push({
          axis,
          coordinate: oPos + oDim,
          kind: 'neighbor-edge',
          neighborBoxId: o.id,
        })
        found = true
        break
      }
      // Box right/bottom edge aligned to neighbor left/top edge
      if (Math.abs(coord - (oPos - boxDim)) < EPS) {
        guides.push({
          axis,
          coordinate: oPos,
          kind: 'neighbor-edge',
          neighborBoxId: o.id,
        })
        found = true
        break
      }
    }

    // If no known candidate matched, still emit a basic guide at the snapped coordinate
    if (!found) {
      guides.push({
        axis,
        coordinate: coord,
        kind: 'neighbor-edge',
      })
    }
  }

  return guides
}
