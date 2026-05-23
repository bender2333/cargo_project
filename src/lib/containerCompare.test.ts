import { describe, expect, it } from 'vitest'
import { compareContainers } from './containerCompare'
import type { CargoItem, ContainerSpec } from '../types'

function makeContainer(id: string, length: number, width: number, height: number): ContainerSpec {
  return {
    id,
    label: id.toUpperCase(),
    description: '',
    length,
    width,
    height,
    maxWeight: 30000,
    doorGap: 0,
    topGap: 0,
    sideGap: 0,
  }
}

const baseCargo: CargoItem = {
  id: 'item1',
  label: 'A',
  name: 'Box',
  color: '#000',
  length: 1000,
  width: 1000,
  height: 1000,
  weight: 100,
  quantity: 5,
  stackable: true,
  canRotate: true,
}

describe('compareContainers', () => {
  it('returns one row per container preserving the input order', () => {
    const a = makeContainer('a', 3000, 2000, 2000)
    const b = makeContainer('b', 5000, 2000, 2000)
    const c = makeContainer('c', 2000, 2000, 2000)
    const rows = compareContainers([a, b, c], [baseCargo], 'quantity')
    expect(rows.map((r) => r.container.id)).toEqual(['a', 'b', 'c'])
  })

  it('classifies fit as full when all cargo placed', () => {
    const tiny = { ...baseCargo, quantity: 1 }
    const big = makeContainer('big', 12000, 2300, 2300)
    const rows = compareContainers([big], [tiny], 'quantity')
    expect(rows[0].fit).toBe('full')
    expect(rows[0].unplacedCount).toBe(0)
  })

  it('classifies fit as none when total cargo count is zero', () => {
    const big = makeContainer('big', 12000, 2300, 2300)
    const rows = compareContainers([big], [], 'quantity')
    expect(rows[0].fit).toBe('none')
    expect(rows[0].placedCount).toBe(0)
    expect(rows[0].totalCargoCount).toBe(0)
  })

  it('classifies fit as partial when only part of the cargo fits', () => {
    const tooSmall = makeContainer('s', 1500, 1500, 1500)
    const rows = compareContainers([tooSmall], [baseCargo], 'quantity')
    expect(rows[0].fit).toBe('partial')
    expect(rows[0].placedCount).toBeGreaterThan(0)
    expect(rows[0].unplacedCount).toBeGreaterThan(0)
  })

  it('classifies fit as none when not a single box fits', () => {
    const tiny = makeContainer('xs', 500, 500, 500)
    const rows = compareContainers([tiny], [baseCargo], 'quantity')
    expect(rows[0].fit).toBe('none')
    expect(rows[0].placedCount).toBe(0)
  })

  it('exposes utilization percentages within [0,100]', () => {
    const big = makeContainer('big', 12000, 2300, 2300)
    const rows = compareContainers([big], [baseCargo], 'quantity')
    expect(rows[0].volumeUtilization).toBeGreaterThanOrEqual(0)
    expect(rows[0].volumeUtilization).toBeLessThanOrEqual(100)
    expect(rows[0].weightUtilization).toBeGreaterThanOrEqual(0)
    expect(rows[0].weightUtilization).toBeLessThanOrEqual(100)
  })
})
