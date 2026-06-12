import { describe, expect, it } from 'vitest'
import { snapGuides } from './snapGuides'
import type { PlacedBox, ContainerSpec } from '../types'

function container(): Pick<ContainerSpec, 'length' | 'width'> {
  return { length: 12000, width: 2400 }
}

function placedBox(overrides: Partial<PlacedBox> & { id: string; x: number; y: number; length: number; width: number }): Pick<PlacedBox, 'id' | 'x' | 'y' | 'length' | 'width'> {
  return { id: overrides.id, x: overrides.x, y: overrides.y, length: overrides.length, width: overrides.width }
}

describe('snapGuides', () => {
  it('returns a wall guide when snapped to container front wall (x=0)', () => {
    const guides = snapGuides({
      x: 0, y: 200, length: 1000, width: 1000,
      snappedAxes: ['x'],
      others: [],
      container: container(),
    })
    expect(guides).toHaveLength(1)
    expect(guides[0]).toMatchObject({ axis: 'x', coordinate: 0, kind: 'wall' })
  })

  it('returns a wall guide when snapped to container rear wall', () => {
    const c = container()
    const guides = snapGuides({
      x: c.length - 800, y: 200, length: 800, width: 1000,
      snappedAxes: ['x'],
      others: [],
      container: c,
    })
    expect(guides).toHaveLength(1)
    expect(guides[0]).toMatchObject({ axis: 'x', coordinate: c.length, kind: 'wall' })
  })

  it('returns a center guide when snapped to container centerline', () => {
    const c = container()
    const guides = snapGuides({
      x: (c.length - 600) / 2, y: 200, length: 600, width: 500,
      snappedAxes: ['x'],
      others: [],
      container: c,
    })
    expect(guides).toHaveLength(1)
    expect(guides[0]).toMatchObject({ axis: 'x', coordinate: c.length / 2, kind: 'center' })
  })

  it('returns a neighbor-edge guide when snapped to a neighbor left edge', () => {
    const others = [placedBox({ id: 'n1', x: 3000, y: 0, length: 1000, width: 1000 })]
    const guides = snapGuides({
      x: 3000, y: 200, length: 600, width: 400,
      snappedAxes: ['x'],
      others,
      container: container(),
    })
    expect(guides).toHaveLength(1)
    expect(guides[0]).toMatchObject({ axis: 'x', coordinate: 3000, kind: 'neighbor-edge', neighborBoxId: 'n1' })
  })

  it('returns a neighbor-edge guide for right-edge-to-right-edge alignment', () => {
    const others = [placedBox({ id: 'n2', x: 2000, y: 0, length: 1000, width: 1000 })]
    const guides = snapGuides({
      x: 2000 + 1000 - 600, y: 200, length: 600, width: 400,
      snappedAxes: ['x'],
      others,
      container: container(),
    })
    expect(guides).toHaveLength(1)
    expect(guides[0]).toMatchObject({ axis: 'x', coordinate: 3000, kind: 'neighbor-edge', neighborBoxId: 'n2' })
  })

  it('returns two guides when both x and y are snapped', () => {
    const others = [placedBox({ id: 'n3', x: 4000, y: 400, length: 800, width: 800 })]
    const guides = snapGuides({
      x: 4000, y: 400, length: 600, width: 400,
      snappedAxes: ['x', 'y'],
      others,
      container: container(),
    })
    const xGuide = guides.find(g => g.axis === 'x')
    const yGuide = guides.find(g => g.axis === 'y')
    expect(xGuide).toBeDefined()
    expect(yGuide).toBeDefined()
    expect(xGuide!.kind).toBe('neighbor-edge')
    expect(yGuide!.kind).toBe('neighbor-edge')
  })

  it('returns empty array when no axes are snapped', () => {
    const guides = snapGuides({
      x: 500, y: 500, length: 600, width: 400,
      snappedAxes: [],
      others: [],
      container: container(),
    })
    expect(guides).toHaveLength(0)
  })

  it('returns a wall guide for container left wall (y=0)', () => {
    const guides = snapGuides({
      x: 200, y: 0, length: 600, width: 400,
      snappedAxes: ['y'],
      others: [],
      container: container(),
    })
    expect(guides).toHaveLength(1)
    expect(guides[0]).toMatchObject({ axis: 'y', coordinate: 0, kind: 'wall' })
  })

  it('returns a wall guide for container right wall', () => {
    const c = container()
    const guides = snapGuides({
      x: 200, y: c.width - 500, length: 600, width: 500,
      snappedAxes: ['y'],
      others: [],
      container: c,
    })
    expect(guides).toHaveLength(1)
    expect(guides[0]).toMatchObject({ axis: 'y', coordinate: c.width, kind: 'wall' })
  })

  it('returns a center guide for y-axis centerline', () => {
    const c = container()
    const guides = snapGuides({
      x: 200, y: (c.width - 500) / 2, length: 600, width: 500,
      snappedAxes: ['y'],
      others: [],
      container: c,
    })
    expect(guides).toHaveLength(1)
    expect(guides[0]).toMatchObject({ axis: 'y', coordinate: c.width / 2, kind: 'center' })
  })
})
