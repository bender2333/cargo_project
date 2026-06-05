import * as THREE from 'three'
import type { ManualRotationDirection } from './manualPlacement'

export type RotationGizmoAxis = 'x' | 'y'

export type RotationGizmoHandle = {
  direction: ManualRotationDirection
  axis: RotationGizmoAxis
  materials: THREE.MeshStandardMaterial[]
  pickables: THREE.Mesh[]
  samplePoints: THREE.Vector3[]
}

export type RotationGizmo = {
  group: THREE.Group
  handles: RotationGizmoHandle[]
  pickables: THREE.Mesh[]
  radius: number
}

export type RotationGizmoCargoSize = {
  length: number
  width: number
  height: number
}

const GIZMO_COLOR = 0x38bdf8
const GIZMO_HOVER_COLOR = 0x7dd3fc
const GIZMO_MARGIN_WORLD = 0.2
const GIZMO_TUBE_RADIUS = 0.025
const GIZMO_ARROW_RADIUS = 0.06
const GIZMO_ARROW_LENGTH = 0.16

type HandleSpec = {
  direction: ManualRotationDirection
  axis: RotationGizmoAxis
  start: number
  end: number
}

const HANDLE_SPECS: HandleSpec[] = [
  { direction: 'right', axis: 'y', start: -Math.PI * 0.84, end: -Math.PI * 0.18 },
  { direction: 'left', axis: 'y', start: Math.PI * 0.16, end: Math.PI * 0.82 },
  { direction: 'up', axis: 'x', start: -Math.PI * 0.84, end: -Math.PI * 0.18 },
  { direction: 'down', axis: 'x', start: Math.PI * 0.16, end: Math.PI * 0.82 },
]

function pointForAxis(axis: RotationGizmoAxis, radius: number, angle: number) {
  if (axis === 'y') {
    return new THREE.Vector3(Math.cos(angle) * radius, 0, Math.sin(angle) * radius)
  }
  return new THREE.Vector3(0, Math.sin(angle) * radius, Math.cos(angle) * radius)
}

function tangentForAxis(axis: RotationGizmoAxis, angle: number, sign: 1 | -1) {
  const tangent = axis === 'y'
    ? new THREE.Vector3(-Math.sin(angle), 0, Math.cos(angle))
    : new THREE.Vector3(0, Math.cos(angle), -Math.sin(angle))
  return tangent.multiplyScalar(sign).normalize()
}

function material(color = GIZMO_COLOR) {
  return new THREE.MeshStandardMaterial({
    color,
    emissive: 0x000000,
    roughness: 0.42,
    metalness: 0.08,
    transparent: true,
    opacity: 0.96,
  })
}

function orientConeAlong(cone: THREE.Mesh, direction: THREE.Vector3) {
  cone.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.clone().normalize())
}

export function rotationGizmoRadius(size: RotationGizmoCargoSize, scale: number) {
  return Math.max(size.length, size.width, size.height) * scale * 0.5 + GIZMO_MARGIN_WORLD
}

export function setRotationGizmoHandleHovered(handle: RotationGizmoHandle, hovered: boolean) {
  for (const mat of handle.materials) {
    mat.color.setHex(hovered ? GIZMO_HOVER_COLOR : GIZMO_COLOR)
    mat.emissive.setHex(hovered ? 0x0ea5e9 : 0x000000)
    mat.needsUpdate = true
  }
}

export function disposeRotationGizmo(gizmo: RotationGizmo) {
  gizmo.group.traverse((object) => {
    if (object instanceof THREE.Mesh) {
      object.geometry.dispose()
      if (Array.isArray(object.material)) {
        object.material.forEach((mat) => mat.dispose())
      } else {
        object.material.dispose()
      }
    }
  })
}

export function buildRotationGizmo(size: RotationGizmoCargoSize, scale: number): RotationGizmo {
  const group = new THREE.Group()
  const radius = rotationGizmoRadius(size, scale)
  const tubeRadius = Math.max(GIZMO_TUBE_RADIUS, radius * 0.018)
  const arrowRadius = Math.max(GIZMO_ARROW_RADIUS, radius * 0.043)
  const arrowLength = Math.max(GIZMO_ARROW_LENGTH, radius * 0.12)
  const handles: RotationGizmoHandle[] = []
  const pickables: THREE.Mesh[] = []

  for (const spec of HANDLE_SPECS) {
    const samplePoints = Array.from({ length: 24 }, (_, index) => {
      const t = index / 23
      const angle = spec.start + (spec.end - spec.start) * t
      return pointForAxis(spec.axis, radius, angle)
    })
    const curve = new THREE.CatmullRomCurve3(samplePoints)
    const arcMaterial = material()
    const arrowMaterial = material()
    const arc = new THREE.Mesh(
      new THREE.TubeGeometry(curve, 32, tubeRadius, 10, false),
      arcMaterial,
    )
    const end = samplePoints[samplePoints.length - 1]
    const tangentSign: 1 | -1 = spec.end >= spec.start ? 1 : -1
    const cone = new THREE.Mesh(
      new THREE.ConeGeometry(arrowRadius, arrowLength, 18),
      arrowMaterial,
    )
    cone.position.copy(end)
    orientConeAlong(cone, tangentForAxis(spec.axis, spec.end, tangentSign))

    for (const mesh of [arc, cone]) {
      mesh.userData.rotationGizmo = true
      mesh.userData.direction = spec.direction
      group.add(mesh)
      pickables.push(mesh)
    }

    handles.push({
      direction: spec.direction,
      axis: spec.axis,
      materials: [arcMaterial, arrowMaterial],
      pickables: [arc, cone],
      samplePoints,
    })
  }

  return {
    group,
    handles,
    pickables,
    radius,
  }
}
