import * as THREE from 'three'
import type { ContainerSpec, PlacedBox } from '../types'

export type IsoSnapshotOptions = {
  boxes: PlacedBox[]
  highlightIds: Set<string>
  container: ContainerSpec
  width: number
  height: number
}

const MM_TO_WORLD = 1 / 1000

function worldCenterForBox(box: PlacedBox, container: ContainerSpec) {
  const length = container.length * MM_TO_WORLD
  const width = container.width * MM_TO_WORLD
  return new THREE.Vector3(
    -length / 2 + (box.x + box.length / 2) * MM_TO_WORLD,
    (box.z + box.height / 2) * MM_TO_WORLD,
    -width / 2 + (box.y + box.width / 2) * MM_TO_WORLD,
  )
}

function disposeScene(scene: THREE.Scene) {
  const disposedMaterials = new Set<THREE.Material>()
  scene.traverse((object) => {
    if (object instanceof THREE.Mesh || object instanceof THREE.LineSegments) {
      object.geometry.dispose()
      const materials = Array.isArray(object.material) ? object.material : [object.material]
      for (const material of materials) {
        if (disposedMaterials.has(material)) continue
        material.dispose()
        disposedMaterials.add(material)
      }
    }
  })
}

export function renderIsoSnapshot({ boxes, highlightIds, container, width, height }: IsoSnapshotOptions): string {
  const safeWidth = Math.max(1, Math.floor(width))
  const safeHeight = Math.max(1, Math.floor(height))
  const scene = new THREE.Scene()
  scene.background = new THREE.Color(0xf8fafc)

  const renderer = new THREE.WebGLRenderer({
    antialias: true,
    alpha: false,
    preserveDrawingBuffer: true,
  })
  renderer.setSize(safeWidth, safeHeight, false)
  renderer.setPixelRatio(1)
  renderer.outputColorSpace = THREE.SRGBColorSpace

  const length = container.length * MM_TO_WORLD
  const cargoWidth = container.width * MM_TO_WORLD
  const cargoHeight = container.height * MM_TO_WORLD
  const target = new THREE.Vector3(0, cargoHeight / 2, 0)
  const maxDimension = Math.max(length, cargoWidth, cargoHeight, 1)
  const aspect = safeWidth / safeHeight
  const viewSize = maxDimension * 1.35
  const camera = new THREE.OrthographicCamera(
    (-viewSize * aspect) / 2,
    (viewSize * aspect) / 2,
    viewSize / 2,
    -viewSize / 2,
    0.1,
    maxDimension * 8,
  )
  const azimuth = Math.PI / 4
  const elevation = THREE.MathUtils.degToRad(35)
  const distance = maxDimension * 3
  camera.position.set(
    Math.cos(elevation) * Math.cos(azimuth) * distance,
    target.y + Math.sin(elevation) * distance,
    Math.cos(elevation) * Math.sin(azimuth) * distance,
  )
  camera.lookAt(target)

  scene.add(new THREE.HemisphereLight(0xffffff, 0x64748b, 2.3))
  const keyLight = new THREE.DirectionalLight(0xffffff, 2.0)
  keyLight.position.set(maxDimension, maxDimension * 2, maxDimension)
  scene.add(keyLight)

  const shellGeometry = new THREE.BoxGeometry(length, cargoHeight, cargoWidth)
  const shellEdges = new THREE.EdgesGeometry(shellGeometry)
  shellGeometry.dispose()
  const shell = new THREE.LineSegments(
    shellEdges,
    new THREE.LineBasicMaterial({ color: 0x334155 }),
  )
  shell.position.set(0, cargoHeight / 2, 0)
  scene.add(shell)

  const orderedBoxes = [...boxes].sort((a, b) => Number(highlightIds.has(a.id)) - Number(highlightIds.has(b.id)))
  for (const box of orderedBoxes) {
    const highlighted = highlightIds.has(box.id)
    const geometry = new THREE.BoxGeometry(
      Math.max(0.001, box.length * MM_TO_WORLD),
      Math.max(0.001, box.height * MM_TO_WORLD),
      Math.max(0.001, box.width * MM_TO_WORLD),
    )
    const mesh = new THREE.Mesh(
      geometry,
      new THREE.MeshStandardMaterial({
        color: new THREE.Color(highlighted ? box.color : '#475569'),
        roughness: 0.68,
        metalness: 0,
        transparent: true,
        opacity: highlighted ? 0.96 : 0.25,
        depthWrite: highlighted,
      }),
    )
    mesh.position.copy(worldCenterForBox(box, container))
    scene.add(mesh)
    const edges = new THREE.LineSegments(
      new THREE.EdgesGeometry(geometry),
      new THREE.LineBasicMaterial({
        color: highlighted ? 0x0f172a : 0x94a3b8,
        transparent: true,
        opacity: highlighted ? 0.95 : 0.35,
      }),
    )
    edges.position.copy(mesh.position)
    scene.add(edges)
  }

  try {
    renderer.render(scene, camera)
    return renderer.domElement.toDataURL('image/png')
  } finally {
    disposeScene(scene)
    renderer.dispose()
    renderer.forceContextLoss()
  }
}
