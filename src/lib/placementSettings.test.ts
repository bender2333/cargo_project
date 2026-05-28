import { describe, expect, it, vi } from 'vitest'
import {
  DEFAULT_PLACEMENT_SETTINGS,
  loadPlacementSettings,
  placementSettingsKey,
  savePlacementSettings,
} from './placementSettings'

describe('placementSettings', () => {
  it('stores settings under a user-specific key when a user id is available', () => {
    expect(placementSettingsKey('u-1')).toBe('cargo-placement-settings:u-1')
    expect(placementSettingsKey(null)).toBe('cargo-placement-settings:local')
  })

  it('loads defaults when storage is empty or unavailable', () => {
    const storage = new Map<string, string>()
    const localStorage = {
      getItem: vi.fn((key: string) => storage.get(key) ?? null),
      setItem: vi.fn((key: string, value: string) => storage.set(key, value)),
    } as unknown as Storage

    expect(loadPlacementSettings('u-1', localStorage)).toEqual(DEFAULT_PLACEMENT_SETTINGS)
  })

  it('round-trips user placement settings through storage', () => {
    const storage = new Map<string, string>()
    const localStorage = {
      getItem: vi.fn((key: string) => storage.get(key) ?? null),
      setItem: vi.fn((key: string, value: string) => storage.set(key, value)),
    } as unknown as Storage
    const settings = {
      ...DEFAULT_PLACEMENT_SETTINGS,
      gridStepMm: 25,
      edgeToleranceMm: 80,
      zStepMm: 100,
      supportPolicy: {
        allowPartialOverhang: true,
        minSupportRatio: 0.3,
        warningSupportRatio: 0.55,
        supportMode: 'field-review' as const,
      },
    }

    savePlacementSettings('u-1', settings, localStorage)

    expect(loadPlacementSettings('u-1', localStorage)).toEqual(settings)
    expect(storage.has('cargo-placement-settings:u-1')).toBe(true)
  })

  it('normalizes legacy placement settings with snap enabled by default', () => {
    const loaded = loadPlacementSettings('legacy', {
      getItem: () => JSON.stringify({
        gridSnapEnabled: false,
        edgeSnapEnabled: true,
        supportPolicy: { minSupportRatio: 0.4 },
      }),
    } as Pick<Storage, 'getItem'>)

    expect(loaded.snapEnabled).toBe(true)
    expect(loaded.gridSnapEnabled).toBe(false)
    expect(loaded.edgeSnapEnabled).toBe(true)
    expect(loaded.supportPolicy.minSupportRatio).toBe(0.4)
  })
})
