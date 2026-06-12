import { orientationAxesOf, orientationRenderingBasisVectors, baseDimensionsFromPlaced } from './orientationTransform'
import type { OrientationAxes } from './manualPlacement'

type BoxFootprint = Pick<import('../types').PlacedBox, 'length' | 'width' | 'height' | 'orientationKey'> & { orientationAxes?: OrientationAxes }

/**
 * Compute the rendered AABB extent (in mm, container coordinates) that the 3D scene
 * would produce for a placed box. Mirrors ContainerScene's boxGeometryForPlaced +
 * boxOrientationQuaternion without depending on Three.js.
 *
 * Returns: { xExtent, yExtent, zExtent } where:
 *   xExtent = extent along container length axis
 *   yExtent = extent along container width axis
 *   zExtent = extent along container height axis
 */
export function renderedFootprint(box: BoxFootprint): { xExtent: number; yExtent: number; zExtent: number } {
  const base = baseDimensionsFromPlaced(box)
  const axes = orientationAxesOf(box)
  const basis = orientationRenderingBasisVectors(axes)

  // Three.js geometry: width=base.length (THREE.x), height=base.height (THREE.y), depth=base.width (THREE.z)
  const hl = base.length / 2
  const hh = base.height / 2
  const hw = base.width / 2

  let minX = Infinity, maxX = -Infinity
  let minY = Infinity, maxY = -Infinity
  let minZ = Infinity, maxZ = -Infinity

  // 8 box vertices in Three.js local space, rotated by the quaternion from boxOrientationQuaternion
  for (const sx of [-1, 1]) {
    for (const sy of [-1, 1]) {
      for (const sz of [-1, 1]) {
        const lx = sx * hl
        const ly = sy * hh
        const lz = sz * hw

        // boxOrientationQuaternion uses orientationRenderingBasisVectors remapped:
        //   THREE.x basis = (basis.length.x, basis.length.z, basis.length.y)
        //   THREE.y basis = (basis.height.x, basis.height.z, basis.height.y)
        //   THREE.z basis = (basis.width.x, basis.width.z, basis.width.y)
        // The resulting container coordinates:
        const cx = lx * basis.length.x + ly * basis.height.x + lz * basis.width.x
        const cz = lx * basis.length.z + ly * basis.height.z + lz * basis.width.z  // container Z
        const cy = lx * basis.length.y + ly * basis.height.y + lz * basis.width.y  // container Y

        minX = Math.min(minX, cx)
        maxX = Math.max(maxX, cx)
        minZ = Math.min(minZ, cz)
        maxZ = Math.max(maxZ, cz)
        minY = Math.min(minY, cy)
        maxY = Math.max(maxY, cy)
      }
    }
  }

  return {
    xExtent: maxX - minX,
    yExtent: maxY - minY,  // container Y = width extent
    zExtent: maxZ - minZ,  // container Z = height extent
  }
}
