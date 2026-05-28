import type { ContainerSpec, PlacedBox } from '../types'
import { snapToGrid } from './snap'
import { snapToEdges } from './snapEdges'
import type { PlacementSettings } from './placementSettings'

type SnapBox = Pick<PlacedBox, 'x' | 'y' | 'length' | 'width'>

export function applyManualPlacementSnap(params: {
  x: number
  y: number
  boxSize: { length: number; width: number }
  others: SnapBox[]
  container: Pick<ContainerSpec, 'length' | 'width'>
  settings: PlacementSettings
}) {
  const { boxSize, container, settings } = params
  let x = params.x
  let y = params.y

  if (!settings.snapEnabled) {
    return { x, y }
  }

  if (settings.edgeSnapEnabled) {
    const snapped = snapToEdges({
      x,
      y,
      length: boxSize.length,
      width: boxSize.width,
      others: params.others,
      container,
      tolerance: settings.edgeToleranceMm,
    })
    x = snapped.x
    y = snapped.y
  }

  if (settings.gridSnapEnabled) {
    x = snapToGrid(x, settings.gridStepMm)
    y = snapToGrid(y, settings.gridStepMm)
  }

  return { x, y }
}
