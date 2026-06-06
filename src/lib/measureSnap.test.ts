import { describe, expect, it } from 'vitest'
import type { ContainerSpec, PlacedBox } from '../types'
import { snapMeasurementPoint3D } from './measureSnap'

function container(overrides: Partial<ContainerSpec> = {}): ContainerSpec {
  return {
    id: 'test',
    label: 'Test container',
    description: '',
    length: 1000,
    width: 800,
    height: 600,
    maxWeight: 20000,
    doorGap: 0,
    topGap: 0,
    sideGap: 0,
    ...overrides,
  }
}

const box: PlacedBox = {
  id: 'box-1',
  cargoId: 'cargo-a',
  label: 'A',
  color: '#f59e0b',
  name: 'Carton A',
  x: 100,
  y: 200,
  z: 0,
  length: 300,
  width: 200,
  height: 150,
  weight: 10,
  index: 1,
  physicalLayer: 1,
  workStep: 1,
  supportType: 'floor',
  supportedBy: [],
  orientationKey: 'LWH',
  labelRotationDeg: 0,
  canRotate: true,
  stackable: true,
}

describe('snapMeasurementPoint3D', () => {
  it('snaps nearby points to a placed box corner', () => {
    const snapped = snapMeasurementPoint3D({
      point: { x: 96, y: 204, z: 3 },
      boxes: [box],
      container: container(),
      thresholdMm: 12,
    })

    expect(snapped.point).toEqual({ x: 100, y: 200, z: 0 })
    expect(snapped.target).toBe('box-corner')
  })

  it('snaps nearby points to a placed box edge midpoint', () => {
    const snapped = snapMeasurementPoint3D({
      point: { x: 251, y: 201, z: 0 },
      boxes: [box],
      container: container(),
      thresholdMm: 12,
    })

    expect(snapped.point).toEqual({ x: 250, y: 200, z: 0 })
    expect(snapped.target).toBe('box-edge')
  })

  it('snaps nearby points to the closest container wall', () => {
    const snapped = snapMeasurementPoint3D({
      point: { x: 997, y: 400, z: 100 },
      boxes: [box],
      container: container(),
      thresholdMm: 8,
    })

    expect(snapped.point).toEqual({ x: 1000, y: 400, z: 100 })
    expect(snapped.target).toBe('container-wall')
  })

  it('keeps the original point when no snap target is within threshold', () => {
    const snapped = snapMeasurementPoint3D({
      point: { x: 650, y: 620, z: 210 },
      boxes: [box],
      container: container(),
      thresholdMm: 10,
    })

    expect(snapped.point).toEqual({ x: 650, y: 620, z: 210 })
    expect(snapped.target).toBe('free')
  })
})
