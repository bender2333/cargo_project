export type SupportPolicy = {
  allowPartialOverhang: boolean
  minSupportRatio: number
  warningSupportRatio: number
  supportMode: 'strict' | 'balanced' | 'field-review'
}

export type PlacementSettings = {
  snapEnabled: boolean
  gridSnapEnabled: boolean
  gridStepMm: number
  edgeSnapEnabled: boolean
  edgeToleranceMm: number
  zSnapEnabled: boolean
  zStepMm: number
  surfaceSnapEnabled: boolean
  supportPolicy: SupportPolicy
}

export const DEFAULT_PLACEMENT_SETTINGS: PlacementSettings = {
  snapEnabled: true,
  gridSnapEnabled: true,
  gridStepMm: 50,
  edgeSnapEnabled: true,
  edgeToleranceMm: 30,
  zSnapEnabled: true,
  zStepMm: 50,
  surfaceSnapEnabled: true,
  supportPolicy: {
    allowPartialOverhang: false,
    minSupportRatio: 0.5,
    warningSupportRatio: 0.5,
    supportMode: 'strict',
  },
}

export function placementSettingsKey(userId: string | null | undefined) {
  return `cargo-placement-settings:${userId || 'local'}`
}

function clampNumber(value: unknown, fallback: number, min: number, max: number) {
  const n = Number(value)
  if (!Number.isFinite(n)) return fallback
  return Math.min(max, Math.max(min, n))
}

function normalizeSupportPolicy(value: unknown): SupportPolicy {
  const src = typeof value === 'object' && value !== null ? value as Partial<SupportPolicy> : {}
  const minSupportRatio = clampNumber(src.minSupportRatio, DEFAULT_PLACEMENT_SETTINGS.supportPolicy.minSupportRatio, 0, 1)
  const warningSupportRatio = clampNumber(src.warningSupportRatio, DEFAULT_PLACEMENT_SETTINGS.supportPolicy.warningSupportRatio, minSupportRatio, 1)
  const supportMode = src.supportMode === 'balanced' || src.supportMode === 'field-review' || src.supportMode === 'strict'
    ? src.supportMode
    : DEFAULT_PLACEMENT_SETTINGS.supportPolicy.supportMode
  return {
    allowPartialOverhang: Boolean(src.allowPartialOverhang),
    minSupportRatio,
    warningSupportRatio,
    supportMode,
  }
}

export function normalizePlacementSettings(value: unknown): PlacementSettings {
  const src = typeof value === 'object' && value !== null ? value as Partial<PlacementSettings> : {}
  return {
    snapEnabled: src.snapEnabled ?? DEFAULT_PLACEMENT_SETTINGS.snapEnabled,
    gridSnapEnabled: src.gridSnapEnabled ?? DEFAULT_PLACEMENT_SETTINGS.gridSnapEnabled,
    gridStepMm: clampNumber(src.gridStepMm, DEFAULT_PLACEMENT_SETTINGS.gridStepMm, 1, 1000),
    edgeSnapEnabled: src.edgeSnapEnabled ?? DEFAULT_PLACEMENT_SETTINGS.edgeSnapEnabled,
    edgeToleranceMm: clampNumber(src.edgeToleranceMm, DEFAULT_PLACEMENT_SETTINGS.edgeToleranceMm, 0, 1000),
    zSnapEnabled: src.zSnapEnabled ?? DEFAULT_PLACEMENT_SETTINGS.zSnapEnabled,
    zStepMm: clampNumber(src.zStepMm, DEFAULT_PLACEMENT_SETTINGS.zStepMm, 1, 1000),
    surfaceSnapEnabled: src.surfaceSnapEnabled ?? DEFAULT_PLACEMENT_SETTINGS.surfaceSnapEnabled,
    supportPolicy: normalizeSupportPolicy(src.supportPolicy),
  }
}

export function loadPlacementSettings(userId: string | null | undefined, storage: Pick<Storage, 'getItem'> | null = typeof localStorage === 'undefined' ? null : localStorage): PlacementSettings {
  if (!storage) return DEFAULT_PLACEMENT_SETTINGS
  try {
    const raw = storage.getItem(placementSettingsKey(userId))
    if (!raw) return DEFAULT_PLACEMENT_SETTINGS
    return normalizePlacementSettings(JSON.parse(raw))
  } catch {
    return DEFAULT_PLACEMENT_SETTINGS
  }
}

export function savePlacementSettings(userId: string | null | undefined, settings: PlacementSettings, storage: Pick<Storage, 'setItem'> | null = typeof localStorage === 'undefined' ? null : localStorage) {
  if (!storage) return
  try {
    storage.setItem(placementSettingsKey(userId), JSON.stringify(normalizePlacementSettings(settings)))
  } catch {
    // Browser storage can be disabled or full; keep the in-memory settings.
  }
}
