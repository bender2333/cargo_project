import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import type { ContainerSpec, PlacedBox } from '../types'
import { MIN_SUPPORT_OVERLAP_RATIO } from '../lib/manualPlacement'
import { snapToGrid } from '../lib/snap'
import { resolveDropTarget } from '../lib/sceneDrop'
import { snapToEdges } from '../lib/snapEdges'
import { applyManualPlacementSnap } from '../lib/manualPlacementSnap'
import type { CogOverlay } from '../lib/cogVisual'
import { DEFAULT_PLACEMENT_SETTINGS, type PlacementSettings } from '../lib/placementSettings'
import { manualMoveCommitArgs } from '../lib/manualMoveCommit'
import { baseDimensionsFromPlaced, orientationAxesOf, orientationBasisVectors } from '../lib/orientationTransform'

export type SceneViewMode = 'iso' | 'top' | 'front' | 'side'

export type HoverBoxInfo = {
  id: string
  label: string
  length: number
  width: number
  height: number
  orientationKey: PlacedBox['orientationKey']
  x: number
  y: number
  z: number
  clientX: number
  clientY: number
}

type ContainerSceneProps = {
  container: ContainerSpec
  boxes: PlacedBox[]
  activeLayerId: string
  activeLabelId: string
  viewMode: SceneViewMode
  gridSnap?: boolean
  edgeSnap?: boolean
  placementSettings?: PlacementSettings
  resetViewTick?: number
  selectedBoxId?: string | null
  highlightBoxIds?: Set<string>
  onSelectBox?: (boxId: string) => void
  invalidBoxIds?: Set<string>
  manualEditable?: boolean
  onManualMove?: (boxId: string, x: number, y: number, z?: number) => void
  onManualDropFromPool?: (cargoId: string, x: number, y: number, z?: number) => void
  onManualRotate?: (boxId: string, direction?: 'right' | 'down') => void
  onManualDelete?: (boxId: string) => void
  onManualOperationRejected?: (operation: 'move' | 'drop', boxId?: string, cargoId?: string) => void
  selectedManualBoxId?: string | null
  onClearSelection?: () => void
  onHoverBox?: (info: HoverBoxInfo | null) => void
  cogOverlay?: CogOverlay | null
  boxOpacityOverride?: number | null
  /** Size/color of the cargo currently being dragged from the pool — drives the dragover ghost. */
  poolDragInfo?: { cargoId: string; length: number; width: number; height: number; color: string } | null
}

type MeshEntry = {
  box: PlacedBox
  mesh: THREE.Mesh
  edges: THREE.LineSegments
}

type SceneState = {
  scene: THREE.Scene
  camera: THREE.PerspectiveCamera
  renderer: THREE.WebGLRenderer
  controls: OrbitControls
  pickables: THREE.Mesh[]
  boxByUuid: Map<string, string>
  meshEntries: Map<string, MeshEntry>
  invalidOverride: Set<string>
  hoverHighlight: THREE.LineSegments | null
  hoverBoxId: string | null
  ghost: { mesh: THREE.Mesh; edges: THREE.LineSegments } | null
  cogGroup: THREE.Group | null
  poolDrop: { x: number; y: number; z: number; invalid: boolean } | null
  scale: number
  length: number
  width: number
  height: number
}

const textureCache = new WeakMap<SceneState, Map<string, THREE.Texture>>()
const materialCache = new WeakMap<SceneState, Map<string, THREE.Material | THREE.Material[]>>()

function getTextureCache(state: SceneState) {
  let cache = textureCache.get(state)
  if (!cache) {
    cache = new Map()
    textureCache.set(state, cache)
  }
  return cache
}

function getMaterialCache(state: SceneState) {
  let cache = materialCache.get(state)
  if (!cache) {
    cache = new Map()
    materialCache.set(state, cache)
  }
  return cache
}

function makeFaceLabelTexture(label: string, color: string, selected: boolean, orientationLabel: string) {
  const canvas = document.createElement('canvas')
  canvas.width = 256
  canvas.height = 256
  const context = canvas.getContext('2d')
  if (!context) {
    return new THREE.CanvasTexture(canvas)
  }
  context.fillStyle = color
  context.fillRect(0, 0, canvas.width, canvas.height)

  context.fillStyle = selected ? 'rgba(243, 178, 26, 0.92)' : 'rgba(255, 255, 255, 0.86)'
  context.strokeStyle = selected ? '#f3b21a' : '#222222'
  context.lineWidth = selected ? 14 : 10
  context.beginPath()
  context.roundRect(42, 42, 172, 172, 22)
  context.fill()
  context.stroke()
  context.fillStyle = '#222222'
  context.font = 'bold 104px Verdana, sans-serif'
  context.textAlign = 'center'
  context.textBaseline = 'middle'
  context.translate(128, 134)
  context.fillText(label, 0, 0, 142)
  context.fillStyle = '#0f172a'
  context.font = 'bold 22px Verdana, sans-serif'
  context.textAlign = 'center'
  context.fillText(orientationLabel, 128, 222, 226)

  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  return texture
}

function makeBoxMaterial(texture: THREE.Texture, selected: boolean, opacity: number, invalid: boolean) {
  const isOpaque = opacity >= 0.99
  const emissive = invalid
    ? new THREE.Color(0x5a1212)
    : selected
      ? new THREE.Color(0x332100)
      : new THREE.Color(0x000000)
  return new THREE.MeshStandardMaterial({
    map: texture,
    roughness: 0.58,
    metalness: 0.04,
    emissive,
    transparent: !isOpaque,
    opacity,
    depthWrite: isOpaque,
    side: isOpaque ? THREE.DoubleSide : THREE.FrontSide,
  })
}

function getCachedFaceMaterial(
  state: SceneState,
  box: PlacedBox,
  selected: boolean,
  opacity: number,
  invalid: boolean,
) {
  const tCache = getTextureCache(state)
  const mCache = getMaterialCache(state)
  const orientationLabel = box.orientationLabel ?? box.orientationKey
  const textureKey = `${box.label}:${box.color}:${selected}:${orientationLabel}`
  let texture = tCache.get(textureKey)
  if (!texture) {
    texture = makeFaceLabelTexture(box.label, box.color, selected, orientationLabel)
    tCache.set(textureKey, texture)
  }

  const materialKey = `${textureKey}:${opacity}:${invalid ? 'inv' : 'ok'}`
  const cached = mCache.get(materialKey)
  if (cached) {
    return cached as THREE.Material
  }

  const material = makeBoxMaterial(texture, selected, opacity, invalid)
  mCache.set(materialKey, material)
  return material
}

function getCachedBoxMaterials(state: SceneState, box: PlacedBox, selected: boolean, opacity: number, invalid: boolean) {
  const mCache = getMaterialCache(state)
  const materialKey = [
    'boxFaces',
    box.label,
    box.color,
    selected,
    opacity,
    invalid ? 'inv' : 'ok',
    box.orientationLabel ?? box.orientationKey,
  ].join(':')
  const cached = mCache.get(materialKey)
  if (Array.isArray(cached)) {
    return cached
  }
  // BoxGeometry material order: +X, -X, +Y, -Y, +Z, -Z.
  const materials = [
    getCachedFaceMaterial(state, box, selected, opacity, invalid),
    getCachedFaceMaterial(state, box, selected, opacity, invalid),
    getCachedFaceMaterial(state, box, selected, opacity, invalid),
    getCachedFaceMaterial(state, box, selected, opacity, invalid),
    getCachedFaceMaterial(state, box, selected, opacity, invalid),
    getCachedFaceMaterial(state, box, selected, opacity, invalid),
  ]
  mCache.set(materialKey, materials)
  return materials
}

function boxVisualState(
  box: PlacedBox,
  activeLayerId: string,
  activeLabelId: string,
  selectedBoxId: string | null | undefined,
  highlightBoxIds: Set<string> | undefined,
  invalid: boolean,
) {
  const selected = box.id === selectedBoxId
  const highlighted = highlightBoxIds?.has(box.id) ?? false
  const currentLayer = activeLayerId === 'all' || String(box.physicalLayer) === activeLayerId
  const currentLabel = activeLabelId === 'all' || box.label === activeLabelId
  const active = selected || highlighted || (currentLayer && currentLabel)
  return {
    selected,
    highlighted,
    active,
    invalid,
    opacity: active ? 1 : 0.22,
    edgeColor: invalid ? 0xef4444 : selected || highlighted ? 0xf3b21a : active ? 0x252525 : 0x777777,
    edgeOpacity: invalid ? 0.95 : active ? 0.72 : 0.14,
  }
}

function applyBoxVisualState(
  state: SceneState,
  entry: MeshEntry,
  activeLayerId: string,
  activeLabelId: string,
  selectedBoxId: string | null | undefined,
  highlightBoxIds: Set<string> | undefined,
  invalid: boolean,
  opacityOverride?: number | null,
) {
  const visual = boxVisualState(entry.box, activeLayerId, activeLabelId, selectedBoxId, highlightBoxIds, invalid)
  const opacity = opacityOverride === null || opacityOverride === undefined
    ? visual.opacity
    : Math.min(1, Math.max(0.45, visual.selected ? Math.max(opacityOverride, 0.75) : opacityOverride))
  entry.mesh.material = getCachedBoxMaterials(state, entry.box, visual.selected, opacity, visual.invalid)
  const material = entry.edges.material
  if (material instanceof THREE.LineBasicMaterial) {
    material.color.setHex(visual.edgeColor)
    material.opacity = visual.edgeOpacity
    material.transparent = visual.edgeOpacity < 1
    material.needsUpdate = true
  }
}

function worldCenterForBox(box: PlacedBox, scale: number, length: number, width: number) {
  return new THREE.Vector3(
    -length / 2 + (box.x + box.length / 2) * scale,
    (box.z + box.height / 2) * scale,
    -width / 2 + (box.y + box.width / 2) * scale,
  )
}

function boxOrientationQuaternion(box: PlacedBox) {
  const basis = orientationBasisVectors(orientationAxesOf(box))
  const matrix = new THREE.Matrix4().makeBasis(
    new THREE.Vector3(basis.length.x, basis.length.z, basis.length.y),
    new THREE.Vector3(basis.height.x, basis.height.z, basis.height.y),
    new THREE.Vector3(basis.width.x, basis.width.z, basis.width.y),
  )
  return new THREE.Quaternion().setFromRotationMatrix(matrix)
}

function boxGeometryForPlaced(box: PlacedBox, scale: number) {
  const base = baseDimensionsFromPlaced(box)
  return new THREE.BoxGeometry(base.length * scale, base.height * scale, base.width * scale)
}

function sameBoxGeometry(box: PlacedBox, geometry: THREE.BufferGeometry, scale: number) {
  if (!(geometry instanceof THREE.BoxGeometry)) return false
  const base = baseDimensionsFromPlaced(box)
  const parameters = geometry.parameters
  return parameters.width === base.length * scale
    && parameters.height === base.height * scale
    && parameters.depth === base.width * scale
}

function applyBoxTransform(entry: Pick<MeshEntry, 'box' | 'mesh' | 'edges'>, scale: number, length: number, width: number) {
  const center = worldCenterForBox(entry.box, scale, length, width)
  const quaternion = boxOrientationQuaternion(entry.box)
  entry.mesh.position.copy(center)
  entry.mesh.quaternion.copy(quaternion)
  entry.edges.position.copy(center)
  entry.edges.quaternion.copy(quaternion)
}

function cameraPositionForMode(mode: SceneViewMode, length: number, width: number, height: number) {
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

function rectsOverlap(
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

function isOutOfBounds(x: number, y: number, l: number, w: number, container: { length: number; width: number }, epsilon = 0.01) {
  return x < -epsilon || y < -epsilon || x + l > container.length + epsilon || y + w > container.width + epsilon
}

function overlapAreaXY(
  ax: number, ay: number, al: number, aw: number,
  bx: number, by: number, bl: number, bw: number,
) {
  const xOverlap = Math.max(0, Math.min(ax + al, bx + bl) - Math.max(ax, bx))
  const yOverlap = Math.max(0, Math.min(ay + aw, by + bw) - Math.max(ay, by))
  return xOverlap * yOverlap
}

const GHOST_VALID_COLOR = 0x22c55e
const GHOST_INVALID_COLOR = 0xef4444
const HOVER_HIGHLIGHT_COLOR = 0xf59e0b

function ensureGhost(state: SceneState, box: PlacedBox, scale: number, length: number, width: number) {
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

function positionGhost(state: SceneState, x: number, y: number, z: number, box: PlacedBox, invalid: boolean, scale: number, length: number, width: number) {
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

function clearGhost(state: SceneState) {
  if (!state.ghost) return
  state.ghost.mesh.visible = false
  state.ghost.edges.visible = false
}

function updateHoverHighlight(state: SceneState, boxId: string | null, scale: number, length: number, width: number) {
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

export function ContainerScene({
  container,
  boxes,
  activeLayerId,
  activeLabelId,
  viewMode,
  gridSnap,
  edgeSnap,
  placementSettings,
  resetViewTick,
  selectedBoxId,
  highlightBoxIds,
  onSelectBox,
  invalidBoxIds,
  manualEditable,
  onManualMove,
  onManualDropFromPool,
  onManualRotate,
  onManualDelete,
  onManualOperationRejected,
  selectedManualBoxId,
  onClearSelection,
  onHoverBox,
  cogOverlay,
  boxOpacityOverride = null,
  poolDragInfo,
}: ContainerSceneProps) {
  const mountRef = useRef<HTMLDivElement | null>(null)
  const sceneStateRef = useRef<SceneState | null>(null)
  const invalidBoxIdsRef = useRef<Set<string>>(invalidBoxIds ?? new Set())
  const manualEditableRef = useRef<boolean>(manualEditable ?? false)
  const gridSnapRef = useRef<boolean>(gridSnap ?? true)
  const edgeSnapRef = useRef<boolean>(edgeSnap ?? true)
  const placementSettingsRef = useRef<PlacementSettings>(placementSettings ?? {
    ...DEFAULT_PLACEMENT_SETTINGS,
    gridSnapEnabled: gridSnap ?? DEFAULT_PLACEMENT_SETTINGS.gridSnapEnabled,
    edgeSnapEnabled: edgeSnap ?? DEFAULT_PLACEMENT_SETTINGS.edgeSnapEnabled,
  })
  const poolDragInfoRef = useRef<typeof poolDragInfo>(poolDragInfo ?? null)
  const onManualMoveRef = useRef<typeof onManualMove>(onManualMove)
  const onManualDropFromPoolRef = useRef<typeof onManualDropFromPool>(onManualDropFromPool)
  const onManualRotateRef = useRef<typeof onManualRotate>(onManualRotate)
  const onManualDeleteRef = useRef<typeof onManualDelete>(onManualDelete)
  const onManualOperationRejectedRef = useRef<typeof onManualOperationRejected>(onManualOperationRejected)
  const onSelectBoxRef = useRef<typeof onSelectBox>(onSelectBox)
  const onClearSelectionRef = useRef<typeof onClearSelection>(onClearSelection)
  const onHoverBoxRef = useRef<typeof onHoverBox>(onHoverBox)
  const selectedManualBoxIdRef = useRef<string | null>(selectedManualBoxId ?? null)
  const visualPropsRef = useRef({ activeLayerId, activeLabelId, selectedBoxId, highlightBoxIds, boxOpacityOverride })

  useEffect(() => {
    invalidBoxIdsRef.current = invalidBoxIds ?? new Set()
  }, [invalidBoxIds])

  useEffect(() => {
    manualEditableRef.current = manualEditable ?? false
  }, [manualEditable])

  useEffect(() => {
    gridSnapRef.current = gridSnap ?? true
  }, [gridSnap])

  useEffect(() => {
    edgeSnapRef.current = edgeSnap ?? true
  }, [edgeSnap])

  useEffect(() => {
    placementSettingsRef.current = placementSettings ?? {
      ...DEFAULT_PLACEMENT_SETTINGS,
      gridSnapEnabled: gridSnap ?? DEFAULT_PLACEMENT_SETTINGS.gridSnapEnabled,
      edgeSnapEnabled: edgeSnap ?? DEFAULT_PLACEMENT_SETTINGS.edgeSnapEnabled,
    }
    gridSnapRef.current = placementSettingsRef.current.snapEnabled && placementSettingsRef.current.gridSnapEnabled
    edgeSnapRef.current = placementSettingsRef.current.snapEnabled && placementSettingsRef.current.edgeSnapEnabled
  }, [placementSettings, gridSnap, edgeSnap])

  useEffect(() => {
    poolDragInfoRef.current = poolDragInfo ?? null
    if (!poolDragInfo && sceneStateRef.current) {
      clearGhost(sceneStateRef.current)
    }
  }, [poolDragInfo])

  useEffect(() => {
    onManualMoveRef.current = onManualMove
  }, [onManualMove])

  useEffect(() => {
    onManualDropFromPoolRef.current = onManualDropFromPool
  }, [onManualDropFromPool])

  useEffect(() => {
    onManualRotateRef.current = onManualRotate
  }, [onManualRotate])

  useEffect(() => {
    onManualDeleteRef.current = onManualDelete
  }, [onManualDelete])

  useEffect(() => {
    onManualOperationRejectedRef.current = onManualOperationRejected
  }, [onManualOperationRejected])

  useEffect(() => {
    onClearSelectionRef.current = onClearSelection
  }, [onClearSelection])

  useEffect(() => {
    onHoverBoxRef.current = onHoverBox
  }, [onHoverBox])

  useEffect(() => {
    selectedManualBoxIdRef.current = selectedManualBoxId ?? null
  }, [selectedManualBoxId])

  useEffect(() => {
    onSelectBoxRef.current = onSelectBox
  }, [onSelectBox])

  useEffect(() => {
    visualPropsRef.current = { activeLayerId, activeLabelId, selectedBoxId, highlightBoxIds, boxOpacityOverride }
  }, [activeLayerId, activeLabelId, selectedBoxId, highlightBoxIds, boxOpacityOverride])

  useEffect(() => {
    const mount = mountRef.current
    if (!mount) {
      return
    }

    const scale = 1 / 1000
    const length = container.length * scale
    const width = container.width * scale
    const height = container.height * scale
    const target = new THREE.Vector3(0, height / 2, 0)

    const scene = new THREE.Scene()
    scene.background = new THREE.Color(0xd9d9d9)

    const camera = new THREE.PerspectiveCamera(42, mount.clientWidth / mount.clientHeight, 0.1, 1000)
    camera.position.copy(cameraPositionForMode(viewMode, length, width, height))
    camera.lookAt(target)

    const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true })
    renderer.sortObjects = true
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.setSize(mount.clientWidth, mount.clientHeight)
    renderer.shadowMap.enabled = true
    mount.appendChild(renderer.domElement)

    const controls = new OrbitControls(camera, renderer.domElement)
    controls.enableDamping = true
    controls.target.copy(target)
    controls.maxDistance = 45

    const ambient = new THREE.HemisphereLight(0xffffff, 0x8d8d8d, 2.4)
    scene.add(ambient)

    const keyLight = new THREE.DirectionalLight(0xffffff, 2.1)
    keyLight.position.set(7, 10, 5)
    keyLight.castShadow = true
    scene.add(keyLight)

    const floorGeometry = new THREE.BoxGeometry(length, 0.05, width)
    const floorMaterial = new THREE.MeshStandardMaterial({ color: 0xb6b1a4, roughness: 0.85 })
    const floor = new THREE.Mesh(floorGeometry, floorMaterial)
    floor.position.set(0, -0.025, 0)
    floor.receiveShadow = true
    scene.add(floor)

    const shellGeometry = new THREE.BoxGeometry(length, height, width)
    const shellEdges = new THREE.EdgesGeometry(shellGeometry)
    const shell = new THREE.LineSegments(shellEdges, new THREE.LineBasicMaterial({ color: 0x4f4f4f }))
    shell.position.set(0, height / 2, 0)
    scene.add(shell)

    const rearWall = new THREE.Mesh(
      new THREE.BoxGeometry(0.04, height, width),
      new THREE.MeshStandardMaterial({ color: 0xf2f2ee, transparent: true, opacity: 0.28 }),
    )
    rearWall.position.set(-length / 2, height / 2, 0)
    scene.add(rearWall)

    const grid = new THREE.GridHelper(Math.max(length, width), 16, 0x8b8b8b, 0xbdbdbd)
    grid.position.y = 0.002
    scene.add(grid)

    const sceneState: SceneState = {
      scene,
      camera,
      renderer,
      controls,
      pickables: [],
      boxByUuid: new Map(),
      meshEntries: new Map(),
      invalidOverride: new Set(),
      hoverHighlight: null,
      hoverBoxId: null,
      ghost: null,
      cogGroup: null,
      poolDrop: null,
      scale,
      length,
      width,
      height,
    }
    sceneStateRef.current = sceneState

    const resize = () => {
      if (!mount.clientWidth || !mount.clientHeight) return
      camera.aspect = mount.clientWidth / mount.clientHeight
      camera.updateProjectionMatrix()
      renderer.setSize(mount.clientWidth, mount.clientHeight)
    }
    const observer = new ResizeObserver(resize)
    observer.observe(mount)

    const raycaster = new THREE.Raycaster()
    const pointer = new THREE.Vector2()
    const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0)
    const intersectionPoint = new THREE.Vector3()

    const updatePointer = (event: PointerEvent | DragEvent) => {
      const rect = renderer.domElement.getBoundingClientRect()
      pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1
      pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1
    }

    const worldToContainerMm = (worldX: number, worldZ: number) => ({
      x: (worldX + length / 2) / scale,
      y: (worldZ + width / 2) / scale,
    })

    type DragState = {
      boxId: string
      offsetXmm: number
      offsetYmm: number
      entry: MeshEntry
      wasInvalid: boolean
      mode: 'plane' | 'z'
      zStartPx: number
      zStartMm: number
    }
    let dragState: DragState | null = null
    const Z_PIXELS_PER_MM = 0.5 // 1mm = 0.5 px → 1000mm = 500px vertical drag

    const computeInvalidByGeometry = (
      boxId: string | null,
      x: number,
      y: number,
      z: number,
      l: number,
      w: number,
      h: number,
    ) => {
      const settings = placementSettingsRef.current
      if (isOutOfBounds(x, y, l, w, container)) return true
      if (z < -0.01 || z + h > container.height + 0.01) return true
      let supportedArea = z <= 0.01 ? l * w : 0
      const baseArea = l * w
      for (const other of sceneState.meshEntries.values()) {
        if (boxId && other.box.id === boxId) continue
        if (other.box.z >= z + h || z >= other.box.z + other.box.height) continue
        if (rectsOverlap(x, y, l, w, other.box.x, other.box.y, other.box.length, other.box.width)) {
          return true
        }
      }
      if (z > 0.01) {
        for (const other of sceneState.meshEntries.values()) {
          if (boxId && other.box.id === boxId) continue
          if (Math.abs(other.box.z + other.box.height - z) > 0.01) continue
          supportedArea += overlapAreaXY(x, y, l, w, other.box.x, other.box.y, other.box.length, other.box.width)
        }
      }
      const minSupportRatio = settings.supportPolicy.allowPartialOverhang
        ? settings.supportPolicy.minSupportRatio
        : MIN_SUPPORT_OVERLAP_RATIO
      if (baseArea <= 0 || supportedArea / baseArea < minSupportRatio) return true
      return false
    }

    const computeDragInvalid = (entry: MeshEntry, x: number, y: number, z: number) =>
      computeInvalidByGeometry(entry.box.id, x, y, z, entry.box.length, entry.box.width, entry.box.height)

    const refreshEntryVisual = (entry: MeshEntry) => {
      const { activeLayerId: la, activeLabelId: lb, selectedBoxId: sb, highlightBoxIds: hb, boxOpacityOverride: opacityOverride } = visualPropsRef.current
      const invalid = sceneState.invalidOverride.has(entry.box.id) || invalidBoxIdsRef.current.has(entry.box.id)
      applyBoxVisualState(sceneState, entry, la, lb, sb, hb, invalid, opacityOverride)
    }

    const onPointerDown = (event: PointerEvent) => {
      if (event.button !== 0) return
      updatePointer(event)
      raycaster.setFromCamera(pointer, camera)
      const hit = raycaster.intersectObjects(sceneState.pickables, false)[0]
      const boxId = hit ? sceneState.boxByUuid.get(hit.object.uuid) : undefined
      if (boxId) {
        onSelectBoxRef.current?.(boxId)
      }
      if (!manualEditableRef.current || !boxId) return
      const entry = sceneState.meshEntries.get(boxId)
      if (!entry) return
      raycaster.ray.intersectPlane(groundPlane, intersectionPoint)
      const containerMm = worldToContainerMm(intersectionPoint.x, intersectionPoint.z)
      dragState = {
        boxId,
        offsetXmm: containerMm.x - entry.box.x,
        offsetYmm: containerMm.y - entry.box.y,
        entry,
        wasInvalid: sceneState.invalidOverride.has(boxId) || invalidBoxIdsRef.current.has(boxId),
        mode: event.shiftKey ? 'z' : 'plane',
        zStartPx: event.clientY,
        zStartMm: entry.box.z,
      }
      ensureGhost(sceneState, entry.box, scale, length, width)
      controls.enabled = false
      renderer.domElement.setPointerCapture?.(event.pointerId)
    }

    const onPointerMove = (event: PointerEvent) => {
      if (!dragState) {
        // hover mode (no drag): update hover highlight + tooltip info
        if (!sceneState.meshEntries.size) return
        updatePointer(event)
        raycaster.setFromCamera(pointer, camera)
        const hit = raycaster.intersectObjects(sceneState.pickables, false)[0]
        const hoveredId = hit ? sceneState.boxByUuid.get(hit.object.uuid) ?? null : null
        if (hoveredId !== sceneState.hoverBoxId) {
          sceneState.hoverBoxId = hoveredId
          updateHoverHighlight(sceneState, hoveredId, scale, length, width)
          if (hoveredId) {
            const entry = sceneState.meshEntries.get(hoveredId)
            if (entry) {
              onHoverBoxRef.current?.({
                id: entry.box.id,
                label: entry.box.label,
                length: entry.box.length,
                width: entry.box.width,
                height: entry.box.height,
                orientationKey: entry.box.orientationKey,
                x: entry.box.x,
                y: entry.box.y,
                z: entry.box.z,
                clientX: event.clientX,
                clientY: event.clientY,
              })
            }
          } else {
            onHoverBoxRef.current?.(null)
          }
        } else if (hoveredId) {
          const entry = sceneState.meshEntries.get(hoveredId)
          if (entry) {
            onHoverBoxRef.current?.({
              id: entry.box.id,
              label: entry.box.label,
              length: entry.box.length,
              width: entry.box.width,
              height: entry.box.height,
              orientationKey: entry.box.orientationKey,
              x: entry.box.x,
              y: entry.box.y,
              z: entry.box.z,
              clientX: event.clientX,
              clientY: event.clientY,
            })
          }
        }
        return
      }
      // dragging
      const { entry } = dragState
      let nextX = entry.box.x
      let nextY = entry.box.y
      let nextZ: number

      if (dragState.mode === 'z' || event.shiftKey) {
        // Z mode: lock XY, vertical pixel drag → z mm
        const deltaPx = dragState.zStartPx - event.clientY
        nextZ = Math.max(0, Math.min(container.height - entry.box.height, dragState.zStartMm + deltaPx / Z_PIXELS_PER_MM))
        dragState.mode = 'z'
      } else {
        // building-game style: raycast the top faces of other boxes first, fall back to the
        // ground plane. The resulting (x, y, z) places the dragged box on top of whatever is
        // beneath the cursor.
        updatePointer(event)
        raycaster.setFromCamera(pointer, camera)
        const rayOriginContainer = {
          x: (raycaster.ray.origin.x + length / 2) / scale,
          y: (raycaster.ray.origin.z + width / 2) / scale,
          z: raycaster.ray.origin.y / scale,
        }
        const rayDirContainer = {
          x: raycaster.ray.direction.x / scale,
          y: raycaster.ray.direction.z / scale,
          z: raycaster.ray.direction.y / scale,
        }
        const otherBoxes: PlacedBox[] = []
        sceneState.meshEntries.forEach((e) => { if (e.box.id !== entry.box.id) otherBoxes.push(e.box) })
        const drop = resolveDropTarget({
          rayOrigin: rayOriginContainer,
          rayDirection: rayDirContainer,
          boxes: otherBoxes,
          draggedBoxId: entry.box.id,
          draggedSize: { length: entry.box.length, width: entry.box.width, height: entry.box.height },
          container,
          supportPolicy: placementSettingsRef.current.supportPolicy,
          surfaceSnapEnabled: placementSettingsRef.current.snapEnabled && placementSettingsRef.current.surfaceSnapEnabled,
        })
        nextX = drop.x
        nextY = drop.y
        nextZ = drop.z
      }

      if (edgeSnapRef.current && dragState.mode === 'plane') {
        const others: PlacedBox[] = []
        sceneState.meshEntries.forEach((e) => { if (e.box.id !== entry.box.id) others.push(e.box) })
        const snapped = snapToEdges({ x: nextX, y: nextY, length: entry.box.length, width: entry.box.width, others, container, tolerance: placementSettingsRef.current.edgeToleranceMm })
        nextX = snapped.x
        nextY = snapped.y
      }

      if (gridSnapRef.current) {
        if (dragState.mode === 'plane') {
          nextX = snapToGrid(nextX, placementSettingsRef.current.gridStepMm)
          nextY = snapToGrid(nextY, placementSettingsRef.current.gridStepMm)
        } else if (placementSettingsRef.current.snapEnabled && placementSettingsRef.current.zSnapEnabled) {
          nextZ = snapToGrid(nextZ, placementSettingsRef.current.zStepMm)
        }
      }

      const previewBox = { ...entry.box, x: nextX, y: nextY, z: nextZ }
      applyBoxTransform({ box: previewBox, mesh: entry.mesh, edges: entry.edges }, scale, length, width)

      const invalid = computeDragInvalid(entry, nextX, nextY, nextZ)
      if (invalid) {
        sceneState.invalidOverride.add(entry.box.id)
      } else {
        sceneState.invalidOverride.delete(entry.box.id)
      }
      refreshEntryVisual(entry)
      positionGhost(sceneState, nextX, nextY, nextZ, entry.box, invalid, scale, length, width)
    }

    const onPointerUp = (event: PointerEvent) => {
      if (dragState) {
        const { entry, boxId, mode } = dragState
        let finalXmm = (entry.mesh.position.x + length / 2) / scale - entry.box.length / 2
        let finalYmm = (entry.mesh.position.z + width / 2) / scale - entry.box.width / 2
        let finalZmm = entry.mesh.position.y / scale - entry.box.height / 2
        if (gridSnapRef.current) {
          if (mode === 'plane') {
            finalXmm = snapToGrid(finalXmm, placementSettingsRef.current.gridStepMm)
            finalYmm = snapToGrid(finalYmm, placementSettingsRef.current.gridStepMm)
          } else if (placementSettingsRef.current.snapEnabled && placementSettingsRef.current.zSnapEnabled) {
            finalZmm = snapToGrid(finalZmm, placementSettingsRef.current.zStepMm)
          }
        }
        const invalid = sceneState.invalidOverride.has(boxId) || computeDragInvalid(entry, finalXmm, finalYmm, finalZmm)
        sceneState.invalidOverride.delete(boxId)
        refreshEntryVisual(entry)
        clearGhost(sceneState)
        if (!invalid) {
          onManualMoveRef.current?.(...manualMoveCommitArgs({
            mode,
            boxId,
            currentX: entry.box.x,
            currentY: entry.box.y,
            finalX: finalXmm,
            finalY: finalYmm,
            finalZ: finalZmm,
          }))
        } else {
          onManualOperationRejectedRef.current?.('move', boxId)
          applyBoxTransform(entry, scale, length, width)
        }
        renderer.domElement.releasePointerCapture?.(event.pointerId)
        dragState = null
      }
      // controls are always enabled — auto + manual both rotate via right mouse
      controls.enabled = true
    }

    const onDragOver = (event: DragEvent) => {
      if (!manualEditableRef.current) return
      event.preventDefault()
      if (event.dataTransfer) {
        event.dataTransfer.dropEffect = 'copy'
      }
      const info = poolDragInfoRef.current
      if (!info) return
      // Compute a surface-snapped or ground drop target so the ghost mirrors what `drop` will produce.
      updatePointer(event)
      raycaster.setFromCamera(pointer, camera)
      const rayOriginContainer = {
        x: (raycaster.ray.origin.x + length / 2) / scale,
        y: (raycaster.ray.origin.z + width / 2) / scale,
        z: raycaster.ray.origin.y / scale,
      }
      const rayDirContainer = {
        x: raycaster.ray.direction.x / scale,
        y: raycaster.ray.direction.z / scale,
        z: raycaster.ray.direction.y / scale,
      }
      const others: PlacedBox[] = []
      sceneState.meshEntries.forEach((e) => others.push(e.box))
      const drop = resolveDropTarget({
        rayOrigin: rayOriginContainer,
        rayDirection: rayDirContainer,
        boxes: others,
        draggedBoxId: null,
        draggedSize: { length: info.length, width: info.width, height: info.height },
        container,
        supportPolicy: placementSettingsRef.current.supportPolicy,
        surfaceSnapEnabled: placementSettingsRef.current.snapEnabled && placementSettingsRef.current.surfaceSnapEnabled,
      })
      let dropX = drop.x
      let dropY = drop.y
      const dropZ = drop.z
      if (edgeSnapRef.current && dropZ === 0) {
        const snapped = snapToEdges({ x: dropX, y: dropY, length: info.length, width: info.width, others, container, tolerance: placementSettingsRef.current.edgeToleranceMm })
        dropX = snapped.x
        dropY = snapped.y
      }
      const ghostBox: PlacedBox = {
        id: '__pool_ghost__', cargoId: info.cargoId, name: 'pool', label: 'P', index: 0,
        x: dropX, y: dropY, z: dropZ, length: info.length, width: info.width, height: info.height,
        orientationKey: 'LWH', labelRotationDeg: 0, weight: 0, color: info.color,
        stackable: true, physicalLayer: 1, workStep: 1, supportType: 'floor', supportedBy: [],
      }
      ensureGhost(sceneState, ghostBox, scale, length, width)
      const invalid = computeInvalidByGeometry(null, dropX, dropY, dropZ, info.length, info.width, info.height)
      sceneState.poolDrop = { x: dropX, y: dropY, z: dropZ, invalid }
      mountRef.current?.setAttribute('data-pool-ghost-invalid', invalid ? 'true' : 'false')
      positionGhost(sceneState, dropX, dropY, dropZ, ghostBox, invalid, scale, length, width)
    }

    const onDragLeave = () => {
      if (!poolDragInfoRef.current) return
      clearGhost(sceneState)
      sceneState.poolDrop = null
      mountRef.current?.setAttribute('data-pool-ghost-invalid', 'false')
    }

    const onDrop = (event: DragEvent) => {
      if (!manualEditableRef.current) return
      event.preventDefault()
      const cargoId = event.dataTransfer?.getData('application/x-cargo-id') ?? event.dataTransfer?.getData('text/plain')
      // Re-compute the drop target on the drop coordinates so the result matches the visible
      // ghost (dragover and drop events may have slightly different pointer positions).
      let finalDrop = sceneState.poolDrop
      if (cargoId) {
        const info = poolDragInfoRef.current
        if (info) {
          updatePointer(event)
          raycaster.setFromCamera(pointer, camera)
          const rayOriginContainer = {
            x: (raycaster.ray.origin.x + length / 2) / scale,
            y: (raycaster.ray.origin.z + width / 2) / scale,
            z: raycaster.ray.origin.y / scale,
          }
          const rayDirContainer = {
            x: raycaster.ray.direction.x / scale,
            y: raycaster.ray.direction.z / scale,
            z: raycaster.ray.direction.y / scale,
          }
          const others: PlacedBox[] = []
          sceneState.meshEntries.forEach((e) => others.push(e.box))
          const target = resolveDropTarget({
            rayOrigin: rayOriginContainer,
            rayDirection: rayDirContainer,
            boxes: others,
            draggedBoxId: null,
            draggedSize: { length: info.length, width: info.width, height: info.height },
            container,
            supportPolicy: placementSettingsRef.current.supportPolicy,
            surfaceSnapEnabled: placementSettingsRef.current.snapEnabled && placementSettingsRef.current.surfaceSnapEnabled,
          })
          let targetX = target.x
          let targetY = target.y
          if (edgeSnapRef.current && target.z === 0) {
            const snapped = snapToEdges({ x: targetX, y: targetY, length: info.length, width: info.width, others, container, tolerance: placementSettingsRef.current.edgeToleranceMm })
            targetX = snapped.x
            targetY = snapped.y
          }
          const invalid = computeInvalidByGeometry(null, targetX, targetY, target.z, info.length, info.width, info.height)
          finalDrop = { x: targetX, y: targetY, z: target.z, invalid }
        }
      }
      clearGhost(sceneState)
      sceneState.poolDrop = null
      if (!cargoId) return
      if (!finalDrop || finalDrop.invalid) {
        onManualOperationRejectedRef.current?.('drop', undefined, cargoId)
        return
      }
      const poolInfo = poolDragInfoRef.current
      const snapped = finalDrop.z === 0 && poolInfo
        ? applyManualPlacementSnap({
            x: finalDrop.x,
            y: finalDrop.y,
            boxSize: { length: poolInfo.length, width: poolInfo.width },
            others: Array.from(sceneState.meshEntries.values()).map((entry) => entry.box),
            container,
            settings: placementSettingsRef.current,
          })
        : { x: finalDrop.x, y: finalDrop.y }
      const snappedX = snapped.x
      const snappedY = snapped.y
      onManualDropFromPoolRef.current?.(cargoId, snappedX, snappedY, finalDrop.z)
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (!manualEditableRef.current) return
      const target = event.target as HTMLElement | null
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return
      const boxId = selectedManualBoxIdRef.current
      if (!boxId) return
      const entry = sceneState.meshEntries.get(boxId)
      if (!entry) return
      const step = event.shiftKey ? 100 : event.ctrlKey || event.metaKey ? 1 : 10
      let handled = true
      switch (event.key) {
        case 'Delete':
        case 'Backspace':
          onManualDeleteRef.current?.(boxId)
          break
        case 'Escape':
          onClearSelectionRef.current?.()
          break
        case 'ArrowLeft':
          onManualMoveRef.current?.(boxId, entry.box.x - step, entry.box.y)
          break
        case 'ArrowRight':
          onManualMoveRef.current?.(boxId, entry.box.x + step, entry.box.y)
          break
        case 'ArrowDown':
          onManualMoveRef.current?.(boxId, entry.box.x, entry.box.y - step)
          break
        case 'ArrowUp':
          onManualMoveRef.current?.(boxId, entry.box.x, entry.box.y + step)
          break
        case 'PageUp':
          onManualMoveRef.current?.(boxId, entry.box.x, entry.box.y, Math.max(0, entry.box.z + step))
          break
        case 'PageDown':
          onManualMoveRef.current?.(boxId, entry.box.x, entry.box.y, Math.max(0, entry.box.z - step))
          break
        default:
          handled = false
      }
      if (handled) event.preventDefault()
    }

    renderer.domElement.addEventListener('pointerdown', onPointerDown)
    renderer.domElement.addEventListener('pointermove', onPointerMove)
    renderer.domElement.addEventListener('pointerup', onPointerUp)
    renderer.domElement.addEventListener('pointercancel', onPointerUp)
    renderer.domElement.addEventListener('dragover', onDragOver)
    renderer.domElement.addEventListener('dragleave', onDragLeave)
    renderer.domElement.addEventListener('drop', onDrop)
    window.addEventListener('keydown', onKeyDown)

    let frame = 0
    const animate = () => {
      frame = requestAnimationFrame(animate)
      if (controls.enabled) {
        controls.update()
      }
      renderer.render(scene, camera)
    }
    animate()

    return () => {
      cancelAnimationFrame(frame)
      observer.disconnect()
      controls.dispose()
      if (sceneState.ghost) {
        sceneState.ghost.mesh.geometry.dispose()
        sceneState.ghost.edges.geometry.dispose()
        ;(sceneState.ghost.mesh.material as THREE.Material).dispose()
        ;(sceneState.ghost.edges.material as THREE.Material).dispose()
        scene.remove(sceneState.ghost.mesh)
        scene.remove(sceneState.ghost.edges)
        sceneState.ghost = null
      }
      if (sceneState.hoverHighlight) {
        sceneState.hoverHighlight.geometry.dispose()
        ;(sceneState.hoverHighlight.material as THREE.Material).dispose()
        scene.remove(sceneState.hoverHighlight)
        sceneState.hoverHighlight = null
      }
      sceneState.meshEntries.forEach((entry) => {
        entry.mesh.geometry.dispose()
        entry.edges.geometry.dispose()
        scene.remove(entry.mesh)
        scene.remove(entry.edges)
      })
      sceneState.meshEntries.clear()
      sceneState.pickables.length = 0
      sceneState.boxByUuid.clear()
      const tCache = textureCache.get(sceneState)
      if (tCache) {
        tCache.forEach((tex) => tex.dispose())
        tCache.clear()
      }
      const mCache = materialCache.get(sceneState)
      if (mCache) {
        const disposed = new Set<THREE.Material>()
        mCache.forEach((mat) => {
          const materials = Array.isArray(mat) ? mat : [mat]
          for (const material of materials) {
            if (disposed.has(material)) continue
            material.dispose()
            disposed.add(material)
          }
        })
        mCache.clear()
      }
      const geometries = new Set<THREE.BufferGeometry>()
      scene.traverse((object) => {
        if (object instanceof THREE.Mesh || object instanceof THREE.LineSegments) {
          geometries.add(object.geometry)
        }
      })
      geometries.forEach((geometry) => geometry.dispose())
      renderer.dispose()
      renderer.domElement.removeEventListener('pointerdown', onPointerDown)
      renderer.domElement.removeEventListener('pointermove', onPointerMove)
      renderer.domElement.removeEventListener('pointerup', onPointerUp)
      renderer.domElement.removeEventListener('pointercancel', onPointerUp)
      renderer.domElement.removeEventListener('dragover', onDragOver)
      renderer.domElement.removeEventListener('dragleave', onDragLeave)
      renderer.domElement.removeEventListener('drop', onDrop)
      window.removeEventListener('keydown', onKeyDown)
      mount.removeChild(renderer.domElement)
      if (sceneStateRef.current === sceneState) {
        sceneStateRef.current = null
      }
    }
  }, [container.length, container.width, container.height, container.doorGap, container.topGap, container.sideGap]) // eslint-disable-line react-hooks/exhaustive-deps -- viewMode/handlers are handled by their own effects; we only rebuild on container dimension change

  useEffect(() => {
    const state = sceneStateRef.current
    if (!state) return
    const { scene, meshEntries, pickables, boxByUuid, scale, length, width } = state

    const incomingIds = new Set(boxes.map((box) => box.id))
    for (const [id, entry] of meshEntries) {
      if (!incomingIds.has(id)) {
        scene.remove(entry.mesh)
        scene.remove(entry.edges)
        entry.mesh.geometry.dispose()
        entry.edges.geometry.dispose()
        const idx = pickables.indexOf(entry.mesh)
        if (idx >= 0) pickables.splice(idx, 1)
        boxByUuid.delete(entry.mesh.uuid)
        meshEntries.delete(id)
      }
    }

    const { activeLayerId: la, activeLabelId: lb, selectedBoxId: sb, highlightBoxIds: hb, boxOpacityOverride: opacityOverride } = visualPropsRef.current
    boxes.forEach((box) => {
      const existing = meshEntries.get(box.id)
      const invalid = state.invalidOverride.has(box.id) || invalidBoxIdsRef.current.has(box.id)
      if (existing) {
        existing.box = box
        if (!sameBoxGeometry(box, existing.mesh.geometry, scale)) {
          existing.mesh.geometry.dispose()
          existing.edges.geometry.dispose()
          const geometry = boxGeometryForPlaced(box, scale)
          existing.mesh.geometry = geometry
          existing.edges.geometry = new THREE.EdgesGeometry(geometry)
        }
        applyBoxTransform(existing, scale, length, width)
        applyBoxVisualState(state, existing, la, lb, sb, hb, invalid, opacityOverride)
        return
      }
      const geometry = boxGeometryForPlaced(box, scale)
      const visualState = boxVisualState(box, la, lb, sb, hb, invalid)
      const opacity = opacityOverride === null || opacityOverride === undefined
        ? visualState.opacity
        : Math.min(1, Math.max(0.12, visualState.selected ? Math.max(opacityOverride, 0.75) : opacityOverride))
      const material = getCachedBoxMaterials(state, box, visualState.selected, opacity, invalid)
      const mesh = new THREE.Mesh(geometry, material)
      mesh.castShadow = true
      mesh.receiveShadow = true
      scene.add(mesh)
      pickables.push(mesh)
      boxByUuid.set(mesh.uuid, box.id)

      const edges = new THREE.LineSegments(
        new THREE.EdgesGeometry(geometry),
        new THREE.LineBasicMaterial({
          color: visualState.edgeColor,
          transparent: true,
          opacity: visualState.edgeOpacity,
        }),
      )
      applyBoxTransform({ box, mesh, edges }, scale, length, width)
      scene.add(edges)
      meshEntries.set(box.id, { box, mesh, edges })
    })
  }, [boxes])

  useEffect(() => {
    const state = sceneStateRef.current
    if (!state) return
    state.camera.position.copy(cameraPositionForMode(viewMode, state.length, state.width, state.height))
    state.camera.lookAt(0, state.height / 2, 0)
    state.controls.target.set(0, state.height / 2, 0)
    state.controls.update()
  }, [viewMode, resetViewTick])

  useEffect(() => {
    const state = sceneStateRef.current
    if (!state) return
    state.controls.enabled = true
    if (manualEditable) {
      state.controls.mouseButtons = {
        LEFT: null,
        MIDDLE: THREE.MOUSE.PAN,
        RIGHT: THREE.MOUSE.ROTATE,
      }
    } else {
      state.controls.mouseButtons = {
        LEFT: THREE.MOUSE.ROTATE,
        MIDDLE: THREE.MOUSE.DOLLY,
        RIGHT: THREE.MOUSE.PAN,
      }
    }
  }, [manualEditable])

  useEffect(() => {
    const state = sceneStateRef.current
    if (!state) return
    if (state.cogGroup) {
      state.scene.remove(state.cogGroup)
      state.cogGroup.traverse((obj) => {
        if (obj instanceof THREE.Mesh || obj instanceof THREE.LineSegments || obj instanceof THREE.Line) {
          obj.geometry.dispose()
          if (Array.isArray(obj.material)) obj.material.forEach((m) => m.dispose())
          else (obj.material as THREE.Material).dispose()
        }
      })
      state.cogGroup = null
    }
    if (!cogOverlay) return
    const { scale } = state
    const group = new THREE.Group()
    const toWorld = (x: number, y: number, z: number) => new THREE.Vector3(
      -state.length / 2 + x * scale,
      z * scale,
      -state.width / 2 + y * scale,
    )

    // Safe range box (transparent green if balanced, amber if cautious)
    const safeColor = cogOverlay.warning ? 0xef4444 : cogOverlay.balanced ? 0x22c55e : 0xf59e0b
    const safe = cogOverlay.safe
    const safeGeo = new THREE.BoxGeometry(
      (safe.max.x - safe.min.x) * scale,
      (safe.max.z - safe.min.z) * scale,
      (safe.max.y - safe.min.y) * scale,
    )
    const safeMesh = new THREE.Mesh(safeGeo, new THREE.MeshBasicMaterial({ color: safeColor, transparent: true, opacity: 0.18, depthWrite: false }))
    const safeCenter = toWorld((safe.min.x + safe.max.x) / 2, (safe.min.y + safe.max.y) / 2, (safe.min.z + safe.max.z) / 2)
    safeMesh.position.copy(safeCenter)
    group.add(safeMesh)
    const safeEdges = new THREE.LineSegments(new THREE.EdgesGeometry(safeGeo), new THREE.LineBasicMaterial({ color: safeColor }))
    safeEdges.position.copy(safeCenter)
    group.add(safeEdges)

    // CoG marker — small sphere + vertical drop line
    const cogColor = cogOverlay.warning ? 0xef4444 : 0x16a34a
    const cogPos = toWorld(cogOverlay.cog.x, cogOverlay.cog.y, cogOverlay.cog.z)
    const sphere = new THREE.Mesh(
      new THREE.SphereGeometry(Math.max(0.05, scale * 80), 16, 12),
      new THREE.MeshBasicMaterial({ color: cogColor }),
    )
    sphere.position.copy(cogPos)
    group.add(sphere)
    const centerPos = toWorld(cogOverlay.center.x, cogOverlay.center.y, cogOverlay.center.z)
    const line = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([cogPos, centerPos]),
      new THREE.LineDashedMaterial({ color: cogColor, dashSize: 0.1, gapSize: 0.05 }),
    )
    line.computeLineDistances()
    group.add(line)

    // Truck silhouette beneath the container — full geometry descriptor.
    const geo = cogOverlay.truckGeometry
    if (geo) {
      const truckColor = 0x475569
      const truckMat = new THREE.LineBasicMaterial({ color: truckColor })
      const yFloor = -0.05 // trailer deck top sits just under the container floor (world Y units)

      const addLineSegments = (positions: number[]) => {
        const buf = new THREE.BufferGeometry()
        buf.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
        group.add(new THREE.LineSegments(buf, truckMat))
      }

      // Helper to flatten a list of [from, to] points into a flat position array.
      const segs = (pairs: Array<[THREE.Vector3, THREE.Vector3]>) => {
        const out: number[] = []
        for (const [a, b] of pairs) {
          out.push(a.x, a.y, a.z, b.x, b.y, b.z)
        }
        return out
      }

      // Build a trapezoidal cab as 8 corner vertices + 12 connecting edges.
      const cabFrontHalfW = geo.cab.frontWidth / 2
      const cabBackHalfW = geo.cab.backWidth / 2
      const trailerCenterY = geo.trailer.width / 2
      const cabV = {
        fbl: toWorld(geo.cab.frontX, trailerCenterY - cabFrontHalfW, 0),
        fbr: toWorld(geo.cab.frontX, trailerCenterY + cabFrontHalfW, 0),
        ftl: toWorld(geo.cab.frontX, trailerCenterY - cabFrontHalfW, geo.cab.frontHeight),
        ftr: toWorld(geo.cab.frontX, trailerCenterY + cabFrontHalfW, geo.cab.frontHeight),
        bbl: toWorld(geo.cab.backX, trailerCenterY - cabBackHalfW, 0),
        bbr: toWorld(geo.cab.backX, trailerCenterY + cabBackHalfW, 0),
        btl: toWorld(geo.cab.backX, trailerCenterY - cabBackHalfW, geo.cab.backHeight),
        btr: toWorld(geo.cab.backX, trailerCenterY + cabBackHalfW, geo.cab.backHeight),
      }
      addLineSegments(
        segs([
          // front face rectangle
          [cabV.fbl, cabV.fbr], [cabV.fbr, cabV.ftr], [cabV.ftr, cabV.ftl], [cabV.ftl, cabV.fbl],
          // back face rectangle
          [cabV.bbl, cabV.bbr], [cabV.bbr, cabV.btr], [cabV.btr, cabV.btl], [cabV.btl, cabV.bbl],
          // 4 connecting edges (the trapezoid sides)
          [cabV.fbl, cabV.bbl], [cabV.fbr, cabV.bbr], [cabV.ftl, cabV.btl], [cabV.ftr, cabV.btr],
        ]),
      )

      // Windshield: 4 edges defining a slanted plane on the front face of the cab.
      const wsBL = toWorld(geo.windshield.bottomX, trailerCenterY - geo.windshield.width / 2, geo.windshield.bottomZ)
      const wsBR = toWorld(geo.windshield.bottomX, trailerCenterY + geo.windshield.width / 2, geo.windshield.bottomZ)
      const wsTL = toWorld(geo.windshield.topX, trailerCenterY - geo.windshield.width / 2, geo.windshield.topZ)
      const wsTR = toWorld(geo.windshield.topX, trailerCenterY + geo.windshield.width / 2, geo.windshield.topZ)
      addLineSegments(segs([[wsBL, wsBR], [wsBR, wsTR], [wsTR, wsTL], [wsTL, wsBL], [wsBL, wsTR], [wsBR, wsTL]]))

      // Grille: vertical bars + top/bottom frame.
      const grilleBars: Array<[THREE.Vector3, THREE.Vector3]> = []
      const gW = geo.grille.width
      const gY0 = trailerCenterY - gW / 2
      grilleBars.push(
        [toWorld(geo.grille.x, gY0, geo.grille.bottomZ), toWorld(geo.grille.x, gY0 + gW, geo.grille.bottomZ)],
        [toWorld(geo.grille.x, gY0, geo.grille.topZ), toWorld(geo.grille.x, gY0 + gW, geo.grille.topZ)],
      )
      for (let i = 0; i < geo.grille.bars; i += 1) {
        const t = geo.grille.bars === 1 ? 0.5 : i / (geo.grille.bars - 1)
        const y = gY0 + t * gW
        grilleBars.push([toWorld(geo.grille.x, y, geo.grille.bottomZ), toWorld(geo.grille.x, y, geo.grille.topZ)])
      }
      addLineSegments(segs(grilleBars))

      // Roof deflector — small box on top of the cab.
      const rd = geo.roofDeflector
      const rdHalfW = rd.width / 2
      const rdV = {
        fbl: toWorld(rd.frontX, trailerCenterY - rdHalfW, rd.bottomZ),
        fbr: toWorld(rd.frontX, trailerCenterY + rdHalfW, rd.bottomZ),
        ftl: toWorld(rd.frontX, trailerCenterY - rdHalfW, rd.topZ),
        ftr: toWorld(rd.frontX, trailerCenterY + rdHalfW, rd.topZ),
        bbl: toWorld(rd.backX, trailerCenterY - rdHalfW, rd.bottomZ),
        bbr: toWorld(rd.backX, trailerCenterY + rdHalfW, rd.bottomZ),
        btl: toWorld(rd.backX, trailerCenterY - rdHalfW, rd.topZ),
        btr: toWorld(rd.backX, trailerCenterY + rdHalfW, rd.topZ),
      }
      addLineSegments(
        segs([
          [rdV.fbl, rdV.fbr], [rdV.fbr, rdV.ftr], [rdV.ftr, rdV.ftl], [rdV.ftl, rdV.fbl],
          [rdV.bbl, rdV.bbr], [rdV.bbr, rdV.btr], [rdV.btr, rdV.btl], [rdV.btl, rdV.bbl],
          [rdV.fbl, rdV.bbl], [rdV.fbr, rdV.bbr], [rdV.ftl, rdV.btl], [rdV.ftr, rdV.btr],
        ]),
      )

      // Trailer deck — thin box outline at the bottom of the container.
      const trailerLen = (geo.trailer.endX - geo.trailer.startX) * scale
      const trailerW = geo.trailer.width * scale
      const deck = new THREE.LineSegments(
        new THREE.EdgesGeometry(new THREE.BoxGeometry(trailerLen, geo.trailer.deckThickness * scale, trailerW)),
        truckMat,
      )
      deck.position.set(-state.length / 2 + trailerLen / 2, yFloor - geo.trailer.deckThickness * scale / 2, 0)
      group.add(deck)

      // Chassis beam — single rectangle hung beneath the deck.
      const beam = geo.chassisBeam
      const beamLen = (beam.toX - beam.fromX) * scale
      const beamW = beam.width * scale
      const beamMesh = new THREE.LineSegments(
        new THREE.EdgesGeometry(new THREE.BoxGeometry(beamLen, beamW * 0.4, beamW)),
        truckMat,
      )
      beamMesh.position.set(-state.length / 2 + (beam.fromX + beamLen / scale / 2) * scale, beam.z * scale, 0)
      group.add(beamMesh)

      // Kingpin — torus + cross.
      const kp = geo.kingPin
      const kpRing = new THREE.LineLoop(
        new THREE.RingGeometry(kp.radius * scale * 0.7, kp.radius * scale, 24),
        truckMat,
      )
      kpRing.rotation.x = -Math.PI / 2
      kpRing.position.copy(toWorld(kp.x, trailerCenterY, kp.z))
      group.add(kpRing)
      const crossPts: Array<[THREE.Vector3, THREE.Vector3]> = [
        [toWorld(kp.x - kp.radius, trailerCenterY, kp.z), toWorld(kp.x + kp.radius, trailerCenterY, kp.z)],
        [toWorld(kp.x, trailerCenterY - kp.radius, kp.z), toWorld(kp.x, trailerCenterY + kp.radius, kp.z)],
      ]
      addLineSegments(segs(crossPts))

      // Axles with dual-wheel groups on each side.
      for (const axle of geo.axles) {
        const yMid = axle.z * scale
        const wheelGeom = new THREE.TorusGeometry(axle.wheelRadius * scale, 0.05, 8, 18)
        for (const side of [-1, 1]) {
          for (const inner of [-1, 1]) {
            const wheel = new THREE.LineSegments(new THREE.EdgesGeometry(wheelGeom), truckMat)
            wheel.rotation.z = Math.PI / 2
            const yOffset = side * (axle.halfTrack + inner * axle.dualSpacing * 0.5) * scale
            wheel.position.set(-state.length / 2 + axle.x * scale, yMid, yOffset)
            group.add(wheel)
          }
        }
        // axle beam connecting the two sides
        const beamPts: Array<[THREE.Vector3, THREE.Vector3]> = [
          [
            new THREE.Vector3(-state.length / 2 + axle.x * scale, yMid, -axle.halfTrack * scale),
            new THREE.Vector3(-state.length / 2 + axle.x * scale, yMid, axle.halfTrack * scale),
          ],
        ]
        addLineSegments(segs(beamPts))
      }
    }

    state.scene.add(group)
    state.cogGroup = group
  }, [cogOverlay])

  useEffect(() => {
    const state = sceneStateRef.current
    if (!state) return
    const { activeLayerId: la, activeLabelId: lb, selectedBoxId: sb, highlightBoxIds: hb, boxOpacityOverride: opacityOverride } = visualPropsRef.current
    state.meshEntries.forEach((entry) => {
      const invalid = state.invalidOverride.has(entry.box.id) || invalidBoxIdsRef.current.has(entry.box.id)
      applyBoxVisualState(state, entry, la, lb, sb, hb, invalid, opacityOverride)
    })
  }, [activeLayerId, activeLabelId, selectedBoxId, highlightBoxIds, invalidBoxIds, boxOpacityOverride])

  const interactionMode = manualEditable ? 'manual' : 'auto'

  return (
    <div
      ref={mountRef}
      className="h-full min-h-[420px] w-full"
      data-testid="container-scene"
      data-controls-enabled="true"
      data-interaction-mode={interactionMode}
      data-grid-snap={placementSettings?.snapEnabled === false || gridSnap === false ? 'off' : 'on'}
      data-edge-snap={placementSettings?.snapEnabled === false || edgeSnap === false ? 'off' : 'on'}
      data-cog-overlay={cogOverlay ? 'on' : 'off'}
      data-box-opacity={boxOpacityOverride ?? 'normal'}
      data-gravity-field="off"
      data-pool-ghost-active={poolDragInfo ? 'true' : 'false'}
      data-pool-ghost-invalid="false"
      data-box-count={boxes.length}
    />
  )
}
