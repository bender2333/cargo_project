import { describe, expect, it } from 'vitest'
import { GRID_SNAP_MM, snapToGrid } from './snap'

describe('snapToGrid', () => {
  it('defaults to 50mm grid', () => {
    expect(GRID_SNAP_MM).toBe(50)
    expect(snapToGrid(0)).toBe(0)
    expect(snapToGrid(24)).toBe(0)
    expect(snapToGrid(25)).toBe(50)
    expect(snapToGrid(74)).toBe(50)
    expect(snapToGrid(125)).toBe(150)
  })

  it('honors a custom step', () => {
    expect(snapToGrid(123, 10)).toBe(120)
    expect(snapToGrid(127, 10)).toBe(130)
    expect(snapToGrid(450, 100)).toBe(500)
  })

  it('returns the input unchanged when disabled', () => {
    expect(snapToGrid(123.4, 50, false)).toBe(123.4)
  })

  it('returns input when step is non-positive to avoid divide-by-zero', () => {
    expect(snapToGrid(123, 0, true)).toBe(123)
    expect(snapToGrid(123, -10, true)).toBe(123)
  })

  it('handles negative values symmetrically (JS Math.round half-up)', () => {
    expect(snapToGrid(-24)).toBe(-0)
    expect(snapToGrid(-26)).toBe(-50)
    expect(snapToGrid(-75, 50)).toBe(-50)
    expect(snapToGrid(-76, 50)).toBe(-100)
  })
})
