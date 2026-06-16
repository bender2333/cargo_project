import type { ImportTemplateDefaults } from '../types'

export type DimensionUnit = 'auto' | 'mm' | 'cm'
export type DimensionKey = 'length' | 'width' | 'height'

export type LastImportConfig = {
  mapping: Record<string, string>
  units: Record<DimensionKey, DimensionUnit>
  headerRow: number
  startRow: number
  dimensionMode: 'separate' | 'combined'
  combinedColumn: string
  dimensionOrder: DimensionKey[]
  defaults: ImportTemplateDefaults
}

const DIMENSION_KEYS: DimensionKey[] = ['length', 'width', 'height']
const UNIT_VALUES: DimensionUnit[] = ['auto', 'mm', 'cm']

export function lastImportConfigKey(userId: string | null | undefined) {
  return `cargo-last-import-config:${userId || 'local'}`
}

function normalizeUnit(value: unknown): DimensionUnit {
  return UNIT_VALUES.includes(value as DimensionUnit) ? (value as DimensionUnit) : 'auto'
}

function normalizePositiveInt(value: unknown, fallback: number): number {
  const num = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(num)) return fallback
  const rounded = Math.round(num)
  return rounded >= 1 ? rounded : fallback
}

function normalizeMapping(value: unknown): Record<string, string> {
  if (!value || typeof value !== 'object') return {}
  const out: Record<string, string> = {}
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    if (typeof raw === 'string') out[key] = raw
  }
  return out
}

function normalizeDimensionOrder(value: unknown): DimensionKey[] {
  if (!Array.isArray(value)) return [...DIMENSION_KEYS]
  const filtered = value.filter((entry): entry is DimensionKey => DIMENSION_KEYS.includes(entry as DimensionKey))
  // A valid split order must reference each axis exactly once.
  const unique = new Set(filtered)
  if (filtered.length !== 3 || unique.size !== 3) return [...DIMENSION_KEYS]
  return filtered
}

function normalizeDefaults(value: unknown): ImportTemplateDefaults {
  if (!value || typeof value !== 'object') return {}
  const source = value as Record<string, unknown>
  const out: ImportTemplateDefaults = {}
  if (typeof source.label === 'string') out.label = source.label
  if (typeof source.name === 'string') out.name = source.name
  if (typeof source.color === 'string') out.color = source.color
  if (typeof source.quantity === 'number' && Number.isFinite(source.quantity)) out.quantity = source.quantity
  if (typeof source.canRotate === 'boolean') out.canRotate = source.canRotate
  if (typeof source.stackable === 'boolean') out.stackable = source.stackable
  if (typeof source.maxStackLayers === 'number' && Number.isFinite(source.maxStackLayers)) {
    out.maxStackLayers = source.maxStackLayers
  }
  return out
}

export function normalizeLastImportConfig(value: unknown): LastImportConfig | null {
  if (!value || typeof value !== 'object') return null
  const source = value as Record<string, unknown>
  const mapping = normalizeMapping(source.mapping)
  // A config with no mapping at all carries nothing worth restoring.
  if (Object.keys(mapping).length === 0) return null
  const unitsSource = (source.units && typeof source.units === 'object' ? source.units : {}) as Record<string, unknown>
  return {
    mapping,
    units: {
      length: normalizeUnit(unitsSource.length),
      width: normalizeUnit(unitsSource.width),
      height: normalizeUnit(unitsSource.height),
    },
    headerRow: normalizePositiveInt(source.headerRow, 1),
    startRow: normalizePositiveInt(source.startRow, 2),
    dimensionMode: source.dimensionMode === 'combined' ? 'combined' : 'separate',
    combinedColumn: typeof source.combinedColumn === 'string' ? source.combinedColumn : '',
    dimensionOrder: normalizeDimensionOrder(source.dimensionOrder),
    defaults: normalizeDefaults(source.defaults),
  }
}

export function loadLastImportConfig(
  userId: string | null | undefined,
  storage: Pick<Storage, 'getItem'> | null = typeof localStorage === 'undefined' ? null : localStorage,
): LastImportConfig | null {
  if (!storage) return null
  try {
    const raw = storage.getItem(lastImportConfigKey(userId))
    if (!raw) return null
    return normalizeLastImportConfig(JSON.parse(raw))
  } catch {
    return null
  }
}

export function saveLastImportConfig(
  userId: string | null | undefined,
  config: LastImportConfig,
  storage: Pick<Storage, 'setItem'> | null = typeof localStorage === 'undefined' ? null : localStorage,
) {
  if (!storage) return
  try {
    storage.setItem(lastImportConfigKey(userId), JSON.stringify(config))
  } catch {
    /* ignore quota / serialization failures */
  }
}
