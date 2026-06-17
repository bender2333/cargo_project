import type { PlacedBox } from '../types'
import type { BodyAxis, LabelRotationDeg, OrientationAxes, OrientationKey, SignedBodyAxis } from './manualPlacement'

type AxisVector = { x: -1 | 0 | 1; y: -1 | 0 | 1; z: -1 | 0 | 1 }

export type OrientationView = 'top' | 'front' | 'side'
export type OrientationBasisVectors = { length: AxisVector; width: AxisVector; height: AxisVector }

function axisLetter(axis: SignedBodyAxis) {
  return axis[0] as 'L' | 'W' | 'H'
}

function axisSign(axis: SignedBodyAxis) {
  return axis.endsWith('+') ? 1 : -1
}

function canonicalAxesForOrientation(orientationKey: OrientationKey): OrientationAxes {
  const [x, y, z] = orientationKey.split('') as Array<'L' | 'W' | 'H'>
  return { x: `${x}+` as SignedBodyAxis, y: `${y}+` as SignedBodyAxis, z: `${z}+` as SignedBodyAxis }
}

function invertAxes(axes: OrientationAxes): Record<BodyAxis, AxisVector> {
  const result: Record<BodyAxis, AxisVector> = {
    L: { x: 0, y: 0, z: 0 },
    W: { x: 0, y: 0, z: 0 },
    H: { x: 0, y: 0, z: 0 },
  }
  ;(['x', 'y', 'z'] as const).forEach((worldAxis) => {
    const bodyAxis = axes[worldAxis]
    result[axisLetter(bodyAxis)] = {
      x: worldAxis === 'x' ? axisSign(bodyAxis) : 0,
      y: worldAxis === 'y' ? axisSign(bodyAxis) : 0,
      z: worldAxis === 'z' ? axisSign(bodyAxis) : 0,
    } as AxisVector
  })
  return result
}

const TOP_ROTATION_BY_AXIS: Partial<Record<SignedBodyAxis, LabelRotationDeg>> = {
  'W+': 0,
  'L+': 90,
  'W-': 180,
  'L-': 270,
}

const SIDE_ROTATION_BY_AXIS: Partial<Record<SignedBodyAxis, LabelRotationDeg>> = {
  'H+': 0,
  'W+': 90,
  'H-': 180,
  'W-': 270,
}

export function orientationAxesOf(
  box: Pick<PlacedBox, 'orientationKey' | 'orientationAxes'> | { orientationKey: OrientationKey; orientationAxes?: OrientationAxes },
): OrientationAxes {
  return box.orientationAxes ?? canonicalAxesForOrientation(box.orientationKey)
}

export function orientationBasisVectors(axes: OrientationAxes): OrientationBasisVectors {
  const inverted = invertAxes(axes)
  return {
    length: inverted.L,
    width: inverted.W,
    height: inverted.H,
  }
}

function vectorCross(a: AxisVector, b: AxisVector): AxisVector {
  return {
    x: (a.y * b.z - a.z * b.y) as AxisVector['x'],
    y: (a.z * b.x - a.x * b.z) as AxisVector['y'],
    z: (a.x * b.y - a.y * b.x) as AxisVector['z'],
  }
}

function vectorDot(a: AxisVector, b: AxisVector) {
  return a.x * b.x + a.y * b.y + a.z * b.z
}

function axisComponent(value: number): AxisVector['x'] {
  if (value > 0) return 1
  if (value < 0) return -1
  return 0
}

export function orientationRenderingBasisVectors(axes: OrientationAxes): OrientationBasisVectors {
  const basis = orientationBasisVectors(axes)
  const expectedHeight = vectorCross(basis.length, basis.width)
  if (vectorDot(expectedHeight, basis.height) < 0) {
    // Left-handed (improper) basis: negating one axis restores a proper rotation.
    // When the body height already points up (canonical upright orientations like WLH),
    // negating height would render the box upside-down — negate a horizontal axis (width)
    // instead so the box stays upright. Otherwise (height tilted/down, e.g. legacy snapshot
    // axes) negate height to bring it back up.
    if (basis.height.z > 0) {
      return {
        ...basis,
        width: {
          x: axisComponent(-basis.width.x),
          y: axisComponent(-basis.width.y),
          z: axisComponent(-basis.width.z),
        },
      }
    }
    return {
      ...basis,
      height: {
        x: axisComponent(-basis.height.x),
        y: axisComponent(-basis.height.y),
        z: axisComponent(-basis.height.z),
      },
    }
  }
  return basis
}

export function baseDimensionsFromPlaced(
  box: Pick<PlacedBox, 'length' | 'width' | 'height' | 'orientationKey'>,
): { length: number; width: number; height: number } {
  const values = {
    x: box.length,
    y: box.width,
    z: box.height,
  }
  const dimensions = { length: 0, width: 0, height: 0 }
  const [xAxis, yAxis, zAxis] = box.orientationKey.split('') as Array<'L' | 'W' | 'H'>
  const assign = (axis: 'L' | 'W' | 'H', value: number) => {
    if (axis === 'L') dimensions.length = value
    if (axis === 'W') dimensions.width = value
    if (axis === 'H') dimensions.height = value
  }
  assign(xAxis, values.x)
  assign(yAxis, values.y)
  assign(zAxis, values.z)
  return dimensions
}

export function faceLabelRotation(axes: OrientationAxes, view: OrientationView): LabelRotationDeg {
  if (view === 'top') {
    return TOP_ROTATION_BY_AXIS[axes.y] ?? 0
  }
  if (view === 'front') {
    return 0
  }
  return SIDE_ROTATION_BY_AXIS[axes.z] ?? SIDE_ROTATION_BY_AXIS[axes.y] ?? 0
}
