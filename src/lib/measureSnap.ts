import type { ContainerSpec, PlacedBox } from '../types'
import type { Point3D } from './measurement'

export type MeasurementSnapTarget = 'box-corner' | 'box-edge' | 'container-wall' | 'free'

export type MeasurementSnapResult = {
  point: Point3D
  target: MeasurementSnapTarget
  distance: number
}

type SnapInput = {
  point: Point3D
  boxes: Array<Pick<PlacedBox, 'x' | 'y' | 'z' | 'length' | 'width' | 'height'>>
  container: Pick<ContainerSpec, 'length' | 'width' | 'height'>
  thresholdMm?: number
}

function distance(a: Point3D, b: Point3D) {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z)
}

function cornersForBox(box: SnapInput['boxes'][number]): Point3D[] {
  const xs = [box.x, box.x + box.length]
  const ys = [box.y, box.y + box.width]
  const zs = [box.z, box.z + box.height]
  return xs.flatMap((x) => ys.flatMap((y) => zs.map((z) => ({ x, y, z }))))
}

function edgeMidpointsForBox(box: SnapInput['boxes'][number]): Point3D[] {
  const x0 = box.x
  const x1 = box.x + box.length
  const y0 = box.y
  const y1 = box.y + box.width
  const z0 = box.z
  const z1 = box.z + box.height
  const xm = box.x + box.length / 2
  const ym = box.y + box.width / 2
  const zm = box.z + box.height / 2
  return [
    { x: xm, y: y0, z: z0 }, { x: xm, y: y1, z: z0 }, { x: xm, y: y0, z: z1 }, { x: xm, y: y1, z: z1 },
    { x: x0, y: ym, z: z0 }, { x: x1, y: ym, z: z0 }, { x: x0, y: ym, z: z1 }, { x: x1, y: ym, z: z1 },
    { x: x0, y: y0, z: zm }, { x: x1, y: y0, z: zm }, { x: x0, y: y1, z: zm }, { x: x1, y: y1, z: zm },
  ]
}

function wallProjections(point: Point3D, container: SnapInput['container']): Point3D[] {
  return [
    { ...point, x: 0 },
    { ...point, x: container.length },
    { ...point, y: 0 },
    { ...point, y: container.width },
    { ...point, z: 0 },
    { ...point, z: container.height },
  ]
}

function bestWithin(point: Point3D, candidates: Point3D[], target: MeasurementSnapTarget, thresholdMm: number): MeasurementSnapResult | null {
  let best: MeasurementSnapResult | null = null
  for (const candidate of candidates) {
    const candidateDistance = distance(point, candidate)
    if (candidateDistance > thresholdMm) continue
    if (!best || candidateDistance < best.distance) {
      best = { point: candidate, target, distance: candidateDistance }
    }
  }
  return best
}

export function snapMeasurementPoint3D(input: SnapInput): MeasurementSnapResult {
  const thresholdMm = input.thresholdMm ?? 80
  const corners = input.boxes.flatMap(cornersForBox)
  const corner = bestWithin(input.point, corners, 'box-corner', thresholdMm)
  if (corner) return corner

  const edges = input.boxes.flatMap(edgeMidpointsForBox)
  const edge = bestWithin(input.point, edges, 'box-edge', thresholdMm)
  if (edge) return edge

  const wall = bestWithin(input.point, wallProjections(input.point, input.container), 'container-wall', thresholdMm)
  if (wall) return wall

  return { point: { ...input.point }, target: 'free', distance: 0 }
}
