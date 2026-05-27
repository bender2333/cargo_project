import { describe, expect, it } from 'vitest'
import { EDGE_SNAP_TOLERANCE_MM, snapToEdges } from './snapEdges'
import type { ContainerSpec, PlacedBox } from '../types'

function makeContainer(): ContainerSpec {
  return { id: 't', label: 'T', description: '', length: 12000, width: 2400, height: 2600, maxWeight: 28000, doorGap: 0, topGap: 0, sideGap: 0 }
}

function makeBox(o: Partial<PlacedBox> & { id: string; x: number; y: number; length: number; width: number; height?: number }): PlacedBox {
  return {
    cargoId: 'c', name: 'n', label: 'A', index: 0, z: 0, height: 500,
    orientationKey: 'LWH', labelRotationDeg: 0, weight: 1, color: '#000',
    stackable: true, physicalLayer: 1, workStep: 1, supportType: 'floor', supportedBy: [],
    ...o,
  } as PlacedBox
}

describe('snapToEdges', () => {
  const container = makeContainer()

  it('snaps to the container front wall when within tolerance', () => {
    const r = snapToEdges({ x: 25, y: 200, length: 1000, width: 1000, others: [], container })
    expect(r.x).toBe(0)
    expect(r.snappedAxes).toContain('x')
  })

  it('snaps to container rear wall (x = length - boxLength)', () => {
    const r = snapToEdges({ x: 10985, y: 200, length: 1000, width: 1000, others: [], container })
    expect(r.x).toBe(container.length - 1000)
    expect(r.snappedAxes).toContain('x')
  })

  it('snaps both axes to container centre when both within tolerance', () => {
    const r = snapToEdges({ x: (container.length - 1000) / 2 + 5, y: (container.width - 1000) / 2 + 2, length: 1000, width: 1000, others: [], container })
    expect(r.x).toBe((container.length - 1000) / 2)
    expect(r.y).toBe((container.width - 1000) / 2)
  })

  it('snaps to a neighbouring box edge (align dragged.x to neighbour.x)', () => {
    const others = [makeBox({ id: 'n', x: 2000, y: 0, length: 1000, width: 1000 })]
    const r = snapToEdges({ x: 1985, y: 200, length: 600, width: 400, others, container })
    expect(r.x).toBe(2000)
  })

  it('aligns dragged-box right edge to neighbour right edge (x = n.x + n.l - boxLength)', () => {
    const others = [makeBox({ id: 'n', x: 2000, y: 0, length: 1000, width: 1000 })]
    // candidate: 2000 + 1000 - 600 = 2400. Start at 2410, within 30mm.
    const r = snapToEdges({ x: 2410, y: 200, length: 600, width: 400, others, container })
    expect(r.x).toBe(2400)
  })

  it('does not snap when outside tolerance', () => {
    const r = snapToEdges({ x: 100, y: 200, length: 600, width: 400, others: [], container })
    expect(r.x).toBe(100)
    expect(r.snappedAxes).not.toContain('x')
  })

  it('returns input unchanged when disabled', () => {
    const r = snapToEdges({ x: 25, y: 200, length: 600, width: 400, others: [], container, enabled: false })
    expect(r.x).toBe(25)
    expect(r.snappedAxes).toEqual([])
  })

  it('uses the documented 30mm default tolerance', () => {
    expect(EDGE_SNAP_TOLERANCE_MM).toBe(30)
  })

  it('uses a caller supplied edge tolerance from placement settings', () => {
    const r = snapToEdges({
      x: 1950,
      y: 200,
      length: 600,
      width: 400,
      others: [makeBox({ id: 'n', x: 2000, y: 0, length: 1000, width: 1000 })],
      container,
      tolerance: 60,
    })

    expect(r.x).toBe(2000)
    expect(r.snappedAxes).toContain('x')
  })
})
