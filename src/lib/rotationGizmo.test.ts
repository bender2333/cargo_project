import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { buildRotationGizmo, rotationGizmoAnchorOffsetY, rotationGizmoRadius } from './rotationGizmo'

describe('rotationGizmoRadius', () => {
  it('places the handle outside the selected cargo footprint', () => {
    const radius = rotationGizmoRadius({ length: 1200, width: 800, height: 600 }, 0.002)

    expect(radius).toBeGreaterThan((1200 * 0.002) / 2)
    expect(radius).toBeCloseTo(1.4)
  })
})

describe('buildRotationGizmo', () => {
  it('builds four pickable arc handles for yaw and pitch directions', () => {
    const gizmo = buildRotationGizmo({ length: 1200, width: 800, height: 600 }, 0.002)

    expect(gizmo.handles.map((handle) => handle.direction).sort()).toEqual(['down', 'left', 'right', 'up'])
    expect(gizmo.pickables.length).toBe(8)
    expect(gizmo.group.children.length).toBe(8)
    expect(gizmo.pickables.every((mesh) => mesh.userData.rotationGizmo === true)).toBe(true)
  })

  it('keeps yaw handles in the world-horizontal plane and pitch handles around the world X axis', () => {
    const gizmo = buildRotationGizmo({ length: 1200, width: 800, height: 600 }, 0.002)
    const right = gizmo.handles.find((handle) => handle.direction === 'right')
    const up = gizmo.handles.find((handle) => handle.direction === 'up')

    expect(right?.axis).toBe('y')
    expect(up?.axis).toBe('x')
    expect(right?.samplePoints.every((point) => Math.abs(point.y) < 0.0001)).toBe(true)
    expect(up?.samplePoints.every((point) => Math.abs(point.x) < 0.0001)).toBe(true)
  })

  it('uses emissive materials so hover can highlight a whole handle direction', () => {
    const gizmo = buildRotationGizmo({ length: 1200, width: 800, height: 600 }, 0.002)
    const right = gizmo.handles.find((handle) => handle.direction === 'right')

    expect(right?.materials.length).toBe(2)
    for (const material of right?.materials ?? []) {
      expect(material).toBeInstanceOf(THREE.MeshStandardMaterial)
      expect(material.emissive.getHex()).toBe(0x000000)
    }
  })

  it('renders handles above scene geometry instead of being depth-hidden by cargo or floor', () => {
    const gizmo = buildRotationGizmo({ length: 1200, width: 800, height: 600 }, 0.002)

    expect(gizmo.group.renderOrder).toBeGreaterThan(0)
    for (const mesh of gizmo.pickables) {
      expect(mesh.renderOrder).toBeGreaterThan(0)
      expect(mesh.material).toBeInstanceOf(THREE.MeshStandardMaterial)
      const material = mesh.material as THREE.MeshStandardMaterial
      expect(material.depthTest).toBe(false)
      expect(material.depthWrite).toBe(false)
    }
  })

  it('anchors the gizmo above the selected cargo top so lower arcs do not sit on the floor', () => {
    const scale = 0.002
    const radius = rotationGizmoRadius({ length: 1200, width: 800, height: 600 }, scale)
    const offsetY = rotationGizmoAnchorOffsetY({ height: 600 }, scale, radius)

    expect(offsetY).toBeGreaterThan((600 * scale) / 2)
    expect(offsetY - radius).toBeGreaterThanOrEqual(0)
  })
})
