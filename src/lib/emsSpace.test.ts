import { describe, expect, it } from 'vitest'
import type { ContainerSpec } from '../types'
import { emsBestFit, initEMS, pruneContained, splitEMS } from './emsSpace'
import type { EmptyMaximalSpace } from './emsSpace'

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

function containsPoint(ems: EmptyMaximalSpace, point: { x: number; y: number; z: number }): boolean {
  return point.x >= ems.x && point.x < ems.x + ems.length
    && point.y >= ems.y && point.y < ems.y + ems.width
    && point.z >= ems.z && point.z < ems.z + ems.height
}

function hasContainedPair(spaces: EmptyMaximalSpace[]): boolean {
  return spaces.some((outer, outerIndex) => spaces.some((inner, innerIndex) => (
    outerIndex !== innerIndex
      && outer.x <= inner.x
      && outer.y <= inner.y
      && outer.z <= inner.z
      && outer.x + outer.length >= inner.x + inner.length
      && outer.y + outer.width >= inner.y + inner.width
      && outer.z + outer.height >= inner.z + inner.height
  )))
}

describe('EMS space model', () => {
  it('starts with one empty space matching the usable container box', () => {
    expect(initEMS(container())).toEqual([
      { x: 0, y: 0, z: 0, length: 1000, width: 800, height: 600 },
    ])
  })

  it('splits a corner block into addressable L-shaped remainder spaces without contained EMS', () => {
    const spaces = splitEMS(initEMS(container({ height: 500 })), {
      x: 0,
      y: 0,
      z: 0,
      length: 400,
      width: 300,
      height: 500,
    })

    expect(spaces).toEqual(expect.arrayContaining([
      { x: 400, y: 0, z: 0, length: 600, width: 800, height: 500 },
      { x: 0, y: 300, z: 0, length: 1000, width: 500, height: 500 },
    ]))
    expect(hasContainedPair(spaces)).toBe(false)
    expect(spaces.some((ems) => containsPoint(ems, { x: 450, y: 100, z: 100 }))).toBe(true)
    expect(spaces.some((ems) => containsPoint(ems, { x: 100, y: 350, z: 100 }))).toBe(true)
    expect(spaces.some((ems) => containsPoint(ems, { x: 100, y: 100, z: 100 }))).toBe(false)
  })

  it('keeps the gap between two separated full-width blocks as its own EMS', () => {
    const afterLeftBlock = splitEMS(initEMS(container({ length: 1000, width: 100, height: 100 })), {
      x: 0,
      y: 0,
      z: 0,
      length: 200,
      width: 100,
      height: 100,
    })
    const afterRightBlock = splitEMS(afterLeftBlock, {
      x: 800,
      y: 0,
      z: 0,
      length: 200,
      width: 100,
      height: 100,
    })

    expect(afterRightBlock).toContainEqual({ x: 200, y: 0, z: 0, length: 600, width: 100, height: 100 })
  })

  it('prunes EMS fully contained by another empty box', () => {
    expect(pruneContained([
      { x: 0, y: 0, z: 0, length: 1000, width: 800, height: 600 },
      { x: 100, y: 100, z: 0, length: 200, width: 200, height: 200 },
      { x: 0, y: 0, z: 0, length: 1000, width: 800, height: 600 },
    ])).toEqual([
      { x: 0, y: 0, z: 0, length: 1000, width: 800, height: 600 },
    ])
  })

  it('chooses the fitting EMS with the least wasted volume at that EMS origin', () => {
    const best = emsBestFit([
      { x: 0, y: 0, z: 0, length: 1000, width: 800, height: 600 },
      { x: 2000, y: 0, z: 0, length: 500, width: 500, height: 500 },
      { x: 0, y: 2000, z: 0, length: 400, width: 600, height: 400 },
    ], { length: 400, width: 500, height: 400 })

    expect(best).toMatchObject({
      ems: { x: 0, y: 2000, z: 0, length: 400, width: 600, height: 400 },
      point: { x: 0, y: 2000, z: 0 },
      waste: 16_000_000,
    })
  })
})
