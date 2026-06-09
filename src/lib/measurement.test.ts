import { describe, expect, it } from 'vitest'
import type { ContainerSpec, PlacedBox } from '../types'
import {
  deriveClearanceAnnotations,
  createMeasurementAnnotation,
  deleteMeasurementAnnotation,
  formatMeasurement,
  measureBoxClearance,
  measureDistance,
  renameMeasurementAnnotation,
} from './measurement'

const container: ContainerSpec = {
  id: 'c',
  label: 'C',
  description: '',
  length: 5000,
  width: 2000,
  height: 2200,
  maxWeight: 10000,
  doorGap: 0,
  topGap: 0,
  sideGap: 0,
}

function box(overrides: Partial<PlacedBox>): PlacedBox {
  return {
    id: 'a',
    cargoId: 'cargo',
    name: 'A',
    label: 'A',
    index: 1,
    x: 100,
    y: 200,
    z: 300,
    length: 1000,
    width: 500,
    height: 600,
    orientationKey: 'LWH',
    labelRotationDeg: 0,
    weight: 1,
    color: '#000',
    canRotate: true,
    stackable: true,
    physicalLayer: 1,
    workStep: 1,
    supportType: 'floor',
    supportedBy: [],
    ...overrides,
  }
}

describe('measurement', () => {
  it('measures selected box clearance to container walls and ceiling', () => {
    const selected = box({})

    const clearance = measureBoxClearance(selected, container, [selected])

    expect(clearance).toMatchObject({
      front: 100,
      door: 3900,
      left: 200,
      right: 1300,
      floor: 300,
      top: 1300,
    })
  })

  it('reports nearest neighboring gaps on overlapping axes', () => {
    const selected = box({ id: 'selected' })
    const neighborX = box({ id: 'x', x: 1300, y: 250, z: 320, length: 400, width: 400, height: 200 })
    const neighborY = box({ id: 'y', x: 200, y: 850, z: 320, length: 400, width: 300, height: 200 })
    const ignored = box({ id: 'ignored', x: 1300, y: 1200, z: 320, length: 400, width: 300, height: 200 })

    const clearance = measureBoxClearance(selected, container, [selected, neighborX, neighborY, ignored])

    expect(clearance.nearestX).toBe(200)
    expect(clearance.nearestY).toBe(150)
  })

  it('derives visible clearance directions and hides contact within epsilon', () => {
    const selected = box({ id: 'selected', x: 0, y: 200, z: 0 })
    const clearance = measureBoxClearance(selected, container, [selected])

    const annotations = deriveClearanceAnnotations(clearance, 'zh')

    expect(annotations.map((item) => item.direction)).not.toContain('front')
    expect(annotations.map((item) => item.direction)).not.toContain('floor')
    expect(annotations.find((item) => item.direction === 'left')).toMatchObject({
      value: 200,
      target: 'wall',
      label: '左侧 200 mm',
    })
  })

  it('uses the smaller usable gap between container wall and nearest neighbor', () => {
    const selected = box({ id: 'selected', x: 100, y: 100, z: 100, length: 1000, width: 500, height: 600 })
    const neighborTowardDoor = box({ id: 'door-neighbor', x: 1300, y: 120, z: 150, length: 400, width: 300, height: 300 })
    const neighborRight = box({ id: 'right-neighbor', x: 200, y: 900, z: 150, length: 400, width: 300, height: 300 })
    const clearance = measureBoxClearance(selected, container, [selected, neighborTowardDoor, neighborRight])

    const annotations = deriveClearanceAnnotations(clearance, 'en')

    expect(annotations.find((item) => item.direction === 'door')).toMatchObject({
      value: 200,
      target: 'neighbor',
      label: 'door 200 mm',
    })
    expect(annotations.find((item) => item.direction === 'right')).toMatchObject({
      value: 300,
      target: 'neighbor',
    })
  })

  it('treats one millimeter as contact and two millimeters as visible clearance', () => {
    const annotations = deriveClearanceAnnotations({
      left: 1,
      right: 2,
      front: 1,
      door: 2,
      floor: 1,
      top: 2,
      nearestX: null,
      nearestY: null,
      nearestZ: null,
      nearestLeft: null,
      nearestRight: null,
      nearestFront: null,
      nearestDoor: null,
      nearestFloor: null,
      nearestTop: null,
    }, 'en')

    expect(annotations.map((item) => item.direction).sort()).toEqual(['door', 'right', 'top'])
  })

  it('measures 3D point distance', () => {
    expect(measureDistance({ x: 0, y: 0, z: 0 }, { x: 300, y: 400, z: 1200 })).toBe(1300)
  })

  it('formats measurements in mm, m, and empty state', () => {
    expect(formatMeasurement(245, 'zh')).toBe('245 mm')
    expect(formatMeasurement(1500, 'en')).toBe('1.50 m')
    expect(formatMeasurement(null, 'zh')).toBe('无')
  })

  it('creates fixed measurement annotations with calculated distance and axis', () => {
    const annotation = createMeasurementAnnotation({
      id: 'm-1',
      from: { x: 0, y: 0, z: 0 },
      to: { x: 300, y: 400, z: 0 },
      label: 'door gap',
      axis: 'spatial',
    })

    expect(annotation).toMatchObject({
      id: 'm-1',
      axis: 'spatial',
      distance: 500,
      locked: true,
      label: 'door gap',
      hidden: false,
    })
  })

  it('renames and deletes measurement annotations without mutating the original list', () => {
    const first = createMeasurementAnnotation({
      id: 'm-1',
      from: { x: 0, y: 0, z: 0 },
      to: { x: 100, y: 0, z: 0 },
      axis: 'x',
    })
    const second = createMeasurementAnnotation({
      id: 'm-2',
      from: { x: 0, y: 0, z: 0 },
      to: { x: 0, y: 250, z: 0 },
      axis: 'y',
    })
    const list = [first, second]

    const renamed = renameMeasurementAnnotation(list, 'm-2', 'side clearance')
    const deleted = deleteMeasurementAnnotation(renamed, 'm-1')

    expect(list[1].label).not.toBe('side clearance')
    expect(renamed[1]).toMatchObject({ id: 'm-2', label: 'side clearance' })
    expect(deleted).toEqual([expect.objectContaining({ id: 'm-2' })])
  })
})
