import { describe, expect, it } from 'vitest'
import {
  lastImportConfigKey,
  loadLastImportConfig,
  normalizeLastImportConfig,
  saveLastImportConfig,
  type LastImportConfig,
} from './lastImportConfig'

function createStorage(initial: Record<string, string> = {}) {
  const store: Record<string, string> = { ...initial }
  return {
    store,
    getItem: (key: string) => (key in store ? store[key] : null),
    setItem: (key: string, value: string) => {
      store[key] = value
    },
  }
}

const fullConfig: LastImportConfig = {
  mapping: { label: 'SKU', name: 'Goods', length: 'L', width: 'W', height: 'H', dimensions: '' },
  units: { length: 'cm', width: 'cm', height: 'mm' },
  headerRow: 2,
  startRow: 3,
  dimensionMode: 'combined',
  combinedColumn: '外箱尺寸（mm）',
  dimensionOrder: ['width', 'length', 'height'],
  defaults: { quantity: 5, canRotate: false, stackable: true, maxStackLayers: 3, label: 'TP', groundOnly: true, loadingPriority: 'first' },
}

describe('lastImportConfigKey', () => {
  it('namespaces by user id and isolates anonymous from named users', () => {
    expect(lastImportConfigKey('user-1')).toBe('cargo-last-import-config:user-1')
    expect(lastImportConfigKey(null)).toBe('cargo-last-import-config:local')
    expect(lastImportConfigKey(undefined)).toBe('cargo-last-import-config:local')
    expect(lastImportConfigKey('user-1')).not.toBe(lastImportConfigKey('user-2'))
  })
})

describe('save/load round trip', () => {
  it('persists and restores every field for the same user', () => {
    const storage = createStorage()
    saveLastImportConfig('user-1', fullConfig, storage)
    expect(loadLastImportConfig('user-1', storage)).toEqual(fullConfig)
  })

  it('keeps users isolated: another user reads nothing', () => {
    const storage = createStorage()
    saveLastImportConfig('user-1', fullConfig, storage)
    expect(loadLastImportConfig('user-2', storage)).toBeNull()
  })

  it('returns null when no config was stored', () => {
    expect(loadLastImportConfig('user-1', createStorage())).toBeNull()
  })

  it('returns null on corrupt JSON instead of throwing', () => {
    const storage = createStorage({ [lastImportConfigKey('user-1')]: '{not json' })
    expect(loadLastImportConfig('user-1', storage)).toBeNull()
  })
})

describe('normalizeLastImportConfig', () => {
  it('rejects non-objects and mappings with no string columns', () => {
    expect(normalizeLastImportConfig(null)).toBeNull()
    expect(normalizeLastImportConfig('x')).toBeNull()
    expect(normalizeLastImportConfig({ mapping: {} })).toBeNull()
    expect(normalizeLastImportConfig({ mapping: { length: 42 } })).toBeNull()
  })

  it('coerces invalid units to auto and bad rows to sane defaults', () => {
    const result = normalizeLastImportConfig({
      mapping: { length: 'L' },
      units: { length: 'inch', width: 'cm', height: undefined },
      headerRow: 0,
      startRow: -4,
      dimensionMode: 'weird',
      dimensionOrder: ['length', 'length', 'width'],
    })
    expect(result).not.toBeNull()
    expect(result!.units).toEqual({ length: 'auto', width: 'cm', height: 'auto' })
    expect(result!.headerRow).toBe(1)
    expect(result!.startRow).toBe(2)
    expect(result!.dimensionMode).toBe('separate')
    // A non-permutation split order falls back to the canonical L/W/H.
    expect(result!.dimensionOrder).toEqual(['length', 'width', 'height'])
  })

  it('drops non-string mapping values but keeps valid columns', () => {
    const result = normalizeLastImportConfig({
      mapping: { name: 'Goods', length: 'L', bogus: 123 },
    })
    expect(result!.mapping).toEqual({ name: 'Goods', length: 'L' })
  })

  it('preserves a valid custom split order', () => {
    const result = normalizeLastImportConfig({
      mapping: { dimensions: 'Size' },
      dimensionOrder: ['height', 'width', 'length'],
    })
    expect(result!.dimensionOrder).toEqual(['height', 'width', 'length'])
  })
})
