/**
 * Rendering helpers for ContainerScene.
 *
 * Contains all pure / cache-based functions that build Three.js materials,
 * textures, geometries, and apply visual state to mesh entries.  None of
 * these functions touch React lifecycle; they are safe to unit-test without
 * a DOM environment that has WebGL (the Three.js geometry/math subset used
 * here works in happy-dom).
 *
 * Extracted from ContainerScene.tsx in Phase 5 Step 1.
 */

import * as THREE from 'three'
import type { PlacedBox } from '../../types'
import type { BoxLabelMode } from '../../lib/labelDeconfliction'
import { baseDimensionsFromPlaced, orientationAxesOf, orientationRenderingBasisVectors } from '../../lib/orientationTransform'
import { allLabelFaces, type LocalBoxFace } from '../../lib/cameraFacingLabels'
import { faceLabelContent, faceLabelContentSignature, faceLabelLayout, type FaceLabelContent, type FaceLabelIcon } from '../../lib/faceLabelContent'
import type { Point3D } from '../../lib/measurement'
import { boxVisualState } from '../../lib/boxVisualState'
export type SceneViewMode = 'iso' | 'top' | 'front' | 'side'

// Re-export so that ContainerScene.tsx (and tests) can import from here once
// the migration is complete.

// ---------------------------------------------------------------------------
// Internal types shared between rendering helpers
// ---------------------------------------------------------------------------

export type MeshEntry = {
  box: PlacedBox
  mesh: THREE.Mesh
  edges: THREE.LineSegments
  labelFaces: LocalBoxFace[]
  animFrom?: THREE.Quaternion
  animTo?: THREE.Quaternion
  animStart?: number
}

// SceneState is only forward-declared here (the canonical definition stays in
// ContainerScene.tsx because it references OrbitControls and RotationGizmo
// which would create a circular dependency if moved).  rendering.ts only
// needs the cache WeakMap keys, so we use a minimal structural interface.
export interface SceneStateForRendering {
  renderer: { domElement: HTMLCanvasElement }
  meshEntries: Map<string, MeshEntry>
}

// ---------------------------------------------------------------------------
// Module-level WeakMap caches keyed on the full SceneState object.
// We keep the caches here (co-located with the functions that use them) so
// they can be cleared by the ContainerScene cleanup function.
// ---------------------------------------------------------------------------

const textureCache = new WeakMap<object, Map<string, THREE.Texture>>()
const materialCache = new WeakMap<object, Map<string, THREE.Material | THREE.Material[]>>()

export const FACE_MATERIAL_ORDER: LocalBoxFace[] = ['+X', '-X', '+Y', '-Y', '+Z', '-Z']
export const ALL_LABEL_FACES = new Set<LocalBoxFace>(allLabelFaces())

export function getTextureCache(state: object) {
  let cache = textureCache.get(state)
  if (!cache) {
    cache = new Map()
    textureCache.set(state, cache)
  }
  return cache
}

export function getMaterialCache(state: object) {
  let cache = materialCache.get(state)
  if (!cache) {
    cache = new Map()
    materialCache.set(state, cache)
  }
  return cache
}

// ---------------------------------------------------------------------------
// Canvas label drawing helpers
// ---------------------------------------------------------------------------

export function fitText(context: CanvasRenderingContext2D, text: string, maxWidth: number) {
  if (context.measureText(text).width <= maxWidth) return text
  let next = text
  while (next.length > 1 && context.measureText(`${next}...`).width > maxWidth) {
    next = next.slice(0, -1)
  }
  return `${next}...`
}

function drawRotateIcon(context: CanvasRenderingContext2D, x: number, y: number, disabled: boolean) {
  context.save()
  context.strokeStyle = '#0f172a'
  context.fillStyle = '#0f172a'
  context.lineWidth = 5
  context.beginPath()
  context.arc(x, y, 20, Math.PI * 0.2, Math.PI * 1.55)
  context.stroke()
  context.beginPath()
  context.moveTo(x - 4, y - 24)
  context.lineTo(x + 14, y - 24)
  context.lineTo(x + 6, y - 8)
  context.closePath()
  context.fill()
  if (disabled) {
    context.strokeStyle = '#b91c1c'
    context.lineWidth = 7
    context.beginPath()
    context.moveTo(x - 24, y + 24)
    context.lineTo(x + 24, y - 24)
    context.stroke()
  }
  context.restore()
}

function drawStackIcon(context: CanvasRenderingContext2D, x: number, y: number, disabled: boolean, layersText: string) {
  context.save()
  context.strokeStyle = '#0f172a'
  context.fillStyle = 'rgba(255,255,255,0.72)'
  context.lineWidth = 4
  for (const offset of [-12, 4]) {
    context.beginPath()
    context.roundRect(x - 21, y + offset, 42, 16, 4)
    context.fill()
    context.stroke()
  }
  if (layersText) {
    context.fillStyle = '#0f172a'
    context.font = 'bold 18px Verdana, sans-serif'
    context.textAlign = 'center'
    context.textBaseline = 'middle'
    context.fillText(layersText, x + 25, y - 15, 28)
  }
  if (disabled) {
    context.strokeStyle = '#b91c1c'
    context.lineWidth = 7
    context.beginPath()
    context.moveTo(x - 25, y + 25)
    context.lineTo(x + 25, y - 25)
    context.stroke()
  }
  context.restore()
}

function drawFaceIcon(context: CanvasRenderingContext2D, icon: FaceLabelIcon, x: number, y: number, layersText: string) {
  if (icon === 'rotate' || icon === 'no-rotate') {
    drawRotateIcon(context, x, y, icon === 'no-rotate')
    return
  }
  drawStackIcon(context, x, y, icon === 'no-stack', icon === 'stack' ? layersText : '')
}

export function makeFaceLabelTexture(content: FaceLabelContent, color: string, selected: boolean, labelMode: BoxLabelMode) {
  const canvas = document.createElement('canvas')
  canvas.width = 256
  canvas.height = 256
  const context = canvas.getContext('2d')
  if (!context) {
    return new THREE.CanvasTexture(canvas)
  }
  context.fillStyle = color
  context.fillRect(0, 0, canvas.width, canvas.height)

  const compact = labelMode === 'compact'
  const layout = faceLabelLayout(content, compact ? 'compact' : 'full')
  const badgeSize = layout.badgeBand.right - layout.badgeBand.left
  const badgeX = layout.badgeBand.left
  const badgeY = layout.badgeBand.top
  context.fillStyle = selected ? 'rgba(243, 178, 26, 0.92)' : compact ? 'rgba(255, 255, 255, 0.58)' : 'rgba(255, 255, 255, 0.86)'
  context.strokeStyle = selected ? '#f3b21a' : compact ? 'rgba(15, 23, 42, 0.55)' : '#222222'
  context.lineWidth = selected ? 14 : compact ? 6 : 10
  context.beginPath()
  context.roundRect(badgeX, badgeY, badgeSize, badgeSize, compact ? 14 : 22)
  context.fill()
  context.stroke()
  context.fillStyle = '#222222'
  context.font = `bold ${layout.badgeFontPx}px Verdana, sans-serif`
  context.textAlign = 'center'
  context.textBaseline = 'middle'
  context.translate(badgeX + badgeSize / 2, badgeY + badgeSize / 2 + (compact ? 3 : 0))
  context.fillText(content.badge, 0, 0, badgeSize - 18)
  context.setTransform(1, 0, 0, 1, 0, 0)

  if (!compact) {
    context.fillStyle = '#0f172a'
    context.font = `bold ${layout.nameFontPx}px Verdana, sans-serif`
    context.textAlign = 'center'
    context.textBaseline = 'middle'
    const nameWidth = layout.nameBand.right - layout.nameBand.left
    const nameY = (layout.nameBand.top + layout.nameBand.bottom) / 2
    context.fillText(fitText(context, content.name, nameWidth), 128, nameY, nameWidth)
    context.font = `bold ${layout.weightFontPx}px Verdana, sans-serif`
    const weightWidth = layout.weightBand.right - layout.weightBand.left
    const weightY = (layout.weightBand.top + layout.weightBand.bottom) / 2
    context.fillText(fitText(context, content.weightDimText, weightWidth), 128, weightY, weightWidth)
    const iconY = (layout.iconBand.top + layout.iconBand.bottom) / 2
    drawFaceIcon(context, content.icons[0], 88, iconY, content.stackLayersText)
    drawFaceIcon(context, content.icons[1], 168, iconY, content.stackLayersText)
  } else {
    const importantIcon = content.icons.includes('no-rotate')
      ? 'no-rotate'
      : content.icons.includes('no-stack')
        ? 'no-stack'
        : content.icons[1]
    drawFaceIcon(
      context,
      importantIcon,
      (layout.iconBand.left + layout.iconBand.right) / 2,
      (layout.iconBand.top + layout.iconBand.bottom) / 2,
      content.stackLayersText,
    )
  }

  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  return texture
}

// ---------------------------------------------------------------------------
// Material construction and caching
// ---------------------------------------------------------------------------

export function makeBoxMaterial(texture: THREE.Texture | null, color: string, selected: boolean, opacity: number, invalid: boolean) {
  const isOpaque = opacity >= 0.99
  const emissive = invalid
    ? new THREE.Color(0x5a1212)
    : selected
      ? new THREE.Color(0x332100)
      : new THREE.Color(0x000000)
  return new THREE.MeshStandardMaterial({
    map: texture,
    color,
    roughness: 0.58,
    metalness: 0.04,
    emissive,
    transparent: !isOpaque,
    opacity,
    depthWrite: isOpaque,
    side: isOpaque ? THREE.DoubleSide : THREE.FrontSide,
  })
}

export function getCachedFaceMaterial(
  state: object,
  box: PlacedBox,
  selected: boolean,
  opacity: number,
  invalid: boolean,
  labelMode: BoxLabelMode,
) {
  const tCache = getTextureCache(state)
  const mCache = getMaterialCache(state)
  const content = faceLabelContent(box)
  const textureKey = `${box.label}:${box.color}:${selected}:${labelMode}:${faceLabelContentSignature(box)}`
  let texture = tCache.get(textureKey)
  if (!texture) {
    texture = makeFaceLabelTexture(content, box.color, selected, labelMode)
    tCache.set(textureKey, texture)
  }

  const materialKey = `${textureKey}:${opacity}:${invalid ? 'inv' : 'ok'}`
  const cached = mCache.get(materialKey)
  if (cached) {
    return cached as THREE.Material
  }

  const material = makeBoxMaterial(texture, '#ffffff', selected, opacity, invalid)
  mCache.set(materialKey, material)
  return material
}

export function getCachedPlainFaceMaterial(
  state: object,
  box: PlacedBox,
  selected: boolean,
  opacity: number,
  invalid: boolean,
) {
  const mCache = getMaterialCache(state)
  const materialKey = ['plainFace', box.color, selected, opacity, invalid ? 'inv' : 'ok'].join(':')
  const cached = mCache.get(materialKey)
  if (cached && !Array.isArray(cached)) {
    return cached
  }

  const material = makeBoxMaterial(null, box.color, selected, opacity, invalid)
  mCache.set(materialKey, material)
  return material
}

export function getCachedBoxMaterials(
  state: object,
  box: PlacedBox,
  selected: boolean,
  opacity: number,
  invalid: boolean,
  labelMode: BoxLabelMode,
) {
  const mCache = getMaterialCache(state)
  const materialKey = [
    'boxFaces',
    box.label,
    box.color,
    selected,
    opacity,
    invalid ? 'inv' : 'ok',
    labelMode,
    faceLabelContentSignature(box),
    allLabelFaces().join(','),
  ].join(':')
  const cached = mCache.get(materialKey)
  if (Array.isArray(cached)) {
    return cached
  }
  // BoxGeometry material order: +X, -X, +Y, -Y, +Z, -Z.
  const labelMaterial = getCachedFaceMaterial(state, box, selected, opacity, invalid, labelMode)
  const plainMaterial = getCachedPlainFaceMaterial(state, box, selected, opacity, invalid)
  const materials = FACE_MATERIAL_ORDER.map((face) => ALL_LABEL_FACES.has(face) ? labelMaterial : plainMaterial)
  mCache.set(materialKey, materials)
  return materials
}

// ---------------------------------------------------------------------------
// Scene attribute sync
// ---------------------------------------------------------------------------

export function syncLabelFaceSampleAttribute(state: SceneStateForRendering) {
  const mount = state.renderer.domElement.parentElement
  if (!mount) return
  const firstEntry = [...state.meshEntries.values()][0]
  ;(mount as HTMLElement & { dataset: DOMStringMap }).dataset.labelFacesSample = firstEntry?.labelFaces.join(',') ?? ''
  ;(mount as HTMLElement & { dataset: DOMStringMap }).dataset.faceIconsSample = firstEntry ? faceLabelContent(firstEntry.box).icons.join(',') : ''
}

export function applyBoxVisualState(
  state: object,
  entry: MeshEntry,
  activeLayerId: string,
  activeLabelId: string,
  selectedBoxId: string | null | undefined,
  highlightBoxIds: Set<string> | undefined,
  invalid: boolean,
  opacityOverride?: number | null,
  labelMode: BoxLabelMode = 'full',
) {
  const visual = boxVisualState(entry.box, activeLayerId, activeLabelId, selectedBoxId, highlightBoxIds, invalid)
  const opacity = opacityOverride === null || opacityOverride === undefined
    ? visual.opacity
    : Math.min(1, Math.max(0.45, visual.selected ? Math.max(opacityOverride, 0.75) : opacityOverride))
  entry.labelFaces = allLabelFaces()
  entry.mesh.material = getCachedBoxMaterials(state, entry.box, visual.selected, opacity, visual.invalid, labelMode)
  const material = entry.edges.material
  if (material instanceof THREE.LineBasicMaterial) {
    material.color.setHex(visual.edgeColor)
    material.opacity = visual.edgeOpacity
    material.transparent = visual.edgeOpacity < 1
    material.needsUpdate = true
  }
}

// ---------------------------------------------------------------------------
// Coordinate transform helpers
// ---------------------------------------------------------------------------

export function worldCenterForBox(box: PlacedBox, scale: number, length: number, width: number) {
  return new THREE.Vector3(
    -length / 2 + (box.x + box.length / 2) * scale,
    (box.z + box.height / 2) * scale,
    -width / 2 + (box.y + box.width / 2) * scale,
  )
}

export function worldPointFromMm(point: Point3D, scale: number, length: number, width: number) {
  return new THREE.Vector3(
    -length / 2 + point.x * scale,
    point.z * scale,
    -width / 2 + point.y * scale,
  )
}

export function boxOrientationQuaternion(box: PlacedBox) {
  const basis = orientationRenderingBasisVectors(orientationAxesOf(box))
  const matrix = new THREE.Matrix4().makeBasis(
    new THREE.Vector3(basis.length.x, basis.length.z, basis.length.y),
    new THREE.Vector3(basis.height.x, basis.height.z, basis.height.y),
    new THREE.Vector3(basis.width.x, basis.width.z, basis.width.y),
  )
  return new THREE.Quaternion().setFromRotationMatrix(matrix)
}

export function boxGeometryForPlaced(box: PlacedBox, scale: number) {
  const base = baseDimensionsFromPlaced(box)
  return new THREE.BoxGeometry(base.length * scale, base.height * scale, base.width * scale)
}

export function sameBoxGeometry(box: PlacedBox, geometry: THREE.BufferGeometry, scale: number) {
  if (!(geometry instanceof THREE.BoxGeometry)) return false
  const base = baseDimensionsFromPlaced(box)
  const parameters = geometry.parameters
  return parameters.width === base.length * scale
    && parameters.height === base.height * scale
    && parameters.depth === base.width * scale
}

export function applyBoxTransform(entry: Pick<MeshEntry, 'box' | 'mesh' | 'edges'>, scale: number, length: number, width: number) {
  const center = worldCenterForBox(entry.box, scale, length, width)
  const quaternion = boxOrientationQuaternion(entry.box)
  entry.mesh.position.copy(center)
  entry.mesh.quaternion.copy(quaternion)
  entry.edges.position.copy(center)
  entry.edges.quaternion.copy(quaternion)
}

// ---------------------------------------------------------------------------
// Camera and collision helpers
// ---------------------------------------------------------------------------

export function cameraPositionForMode(mode: SceneViewMode, length: number, width: number, height: number) {
  const distance = Math.max(length, width, height) * 1.25
  if (mode === 'top') {
    return new THREE.Vector3(0, distance, 0.01)
  }
  if (mode === 'front') {
    return new THREE.Vector3(0, height * 0.55, distance)
  }
  if (mode === 'side') {
    return new THREE.Vector3(distance, height * 0.55, 0)
  }
  return new THREE.Vector3(distance * 0.72, distance * 0.48, distance * 0.82)
}

export function rectsOverlap(
  ax: number, ay: number, al: number, aw: number,
  bx: number, by: number, bl: number, bw: number,
  epsilon = 0.01,
) {
  return (
    ax + al > bx + epsilon &&
    bx + bl > ax + epsilon &&
    ay + aw > by + epsilon &&
    by + bw > ay + epsilon
  )
}

export function isOutOfBounds(x: number, y: number, l: number, w: number, container: { length: number; width: number }, epsilon = 0.01) {
  return x < -epsilon || y < -epsilon || x + l > container.length + epsilon || y + w > container.width + epsilon
}

export function overlapAreaXY(
  ax: number, ay: number, al: number, aw: number,
  bx: number, by: number, bl: number, bw: number,
) {
  const xOverlap = Math.max(0, Math.min(ax + al, bx + bl) - Math.max(ax, bx))
  const yOverlap = Math.max(0, Math.min(ay + aw, by + bw) - Math.max(ay, by))
  return xOverlap * yOverlap
}

// ---------------------------------------------------------------------------
// Cache cleanup
// ---------------------------------------------------------------------------

/** Dispose and clear all Three.js textures and materials cached for `state`. */
export function disposeSceneCaches(state: object) {
  const tCache = textureCache.get(state)
  if (tCache) {
    tCache.forEach((tex: THREE.Texture) => tex.dispose())
    tCache.clear()
  }
  const mCache = materialCache.get(state)
  if (mCache) {
    const disposed = new Set<THREE.Material>()
    mCache.forEach((mat: THREE.Material | THREE.Material[]) => {
      const materials = Array.isArray(mat) ? mat : [mat]
      for (const material of materials) {
        if (disposed.has(material)) continue
        material.dispose()
        disposed.add(material)
      }
    })
    mCache.clear()
  }
}
