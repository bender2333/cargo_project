import { describe, expect, it } from 'vitest'
import { containers, formatCubicMeters, getContainerVolume } from '../data/containers'
import type { CargoItem } from '../types'
import { calculatePacking } from './packing'

const cargo = (overrides: Partial<CargoItem> = {}): CargoItem => ({
  id: 'cargo-1',
  name: 'Box',
  label: 'A',
  length: 1000,
  width: 1000,
  height: 1000,
  weight: 100,
  quantity: 1,
  color: '#f59e0b',
  canRotate: true,
  stackable: true,
  ...overrides,
})

describe('container specs', () => {
  it('matches EasyCargo captured container dimensions', () => {
    expect(containers.map((container) => container.label)).toEqual(["Container 20'", "Container 40'", "Container 40' HC"])
    expect(containers[0]).toMatchObject({ length: 5758, width: 2352, height: 2385, maxWeight: 28200 })
    expect(containers[2]).toMatchObject({ length: 12117, width: 2388, height: 2694, maxWeight: 29600 })
  })

  it('formats cubic millimeters as cubic meters', () => {
    expect(formatCubicMeters(1_000_000_000)).toBe('1.00 m³')
    expect(getContainerVolume(containers[0])).toBe(5758 * 2352 * 2385)
  })
})

describe('calculatePacking', () => {
  it('places cargo and reports utilization', () => {
    const result = calculatePacking(containers[0], [cargo({ quantity: 2 })])

    expect(result.placedCount).toBe(2)
    expect(result.totalCargoCount).toBe(2)
    expect(result.volumeUtilization).toBeGreaterThan(0)
    expect(result.weightUtilization).toBeCloseTo((200 / 28200) * 100)
    expect(result.unplaced).toEqual([])
    expect(result.placed[0].label).toBe('A')
  })

  it('uses bottom-left-fill extreme points instead of a single inner-wall row', () => {
    const result = calculatePacking(containers[0], [
      cargo({ id: 'wide', label: 'A', length: 2500, width: 1000, height: 500, quantity: 1 }),
      cargo({ id: 'small', label: 'B', length: 1000, width: 1000, height: 500, quantity: 4 }),
    ])

    expect(result.placedCount).toBe(5)
    expect(new Set(result.placed.map((box) => box.y)).size).toBeGreaterThan(1)
  })

  it('supports gravity-stable stacking on top of fully supported boxes', () => {
    const result = calculatePacking(containers[0], [
      cargo({ id: 'base-a', label: 'A', length: containers[0].length, width: containers[0].width, height: 500, quantity: 1, canRotate: false }),
      cargo({ id: 'top', label: 'B', length: containers[0].length, width: containers[0].width, height: 500, quantity: 1, canRotate: false }),
    ])

    expect(result.placed.some((box) => box.z > 0)).toBe(true)
    expect(result.placed.filter((box) => box.z === 0).length).toBe(1)
  })

  it('does not stack on boxes marked as non-stackable', () => {
    const result = calculatePacking(containers[0], [
      cargo({ id: 'base-a', label: 'A', length: containers[0].length, width: containers[0].width, height: 500, quantity: 1, canRotate: false, stackable: false }),
      cargo({ id: 'top', label: 'B', length: containers[0].length, width: containers[0].width, height: 500, quantity: 1, canRotate: false }),
    ])

    expect(result.placed.some((box) => box.z > 0)).toBe(false)
    expect(result.unplaced[0]).toMatchObject({ quantity: 1, reason: 'No remaining loading space' })
  })

  it('rejects boxes that exceed dimensions', () => {
    const result = calculatePacking(containers[0], [cargo({ length: 9000 })])

    expect(result.placedCount).toBe(0)
    expect(result.unplaced[0]).toMatchObject({ quantity: 1, reason: 'Exceeds container dimensions' })
  })

  it('rejects boxes after payload is exhausted', () => {
    const result = calculatePacking(containers[0], [cargo({ weight: 20_000, quantity: 2 })])

    expect(result.placedCount).toBe(1)
    expect(result.unplaced[0]).toMatchObject({ quantity: 1, reason: 'Exceeds maximum payload' })
  })
})
