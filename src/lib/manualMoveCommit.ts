export function manualMoveCommitArgs(params: {
  mode: 'plane' | 'z'
  boxId: string
  currentX: number
  currentY: number
  finalX: number
  finalY: number
  finalZ: number
}): [boxId: string, x: number, y: number, z: number] {
  const z = Math.max(0, params.finalZ)
  if (params.mode === 'z') {
    return [params.boxId, params.currentX, params.currentY, z]
  }
  return [params.boxId, params.finalX, params.finalY, z]
}
