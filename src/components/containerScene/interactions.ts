/**
 * Interaction helpers for ContainerScene.
 *
 * Owns the rotation gizmo lifecycle, the drag ghost, and the box rotation
 * animation loop.  Like rendering.ts and overlays.ts these functions receive a
 * structural slice of SceneState so the module stays independent of the React
 * shell in ContainerScene.tsx.
 *
 * The pointer/keyboard/drag event handlers themselves remain closures inside
 * ContainerScene's initialisation effect — they capture ~20 refs and splitting
 * them out would trade one coupling for a wider one.  They call into this
 * module for every stateful gizmo/ghost operation.
 *
 * Extracted from ContainerScene.tsx in Phase 5 Step 3.
 */

import * as THREE from 'three'
import type { PlacedBox } from '../../types'
import type { ManualRotationDirection } from '../../lib/manualPlacement'
import { orientationAxesOf } from '../../lib/orientationTransform'
import {
  buildRotationGizmo,
  disposeRotationGizmo,
  rotationGizmoAnchorOffsetY,
  setRotationGizmoHandleHovered,
  type RotationGizmo,
} from '../../lib/rotationGizmo'
import {
  worldCenterForBox,
  boxOrientationQuaternion,
  boxGeometryForPlaced,
  sameBoxGeometry,
  type MeshEntry,
} from './rendering'

export const GHOST_VALID_COLOR = 0x22c55e
export const GHOST_INVALID_COLOR = 0xef4444
export const ROTATION_ANIMATION_MS = 200

/**
 * Structural slice of SceneState consumed by the interaction helpers.
 * Declared locally so interactions.ts does not need to import the full
 * SceneState (which references OrbitControls and lives in ContainerScene.tsx).
 */
export interface SceneStateForInteractions {
  scene: THREE.Scene
  meshEntries: Map<string, MeshEntry>
  ghost: { mesh: THREE.Mesh; edges: THREE.LineSegments } | null
  rotationGizmo: RotationGizmo | null
  rotationGizmoBoxSignature: string | null
  rotationGizmoHovered: ManualRotationDirection | null
  rotationGizmoVisible: boolean
  scale: number
  length: number
  width: number
}

// ---------------------------------------------------------------------------
// Orientation signatures (used for data attributes and change detection)
// ---------------------------------------------------------------------------

/** `X:.. Y:.. Z:..` string mirrored onto a data attribute for E2E assertions. */
export function selectedAxesAttribute(box: PlacedBox | null) {
  if (!box) return ''
  const axes = orientationAxesOf(box)
  return `X:${axes.x} Y:${axes.y} Z:${axes.z}`
}

/** Changes whenever a box's rendered orientation changes — triggers slerp animation. */
export function orientationAnimationSignature(box: PlacedBox) {
  return `${box.orientationKey}:${selectedAxesAttribute(box)}`
}

/** Changes only when the gizmo needs rebuilding for different box dimensions. */
export function rotationGizmoSignature(box: PlacedBox) {
  return `${box.length}:${box.width}:${box.height}`
}

// ---------------------------------------------------------------------------
// Rotation gizmo
// ---------------------------------------------------------------------------

/** Reuse the existing gizmo when box dimensions are unchanged, otherwise rebuild. */
export function ensureRotationGizmo(state: SceneStateForInteractions, box: PlacedBox) {
  const signature = rotationGizmoSignature(box)
  if (state.rotationGizmo && state.rotationGizmoBoxSignature === signature) {
    return state.rotationGizmo
  }
  if (state.rotationGizmo) {
    state.scene.remove(state.rotationGizmo.group)
    disposeRotationGizmo(state.rotationGizmo)
  }
  const gizmo = buildRotationGizmo(
    { length: box.length, width: box.width, height: box.height },
    state.scale,
  )
  gizmo.group.visible = false
  state.scene.add(gizmo.group)
  state.rotationGizmo = gizmo
  state.rotationGizmoBoxSignature = signature
  state.rotationGizmoHovered = null
  return gizmo
}

/** Position and show the gizmo on `boxId`, or hide it when unavailable. */
export function syncRotationGizmo(state: SceneStateForInteractions, boxId: string | null) {
  const entry = boxId ? state.meshEntries.get(boxId) : null
  if (!state.rotationGizmoVisible || !entry) {
    if (state.rotationGizmo) state.rotationGizmo.group.visible = false
    return
  }
  if (entry.box.canRotate === false) {
    if (state.rotationGizmo) state.rotationGizmo.group.visible = false
    return
  }
  const gizmo = ensureRotationGizmo(state, entry.box)
  const center = worldCenterForBox(entry.box, state.scale, state.length, state.width)
  center.y = entry.box.z * state.scale + rotationGizmoAnchorOffsetY(entry.box, state.scale, gizmo.radius)
  gizmo.group.position.copy(center)
  gizmo.group.rotation.set(0, 0, 0)
  gizmo.group.visible = true
}

export function setRotationGizmoHover(state: SceneStateForInteractions, direction: ManualRotationDirection | null) {
  if (state.rotationGizmoHovered === direction) return
  state.rotationGizmoHovered = direction
  if (!state.rotationGizmo) return
  for (const handle of state.rotationGizmo.handles) {
    setRotationGizmoHandleHovered(handle, handle.direction === direction)
  }
}

/** Raycast against the gizmo handles; returns the hit rotation direction or null. */
export function hitRotationGizmo(
  state: SceneStateForInteractions,
  raycaster: THREE.Raycaster,
): ManualRotationDirection | null {
  if (!state.rotationGizmoVisible || !state.rotationGizmo) return null
  const hit = raycaster.intersectObjects(state.rotationGizmo.pickables, false)[0]
  const direction = hit?.object.userData.direction
  if (direction === 'left' || direction === 'right' || direction === 'up' || direction === 'down') {
    return direction
  }
  return null
}

// ---------------------------------------------------------------------------
// Rotation animation
// ---------------------------------------------------------------------------

/** Advance every in-flight slerp rotation by one frame (cubic ease-out). */
export function advanceBoxAnimations(state: SceneStateForInteractions, now: number) {
  for (const entry of state.meshEntries.values()) {
    if (!entry.animFrom || !entry.animTo || entry.animStart === undefined) continue
    const progress = Math.min(1, (now - entry.animStart) / ROTATION_ANIMATION_MS)
    const eased = 1 - Math.pow(1 - progress, 3)
    const next = entry.animFrom.clone().slerp(entry.animTo, eased)
    entry.mesh.quaternion.copy(next)
    entry.edges.quaternion.copy(next)
    if (progress >= 1) {
      entry.mesh.quaternion.copy(entry.animTo)
      entry.edges.quaternion.copy(entry.animTo)
      entry.animFrom = undefined
      entry.animTo = undefined
      entry.animStart = undefined
    }
  }
}

// ---------------------------------------------------------------------------
// Drag ghost
// ---------------------------------------------------------------------------

/** Create the ghost mesh on first use, or resize its geometry to match `box`. */
export function ensureGhost(
  state: SceneStateForInteractions,
  box: PlacedBox,
  scale: number,
  length: number,
  width: number,
) {
  if (!state.ghost) {
    const geometry = boxGeometryForPlaced(box, scale)
    const material = new THREE.MeshBasicMaterial({
      color: GHOST_VALID_COLOR,
      transparent: true,
      opacity: 0.18,
      depthWrite: false,
    })
    const mesh = new THREE.Mesh(geometry, material)
    const edges = new THREE.LineSegments(
      new THREE.EdgesGeometry(geometry),
      new THREE.LineBasicMaterial({ color: GHOST_VALID_COLOR }),
    )
    state.scene.add(mesh)
    state.scene.add(edges)
    state.ghost = { mesh, edges }
  } else {
    if (!sameBoxGeometry(box, state.ghost.mesh.geometry, scale)) {
      state.ghost.mesh.geometry.dispose()
      state.ghost.edges.geometry.dispose()
      const geometry = boxGeometryForPlaced(box, scale)
      state.ghost.mesh.geometry = geometry
      state.ghost.edges.geometry = new THREE.EdgesGeometry(geometry)
    }
    state.ghost.mesh.visible = true
    state.ghost.edges.visible = true
  }
  void length
  void width
}

/** Move the ghost to a candidate drop position and colour it by validity. */
export function positionGhost(
  state: SceneStateForInteractions,
  x: number,
  y: number,
  z: number,
  box: PlacedBox,
  invalid: boolean,
  scale: number,
  length: number,
  width: number,
) {
  if (!state.ghost) return
  const ghostBox = { ...box, x, y, z }
  const center = worldCenterForBox(ghostBox, scale, length, width)
  const quaternion = boxOrientationQuaternion(ghostBox)
  state.ghost.mesh.position.copy(center)
  state.ghost.mesh.quaternion.copy(quaternion)
  state.ghost.edges.position.copy(center)
  state.ghost.edges.quaternion.copy(quaternion)
  const color = invalid ? GHOST_INVALID_COLOR : GHOST_VALID_COLOR
  ;(state.ghost.mesh.material as THREE.MeshBasicMaterial).color.setHex(color)
  ;(state.ghost.edges.material as THREE.LineBasicMaterial).color.setHex(color)
}

/** Hide the ghost without disposing it, so the next drag can reuse it. */
export function clearGhost(state: SceneStateForInteractions) {
  if (!state.ghost) return
  state.ghost.mesh.visible = false
  state.ghost.edges.visible = false
}
