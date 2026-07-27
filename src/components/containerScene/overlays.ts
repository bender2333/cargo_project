/**
 * 3D overlay helpers for ContainerScene.
 *
 * Owns the clearance annotation group (dimension lines + sprite labels) and the
 * hover highlight wireframe.  These operate on the live Three.js scene through a
 * structural slice of SceneState, so they stay decoupled from the React shell
 * and from ContainerScene's OrbitControls / RotationGizmo dependencies.
 *
 * Extracted from ContainerScene.tsx in Phase 5 Step 2.
 */

import * as THREE from 'three'
import type { PlacedBox } from '../../types'
import type { ClearanceAnnotation, Point3D } from '../../lib/measurement'
import {
  worldPointFromMm,
  worldCenterForBox,
  boxOrientationQuaternion,
  boxGeometryForPlaced,
  type MeshEntry,
} from './rendering'

export const HOVER_HIGHLIGHT_COLOR = 0xf59e0b

/**
 * Structural slice of SceneState consumed by the overlay helpers.  Declaring it
 * here (instead of importing SceneState) keeps overlays.ts free of the
 * OrbitControls / RotationGizmo imports that live in ContainerScene.tsx.
 */
export interface SceneStateForOverlays {
  scene: THREE.Scene
  meshEntries: Map<string, MeshEntry>
  measurementGroup: THREE.Group | null
  clearanceLineCounts: string
  hoverHighlight: THREE.LineSegments | null
  scale: number
  length: number
  width: number
}

// ---------------------------------------------------------------------------
// Clearance annotations
// ---------------------------------------------------------------------------

/** Remove the clearance group from the scene and dispose every child resource. */
export function clearMeasurementGroup(state: SceneStateForOverlays) {
  if (!state.measurementGroup) return
  state.scene.remove(state.measurementGroup)
  state.measurementGroup.traverse((obj) => {
    if (obj instanceof THREE.Line || obj instanceof THREE.Mesh) {
      obj.geometry.dispose()
      if (Array.isArray(obj.material)) obj.material.forEach((material) => material.dispose())
      else (obj.material as THREE.Material).dispose()
    } else if (obj instanceof THREE.Sprite) {
      obj.material.map?.dispose()
      obj.material.dispose()
    }
  })
  state.measurementGroup = null
  state.clearanceLineCounts = ''
}

export function createClearanceLabelSprite(label: string) {
  const canvas = document.createElement('canvas')
  canvas.width = 256
  canvas.height = 64
  const ctx = canvas.getContext('2d')
  if (ctx) {
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    ctx.shadowColor = 'rgba(255, 255, 255, 0.9)'
    ctx.shadowBlur = 4
    ctx.lineWidth = 3
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.85)'
    ctx.fillStyle = 'rgba(30, 64, 175, 0.88)'
    ctx.font = '600 22px Verdana, sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.strokeText(label, canvas.width / 2, canvas.height / 2, canvas.width - 12)
    ctx.fillText(label, canvas.width / 2, canvas.height / 2)
  }
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  const material = new THREE.SpriteMaterial({ map: texture, depthTest: false, depthWrite: false })
  const sprite = new THREE.Sprite(material)
  sprite.scale.set(0.72, 0.18, 1)
  sprite.renderOrder = 90
  sprite.userData.testId = 'clearance-label-3d'
  return sprite
}

/** Both endpoints (in container mm space) of the dimension line for one annotation. */
export function clearanceLinePoints(box: PlacedBox, annotation: ClearanceAnnotation): [Point3D, Point3D] {
  const cx = box.x + box.length / 2
  const cy = box.y + box.width / 2
  const cz = box.z + box.height / 2
  if (annotation.direction === 'front') return [{ x: box.x, y: cy, z: cz }, { x: box.x - annotation.value, y: cy, z: cz }]
  if (annotation.direction === 'door') return [{ x: box.x + box.length, y: cy, z: cz }, { x: box.x + box.length + annotation.value, y: cy, z: cz }]
  if (annotation.direction === 'left') return [{ x: cx, y: box.y, z: cz }, { x: cx, y: box.y - annotation.value, z: cz }]
  if (annotation.direction === 'right') return [{ x: cx, y: box.y + box.width, z: cz }, { x: cx, y: box.y + box.width + annotation.value, z: cz }]
  if (annotation.direction === 'floor') return [{ x: cx, y: cy, z: box.z }, { x: cx, y: cy, z: box.z - annotation.value }]
  return [{ x: cx, y: cy, z: box.z + box.height }, { x: cx, y: cy, z: box.z + box.height + annotation.value }]
}

/**
 * Rebuild the clearance annotation group for `box`.
 * Returns the comma-joined per-annotation line count, which the caller mirrors
 * onto a data attribute for E2E assertions.
 */
export function syncClearanceAnnotations(
  state: SceneStateForOverlays,
  box: PlacedBox | null,
  annotations: ClearanceAnnotation[],
) {
  clearMeasurementGroup(state)
  if (!box || annotations.length === 0) return ''

  const group = new THREE.Group()
  const lineMaterial = new THREE.LineBasicMaterial({ color: 0x2563eb, linewidth: 2, depthTest: false })
  const lineCounts: number[] = []

  const addLine = (points: THREE.Vector3[], direction: ClearanceAnnotation['direction'], role: 'main' | 'extension') => {
    const geometry = new THREE.BufferGeometry().setFromPoints(points)
    const line = new THREE.Line(geometry, lineMaterial)
    line.renderOrder = 80
    line.userData.clearanceDirection = direction
    line.userData.clearanceRole = role
    line.userData.testId = role === 'main' ? 'clearance-line-3d' : 'clearance-extension-line-3d'
    group.add(line)
    return line
  }

  const extensionAxis = (fromWorld: THREE.Vector3, toWorld: THREE.Vector3) => {
    const delta = toWorld.clone().sub(fromWorld)
    const main = delta.lengthSq() > 0 ? delta.normalize() : new THREE.Vector3(1, 0, 0)
    const reference = Math.abs(main.dot(new THREE.Vector3(0, 1, 0))) > 0.85
      ? new THREE.Vector3(1, 0, 0)
      : new THREE.Vector3(0, 1, 0)
    return main.cross(reference).normalize()
  }

  for (const annotation of annotations) {
    const [from, to] = clearanceLinePoints(box, annotation)
    const fromWorld = worldPointFromMm(from, state.scale, state.length, state.width)
    const toWorld = worldPointFromMm(to, state.scale, state.length, state.width)
    const axis = extensionAxis(fromWorld, toWorld)
    const extensionLength = Math.max(0.05, Math.min(0.18, fromWorld.distanceTo(toWorld) * 0.08))
    const extension = axis.clone().multiplyScalar(extensionLength / 2)
    let count = 0
    addLine([fromWorld, toWorld], annotation.direction, 'main')
    count += 1
    addLine([fromWorld.clone().sub(extension), fromWorld.clone().add(extension)], annotation.direction, 'extension')
    count += 1
    addLine([toWorld.clone().sub(extension), toWorld.clone().add(extension)], annotation.direction, 'extension')
    count += 1
    const label = createClearanceLabelSprite(annotation.label)
    label.position.copy(fromWorld).add(toWorld).multiplyScalar(0.5).add(axis.clone().multiplyScalar(extensionLength * 1.15))
    group.add(label)
    lineCounts.push(count)
  }

  state.scene.add(group)
  state.measurementGroup = group
  state.clearanceLineCounts = lineCounts.join(',')
  return state.clearanceLineCounts
}

// ---------------------------------------------------------------------------
// Hover highlight
// ---------------------------------------------------------------------------

/** Show/move the hover wireframe onto `boxId`, or hide it when boxId is null. */
export function updateHoverHighlight(
  state: SceneStateForOverlays,
  boxId: string | null,
  scale: number,
  length: number,
  width: number,
) {
  if (!boxId) {
    if (state.hoverHighlight) {
      state.hoverHighlight.visible = false
    }
    return
  }
  const entry = state.meshEntries.get(boxId)
  if (!entry) return
  const geometry = new THREE.EdgesGeometry(
    boxGeometryForPlaced(entry.box, scale),
  )
  if (!state.hoverHighlight) {
    state.hoverHighlight = new THREE.LineSegments(
      geometry,
      new THREE.LineBasicMaterial({ color: HOVER_HIGHLIGHT_COLOR, linewidth: 2 }),
    )
    state.scene.add(state.hoverHighlight)
  } else {
    state.hoverHighlight.geometry.dispose()
    state.hoverHighlight.geometry = geometry
  }
  state.hoverHighlight.position.copy(worldCenterForBox(entry.box, scale, length, width))
  state.hoverHighlight.quaternion.copy(boxOrientationQuaternion(entry.box))
  state.hoverHighlight.visible = true
}
