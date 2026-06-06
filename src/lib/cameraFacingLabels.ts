export type LocalBoxFace = '+X' | '-X' | '+Y' | '-Y' | '+Z' | '-Z'
export type CameraLabelViewMode = 'iso' | 'top' | 'front' | 'side'

export type VectorLike = {
  x: number
  y: number
  z: number
}

function signedFace(axis: 'X' | 'Y' | 'Z', value: number): LocalBoxFace {
  return `${value >= 0 ? '+' : '-'}${axis}` as LocalBoxFace
}

export function cameraDirectionForViewMode(viewMode: CameraLabelViewMode): VectorLike {
  if (viewMode === 'top') return { x: 0, y: 1, z: 0 }
  if (viewMode === 'front') return { x: 0, y: 0, z: 1 }
  if (viewMode === 'side') return { x: 1, y: 0, z: 0 }
  return { x: 0.72, y: 0.48, z: 0.82 }
}

export function fixedLabelFacesForViewMode(viewMode: CameraLabelViewMode): LocalBoxFace[] | null {
  if (viewMode === 'top') return ['+Y']
  if (viewMode === 'front') return ['+Z']
  if (viewMode === 'side') return ['+X']
  return null
}

export function cameraFacingLabelFaces(directionLocal: VectorLike, maxFaces = 2): LocalBoxFace[] {
  const horizontal = [
    { axis: 'X' as const, value: directionLocal.x },
    { axis: 'Z' as const, value: directionLocal.z },
  ]
    .filter((entry) => Math.abs(entry.value) > 0.15)
    .sort((a, b) => Math.abs(b.value) - Math.abs(a.value))

  if (horizontal.length > 0) {
    return horizontal.slice(0, maxFaces).map((entry) => signedFace(entry.axis, entry.value))
  }

  if (Math.abs(directionLocal.y) > 0.15) {
    return [signedFace('Y', directionLocal.y)]
  }

  return ['+X']
}
