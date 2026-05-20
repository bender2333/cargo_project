import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import type { ContainerSpec, PlacedBox } from '../types'

export type SceneViewMode = 'iso' | 'top' | 'front' | 'side'

type ContainerSceneProps = {
  container: ContainerSpec
  boxes: PlacedBox[]
  activeLayerId: string
  viewMode: SceneViewMode
  selectedBoxId?: string | null
  onSelectBox?: (boxId: string) => void
}

function makeFaceLabelTexture(label: string, color: string, selected: boolean) {
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
  context.fillText(label, 128, 134, 142)

  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  return texture
}

function makeBoxMaterials(box: PlacedBox, selected: boolean, opacity: number) {
  const texture = makeFaceLabelTexture(box.label, box.color, selected)
  return Array.from(
    { length: 6 },
    () =>
      new THREE.MeshStandardMaterial({
        map: texture,
        roughness: 0.58,
        metalness: 0.04,
        emissive: selected ? new THREE.Color(0x332100) : new THREE.Color(0x000000),
        transparent: opacity < 1,
        opacity,
      }),
  )
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

export function ContainerScene({ container, boxes, activeLayerId, viewMode, selectedBoxId, onSelectBox }: ContainerSceneProps) {
  const mountRef = useRef<HTMLDivElement | null>(null)

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
    renderer.setPixelRatio(window.devicePixelRatio)
    renderer.setSize(mount.clientWidth, mount.clientHeight)
    renderer.shadowMap.enabled = true
    mount.appendChild(renderer.domElement)

    const controls = new OrbitControls(camera, renderer.domElement)
    controls.enableDamping = true
    controls.target.copy(target)
    controls.maxDistance = 45

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

    boxes.forEach((box) => {
      const geometry = new THREE.BoxGeometry(box.length * scale, box.height * scale, box.width * scale)
      const selected = box.id === selectedBoxId
      const currentLayer = activeLayerId === 'all' || String(box.physicalLayer) === activeLayerId
      const opacity = selected || currentLayer ? 0.94 : 0.22
      const material = makeBoxMaterials(box, selected, opacity)
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
          color: selected ? 0xf3b21a : currentLayer ? 0x252525 : 0x777777,
          transparent: true,
          opacity: selected || currentLayer ? 0.72 : 0.18,
        }),
      )
      edges.position.copy(mesh.position)
      scene.add(edges)
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
      renderer.dispose()
      renderer.domElement.removeEventListener('pointerdown', onPointerDown)
      mount.removeChild(renderer.domElement)
    }
  }, [container, boxes, activeLayerId, viewMode, selectedBoxId, onSelectBox])

  return <div ref={mountRef} className="h-full min-h-[420px] w-full" data-testid="container-scene" />
}
