import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import type { ContainerSpec, PlacedBox } from '../types'

export type SceneViewMode = 'iso' | 'top' | 'front' | 'side'

type ContainerSceneProps = {
  container: ContainerSpec
  boxes: PlacedBox[]
  activeLayerId: string
  activeLabelId: string
  viewMode: SceneViewMode
  freeView?: boolean
  selectedBoxId?: string | null
  onSelectBox?: (boxId: string) => void
  invalidBoxIds?: Set<string>
}

type MeshEntry = {
  box: PlacedBox
  mesh: THREE.Mesh
  edges: THREE.LineSegments
}

const textureCache = new Map<string, THREE.Texture>()
const materialCache = new Map<string, THREE.Material>()

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

function getCachedBoxMaterial(box: PlacedBox, selected: boolean, opacity: number, invalid: boolean) {
  const textureKey = `${box.label}:${box.color}:${selected}:${box.labelRotationDeg}`
  let texture = textureCache.get(textureKey)
  if (!texture) {
    texture = makeFaceLabelTexture(box.label, box.color, selected, box.labelRotationDeg)
    textureCache.set(textureKey, texture)
  }

  const materialKey = `${textureKey}:${opacity}:${invalid ? 'inv' : 'ok'}`
  const cached = materialCache.get(materialKey)
  if (cached) {
    return cached
  }

  const material = makeBoxMaterial(texture, selected, opacity, invalid)
  materialCache.set(materialKey, material)
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
  entry: MeshEntry,
  activeLayerId: string,
  activeLabelId: string,
  selectedBoxId: string | null | undefined,
  invalid: boolean,
) {
  const state = boxVisualState(entry.box, activeLayerId, activeLabelId, selectedBoxId, invalid)
  entry.mesh.material = getCachedBoxMaterial(entry.box, state.selected, state.opacity, state.invalid)
  const material = entry.edges.material
  if (material instanceof THREE.LineBasicMaterial) {
    material.color.setHex(state.edgeColor)
    material.opacity = state.edgeOpacity
    material.transparent = state.edgeOpacity < 1
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

export function ContainerScene({ container, boxes, activeLayerId, activeLabelId, viewMode, freeView, selectedBoxId, onSelectBox, invalidBoxIds }: ContainerSceneProps) {
  const mountRef = useRef<HTMLDivElement | null>(null)
  const meshEntriesRef = useRef<Map<string, MeshEntry>>(new Map())
  const invalidBoxIdsRef = useRef<Set<string>>(invalidBoxIds ?? new Set())

  useEffect(() => {
    invalidBoxIdsRef.current = invalidBoxIds ?? new Set()
  }, [invalidBoxIds])

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
    controls.enabled = freeView ?? false

    const ambient = new THREE.HemisphereLight(0xffffff, 0x8d8d8d, 2.4)
    scene.add(ambient)

    const key = new THREE.DirectionalLight(0xffffff, 2.1)
    key.position.set(7, 10, 5)
    key.castShadow = true
    scene.add(key)

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

    const pickables: THREE.Mesh[] = []
    const boxByUuid = new Map<string, string>()
    const meshEntries = new Map<string, MeshEntry>()
    meshEntriesRef.current = meshEntries

    boxes.forEach((box) => {
      const geometry = new THREE.BoxGeometry(box.length * scale, box.height * scale, box.width * scale)
      const invalid = invalidBoxIdsRef.current.has(box.id)
      const visualState = boxVisualState(box, 'all', 'all', null, invalid)
      const material = getCachedBoxMaterial(box, visualState.selected, visualState.opacity, invalid)
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

    const grid = new THREE.GridHelper(Math.max(length, width), 16, 0x8b8b8b, 0xbdbdbd)
    grid.position.y = 0.002
    scene.add(grid)

    const resize = () => {
      if (!mount.clientWidth || !mount.clientHeight) {
        return
      }
      camera.aspect = mount.clientWidth / mount.clientHeight
      camera.updateProjectionMatrix()
      renderer.setSize(mount.clientWidth, mount.clientHeight)
    }

    const observer = new ResizeObserver(resize)
    observer.observe(mount)

    const raycaster = new THREE.Raycaster()
    const pointer = new THREE.Vector2()
    const onPointerDown = (event: PointerEvent) => {
      if (!onSelectBox) {
        return
      }
      const rect = renderer.domElement.getBoundingClientRect()
      pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1
      pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1
      raycaster.setFromCamera(pointer, camera)
      const hit = raycaster.intersectObjects(pickables, false)[0]
      const boxId = hit ? boxByUuid.get(hit.object.uuid) : undefined
      if (boxId) {
        onSelectBox(boxId)
      }
    }
    renderer.domElement.addEventListener('pointerdown', onPointerDown)

    let frame = 0
    const animate = () => {
      frame = requestAnimationFrame(animate)
      controls.update()
      renderer.render(scene, camera)
    }
    animate()

    return () => {
      cancelAnimationFrame(frame)
      observer.disconnect()
      controls.dispose()
      const geometries = new Set<THREE.BufferGeometry>()
      scene.traverse((object) => {
        if (object instanceof THREE.Mesh || object instanceof THREE.LineSegments) {
          geometries.add(object.geometry)
        }
      })
      geometries.forEach((geometry) => geometry.dispose())
      meshEntries.clear()
      if (meshEntriesRef.current === meshEntries) {
        meshEntriesRef.current = new Map()
      }
      renderer.dispose()
      renderer.domElement.removeEventListener('pointerdown', onPointerDown)
      mount.removeChild(renderer.domElement)
    }
  }, [container, boxes, viewMode, freeView, onSelectBox])

  useEffect(() => {
    meshEntriesRef.current.forEach((entry) => {
      const invalid = invalidBoxIdsRef.current.has(entry.box.id)
      applyBoxVisualState(entry, activeLayerId, activeLabelId, selectedBoxId, invalid)
    })
  }, [activeLayerId, activeLabelId, selectedBoxId, invalidBoxIds])

  return <div ref={mountRef} className="h-full min-h-[420px] w-full" data-testid="container-scene" />
}
