import { describe, expect, it } from 'vitest'
import { clearPlacementOnContainerChange } from './lib/containerChange'

describe('clearPlacementOnContainerChange', () => {
  it('clears stale automatic placement after a calculated container changes', () => {
    expect(clearPlacementOnContainerChange({
      previousKey: '20:5898:2352:2393',
      nextKey: '40:12032:2352:2393',
      placementMode: 'auto',
      hasCalculated: true,
      placedCount: 18,
    })).toBe(true)
  })

  it('keeps manual placement and empty automatic scenes intact', () => {
    expect(clearPlacementOnContainerChange({
      previousKey: '20:5898:2352:2393',
      nextKey: '40:12032:2352:2393',
      placementMode: 'manual',
      hasCalculated: true,
      placedCount: 18,
    })).toBe(false)
    expect(clearPlacementOnContainerChange({
      previousKey: '20:5898:2352:2393',
      nextKey: '40:12032:2352:2393',
      placementMode: 'auto',
      hasCalculated: false,
      placedCount: 18,
    })).toBe(false)
    expect(clearPlacementOnContainerChange({
      previousKey: '20:5898:2352:2393',
      nextKey: '40:12032:2352:2393',
      placementMode: 'auto',
      hasCalculated: true,
      placedCount: 0,
    })).toBe(false)
  })
})
