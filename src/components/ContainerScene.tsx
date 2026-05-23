import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import type { ContainerSpec, PlacedBox } from '../types'
import { MIN_SUPPORT_OVERLAP_RATIO } from '../lib/manualPlacement'
import { snapToGrid } from '../lib/snap'

export type SceneViewMode = 'iso' | 'top' | 'front' | 'side'

export type HoverBoxInfo = {
  id: string
  label: string
  length: number
  width: number
  height: number
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
  viewLocked?: boolean
  gridSnap?: boolean
  selectedBoxId?: string | null
  onSelectBox?: (boxId: string) => void
  invalidBoxIds?: Set<string>
  manualEditable?: boolean
  onManualMove?: (boxId: string, x: number, y: number, z?: number) => void
  onManualDropFromPool?: (cargoId: string, x: number, y: number) => void
  onManualRotate?: (boxId: string) => void
  onManualDelete?: (boxId: string) => void
  selectedManualBoxId?: string | null
  onClearSelection?: () => void
  onHoverBox?: (info: HoverBoxInfo | null) => void
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
  scale: number
  length: number
  width: number
  height: number
}

const textureCache = new WeakMap<SceneState, Map<string, THREE.Texture>>()
const materialCache = new WeakMap<SceneState, Map<string, THREE.Material>>()

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

function makeFaceLabelTexture(label: string, color: string, selected: boolean, rotationDeg: number) {
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
  context.save()
  context.translate(128, 134)
  context.rotate((rotationDeg * Math.PI) / 180)
  context.fillText(label, 0, 0, 142)
  context.restore()

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

function getCachedBoxMaterial(state: SceneState, box: PlacedBox, selected: boolean, opacity: number, invalid: boolean) {
  const tCache = getTextureCache(state)
  const mCache = getMaterialCache(state)
  const textureKey = `${box.label}:${box.color}:${selected}:${box.labelRotationDeg}`
  let texture = tCache.get(textureKey)
  if (!texture) {
    texture = makeFaceLabelTexture(box.label, box.color, selected, box.labelRotationDeg)
    tCache.set(textureKey, texture)
  }

  const materialKey = `${textureKey}:${opacity}:${invalid ? 'inv' : 'ok'}`
  const cached = mCache.get(materialKey)
  if (cached) {
    return cached
  }

  const material = makeBoxMaterial(texture, selected, opacity, invalid)
  mCache.set(materialKey, material)
  return material
}

function boxVisualState(
  box: PlacedBox,
  activeLayerId: string,
  activeLabelId: string,
  selectedBoxId: string | null | undefined,
  invalid: boolean,
) {
  const selected = box.id === selectedBoxId
  const currentLayer = activeLayerId === 'all' || String(box.physicalLayer) === activeLayerId
  const currentLabel = activeLabelId === 'all' || box.label === activeLabelId
  const active = selected || (currentLayer && currentLabel)
  return {
    selected,
    active,
    invalid,
    opacity: active ? 1 : 0.22,
    edgeColor: invalid ? 0xef4444 : selected ? 0xf3b21a : active ? 0x252525 : 0x777777,
    edgeOpacity: invalid ? 0.95 : active ? 0.72 : 0.14,
  }
}

function applyBoxVisualState(
  state: SceneState,
  entry: MeshEntry,
  activeLayerId: string,
  activeLabelId: string,
  selectedBoxId: string | null | undefined,
  invalid: boolean,
) {
  const visual = boxVisualState(entry.box, activeLayerId, activeLabelId, selectedBoxId, invalid)
  entry.mesh.material = getCachedBoxMaterial(state, entry.box, visual.selected, visual.opacity, visual.invalid)
  const material = entry.edges.material
  if (material instanceof THREE.LineBasicMaterial) {
    material.color.setHex(visual.edgeColor)
    material.opacity = visual.edgeOpacity
    material.transparent = visual.edgeOpacity < 1
    material.needsUpdate = true
  }
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
    const geometry = new THREE.BoxGeometry(box.length * scale, box.height * scale, box.width * scale)
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
    const sameSize = state.ghost.mesh.geometry instanceof THREE.BoxGeometry
      && (state.ghost.mesh.geometry as THREE.BoxGeometry).parameters.width === box.length * scale
      && (state.ghost.mesh.geometry as THREE.BoxGeometry).parameters.depth === box.width * scale
      && (state.ghost.mesh.geometry as THREE.BoxGeometry).parameters.height === box.height * scale
    if (!sameSize) {
      state.ghost.mesh.geometry.dispose()
      state.ghost.edges.geometry.dispose()
      const geometry = new THREE.BoxGeometry(box.length * scale, box.height * scale, box.width * scale)
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
  const worldX = -length / 2 + (x + box.length / 2) * scale
  const worldY = (z + box.height / 2) * scale
  const worldZ = -width / 2 + (y + box.width / 2) * scale
  state.ghost.mesh.position.set(worldX, worldY, worldZ)
  state.ghost.edges.position.set(worldX, worldY, worldZ)
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
    new THREE.BoxGeometry(entry.box.length * scale, entry.box.height * scale, entry.box.width * scale),
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
  const worldX = -length / 2 + (entry.box.x + entry.box.length / 2) * scale
  const worldY = (entry.box.z + entry.box.height / 2) * scale
  const worldZ = -width / 2 + (entry.box.y + entry.box.width / 2) * scale
  state.hoverHighlight.position.set(worldX, worldY, worldZ)
  state.hoverHighlight.visible = true
}

export function ContainerScene({
  container,
  boxes,
  activeLayerId,
  activeLabelId,
  viewMode,
  viewLocked,
  gridSnap,
  selectedBoxId,
  onSelectBox,
  invalidBoxIds,
  manualEditable,
  onManualMove,
  onManualDropFromPool,
  onManualRotate,
  onManualDelete,
  selectedManualBoxId,
  onClearSelection,
  onHoverBox,
}: ContainerSceneProps) {
  const mountRef = useRef<HTMLDivElement | null>(null)
  const sceneStateRef = useRef<SceneState | null>(null)
  const invalidBoxIdsRef = useRef<Set<string>>(invalidBoxIds ?? new Set())
  const manualEditableRef = useRef<boolean>(manualEditable ?? false)
  const viewLockedRef = useRef<boolean>(viewLocked ?? false)
  const gridSnapRef = useRef<boolean>(gridSnap ?? true)
  const onManualMoveRef = useRef<typeof onManualMove>(onManualMove)
  const onManualDropFromPoolRef = useRef<typeof onManualDropFromPool>(onManualDropFromPool)
  const onManualRotateRef = useRef<typeof onManualRotate>(onManualRotate)
  const onManualDeleteRef = useRef<typeof onManualDelete>(onManualDelete)
  const onSelectBoxRef = useRef<typeof onSelectBox>(onSelectBox)
  const onClearSelectionRef = useRef<typeof onClearSelection>(onClearSelection)
  const onHoverBoxRef = useRef<typeof onHoverBox>(onHoverBox)
  const selectedManualBoxIdRef = useRef<string | null>(selectedManualBoxId ?? null)
  const visualPropsRef = useRef({ activeLayerId, activeLabelId, selectedBoxId })

  useEffect(() => {
    invalidBoxIdsRef.current = invalidBoxIds ?? new Set()
  }, [invalidBoxIds])

  useEffect(() => {
    manualEditableRef.current = manualEditable ?? false
  }, [manualEditable])

  useEffect(() => {
    viewLockedRef.current = viewLocked ?? false
  }, [viewLocked])

  useEffect(() => {
    gridSnapRef.current = gridSnap ?? true
  }, [gridSnap])

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
    visualPropsRef.current = { activeLayerId, activeLabelId, selectedBoxId }
  }, [activeLayerId, activeLabelId, selectedBoxId])

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

    const computeDragInvalid = (entry: MeshEntry, x: number, y: number, z: number) => {
      if (isOutOfBounds(x, y, entry.box.length, entry.box.width, container)) return true
      if (z < -0.01 || z + entry.box.height > container.height + 0.01) return true
      let supportedArea = z <= 0.01 ? entry.box.length * entry.box.width : 0
      const baseArea = entry.box.length * entry.box.width
      for (const other of sceneState.meshEntries.values()) {
        if (other.box.id === entry.box.id) continue
        if (other.box.z >= z + entry.box.height || z >= other.box.z + other.box.height) continue
        if (
          rectsOverlap(
            x,
            y,
            entry.box.length,
            entry.box.width,
            other.box.x,
            other.box.y,
            other.box.length,
            other.box.width,
          )
        ) {
          return true
        }
      }
      if (z > 0.01) {
        for (const other of sceneState.meshEntries.values()) {
          if (other.box.id === entry.box.id) continue
          if (Math.abs(other.box.z + other.box.height - z) > 0.01) continue
          supportedArea += overlapAreaXY(
            x,
            y,
            entry.box.length,
            entry.box.width,
            other.box.x,
            other.box.y,
            other.box.length,
            other.box.width,
          )
        }
      }
      if (baseArea <= 0 || supportedArea / baseArea < MIN_SUPPORT_OVERLAP_RATIO) return true
      return false
    }

    const refreshEntryVisual = (entry: MeshEntry) => {
      const { activeLayerId: la, activeLabelId: lb, selectedBoxId: sb } = visualPropsRef.current
      const invalid = sceneState.invalidOverride.has(entry.box.id) || invalidBoxIdsRef.current.has(entry.box.id)
      applyBoxVisualState(sceneState, entry, la, lb, sb, invalid)
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
      let nextZ = entry.box.z

      if (dragState.mode === 'z' || event.shiftKey) {
        // Z mode: lock XY, vertical pixel drag → z mm
        const deltaPx = dragState.zStartPx - event.clientY
        nextZ = Math.max(0, Math.min(container.height - entry.box.height, dragState.zStartMm + deltaPx / Z_PIXELS_PER_MM))
        dragState.mode = 'z'
      } else {
        updatePointer(event)
        raycaster.setFromCamera(pointer, camera)
        if (!raycaster.ray.intersectPlane(groundPlane, intersectionPoint)) return
        const containerMm = worldToContainerMm(intersectionPoint.x, intersectionPoint.z)
        nextX = containerMm.x - dragState.offsetXmm
        nextY = containerMm.y - dragState.offsetYmm
      }

      if (gridSnapRef.current) {
        if (dragState.mode === 'plane') {
          nextX = snapToGrid(nextX)
          nextY = snapToGrid(nextY)
        } else {
          nextZ = snapToGrid(nextZ)
        }
      }

      const newWorldX = -length / 2 + (nextX + entry.box.length / 2) * scale
      const newWorldY = (nextZ + entry.box.height / 2) * scale
      const newWorldZ = -width / 2 + (nextY + entry.box.width / 2) * scale
      entry.mesh.position.set(newWorldX, newWorldY, newWorldZ)
      entry.edges.position.set(newWorldX, newWorldY, newWorldZ)

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
            finalXmm = snapToGrid(finalXmm)
            finalYmm = snapToGrid(finalYmm)
          } else {
            finalZmm = snapToGrid(finalZmm)
          }
        }
        const invalid = sceneState.invalidOverride.has(boxId) || computeDragInvalid(entry, finalXmm, finalYmm, finalZmm)
        sceneState.invalidOverride.delete(boxId)
        refreshEntryVisual(entry)
        clearGhost(sceneState)
        if (!invalid) {
          if (mode === 'z') {
            onManualMoveRef.current?.(boxId, entry.box.x, entry.box.y, Math.max(0, finalZmm))
          } else {
            onManualMoveRef.current?.(boxId, finalXmm, finalYmm)
          }
        } else {
          entry.mesh.position.set(
            -length / 2 + (entry.box.x + entry.box.length / 2) * scale,
            (entry.box.z + entry.box.height / 2) * scale,
            -width / 2 + (entry.box.y + entry.box.width / 2) * scale,
          )
          entry.edges.position.copy(entry.mesh.position)
        }
        renderer.domElement.releasePointerCapture?.(event.pointerId)
        dragState = null
      }
      // restore controls based on viewLocked, not on manualEditable + freeView
      controls.enabled = !viewLockedRef.current
    }

    const onDragOver = (event: DragEvent) => {
      if (!manualEditableRef.current) return
      event.preventDefault()
      if (event.dataTransfer) {
        event.dataTransfer.dropEffect = 'copy'
      }
    }

    const onDrop = (event: DragEvent) => {
      if (!manualEditableRef.current) return
      event.preventDefault()
      const cargoId = event.dataTransfer?.getData('application/x-cargo-id') ?? event.dataTransfer?.getData('text/plain')
      if (!cargoId) return
      updatePointer(event)
      raycaster.setFromCamera(pointer, camera)
      if (!raycaster.ray.intersectPlane(groundPlane, intersectionPoint)) return
      const containerMm = worldToContainerMm(intersectionPoint.x, intersectionPoint.z)
      const x = gridSnapRef.current ? snapToGrid(containerMm.x) : containerMm.x
      const y = gridSnapRef.current ? snapToGrid(containerMm.y) : containerMm.y
      onManualDropFromPoolRef.current?.(cargoId, x, y)
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
        case 'r':
        case 'R':
          onManualRotateRef.current?.(boxId)
          break
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
        mCache.forEach((mat) => mat.dispose())
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

    const { activeLayerId: la, activeLabelId: lb, selectedBoxId: sb } = visualPropsRef.current
    boxes.forEach((box) => {
      const existing = meshEntries.get(box.id)
      const invalid = state.invalidOverride.has(box.id) || invalidBoxIdsRef.current.has(box.id)
      if (existing) {
        const sameSize = existing.box.length === box.length && existing.box.width === box.width && existing.box.height === box.height
        if (!sameSize) {
          existing.mesh.geometry.dispose()
          existing.edges.geometry.dispose()
          const geometry = new THREE.BoxGeometry(box.length * scale, box.height * scale, box.width * scale)
          existing.mesh.geometry = geometry
          existing.edges.geometry = new THREE.EdgesGeometry(geometry)
        }
        existing.mesh.position.set(
          -length / 2 + (box.x + box.length / 2) * scale,
          (box.z + box.height / 2) * scale,
          -width / 2 + (box.y + box.width / 2) * scale,
        )
        existing.edges.position.copy(existing.mesh.position)
        existing.box = box
        applyBoxVisualState(state, existing, la, lb, sb, invalid)
        return
      }
      const geometry = new THREE.BoxGeometry(box.length * scale, box.height * scale, box.width * scale)
      const visualState = boxVisualState(box, la, lb, sb, invalid)
      const material = getCachedBoxMaterial(state, box, visualState.selected, visualState.opacity, invalid)
      const mesh = new THREE.Mesh(geometry, material)
      mesh.position.set(
        -length / 2 + (box.x + box.length / 2) * scale,
        (box.z + box.height / 2) * scale,
        -width / 2 + (box.y + box.width / 2) * scale,
      )
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
      edges.position.copy(mesh.position)
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
  }, [viewMode])

  useEffect(() => {
    const state = sceneStateRef.current
    if (!state) return
    if (viewLocked) {
      state.controls.enabled = false
    } else if (manualEditable) {
      state.controls.enabled = true
      state.controls.mouseButtons = {
        LEFT: null,
        MIDDLE: THREE.MOUSE.DOLLY,
        RIGHT: THREE.MOUSE.ROTATE,
      }
    } else {
      state.controls.enabled = true
      state.controls.mouseButtons = {
        LEFT: THREE.MOUSE.ROTATE,
        MIDDLE: THREE.MOUSE.DOLLY,
        RIGHT: THREE.MOUSE.PAN,
      }
    }
  }, [manualEditable, viewLocked])

  useEffect(() => {
    const state = sceneStateRef.current
    if (!state) return
    const { activeLayerId: la, activeLabelId: lb, selectedBoxId: sb } = visualPropsRef.current
    state.meshEntries.forEach((entry) => {
      const invalid = state.invalidOverride.has(entry.box.id) || invalidBoxIdsRef.current.has(entry.box.id)
      applyBoxVisualState(state, entry, la, lb, sb, invalid)
    })
  }, [activeLayerId, activeLabelId, selectedBoxId, invalidBoxIds])

  const controlsEnabled = !viewLocked
  const interactionMode = viewLocked
    ? (manualEditable ? 'manual-locked' : 'locked')
    : (manualEditable ? 'manual' : 'free')

  return (
    <div
      ref={mountRef}
      className="h-full min-h-[420px] w-full"
      data-testid="container-scene"
      data-controls-enabled={controlsEnabled ? 'true' : 'false'}
      data-interaction-mode={interactionMode}
      data-grid-snap={gridSnap === false ? 'off' : 'on'}
      data-box-count={boxes.length}
    />
  )
}
