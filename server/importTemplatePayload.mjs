const TEMPLATE_FIELDS = new Set([
  'label', 'name', 'length', 'width', 'height', 'weight', 'quantity', 'color',
  'canRotate', 'stackable', 'maxStackLayers', 'groundOnly', 'loadingPriority', 'dimensions',
])
const TEMPLATE_UNITS = new Set(['auto', 'mm', 'cm'])
const TEMPLATE_MERGE_ROWS = new Set(['none', 'by-label'])
const TEMPLATE_DIMENSION_MODES = new Set(['separate', 'combined'])
const TEMPLATE_DIMENSION_FIELDS = new Set(['length', 'width', 'height'])
const TEMPLATE_MAPPING_FIELDS = [
  'label', 'name', 'length', 'width', 'height', 'weight', 'quantity',
  'color', 'canRotate', 'stackable', 'maxStackLayers', 'groundOnly',
]

function invalid(message) {
  return { ok: false, code: 'invalid-template', message }
}

function isUniqueDimensionOrder(order) {
  return Array.isArray(order)
    && order.length === 3
    && new Set(order).size === 3
    && order.every((field) => TEMPLATE_DIMENSION_FIELDS.has(field))
}

function activeMappedColumns(mapping, dimensionMode, combinedColumn) {
  const columns = []
  if (dimensionMode === 'combined') {
    columns.push(combinedColumn || mapping.dimensions || '')
  }
  for (const field of TEMPLATE_MAPPING_FIELDS) {
    if (dimensionMode === 'combined' && TEMPLATE_DIMENSION_FIELDS.has(field)) continue
    columns.push(mapping[field] ?? '')
  }
  return columns.map((column) => String(column).trim()).filter(Boolean)
}

function hasDuplicateColumns(mapping, dimensionMode, combinedColumn) {
  const seen = new Map()
  for (const column of activeMappedColumns(mapping, dimensionMode, combinedColumn)) {
    seen.set(column, (seen.get(column) ?? 0) + 1)
  }
  return Array.from(seen.values()).some((count) => count > 1)
}

export function parseImportTemplatePayload(body) {
  if (body == null || typeof body !== 'object' || Array.isArray(body)) {
    return invalid('Invalid template payload')
  }
  const name = String(body.name ?? '').trim().slice(0, 80)
  if (!name) return invalid('Template name is required')
  const mapping = body.mapping && typeof body.mapping === 'object' && !Array.isArray(body.mapping)
    ? body.mapping
    : null
  if (!mapping) return invalid('Invalid template payload')
  const units = body.units && typeof body.units === 'object' ? body.units : {}
  const defaults = body.defaultValues && typeof body.defaultValues === 'object' ? body.defaultValues : {}
  const cleanMapping = {}
  for (const [key, value] of Object.entries(mapping)) {
    if (!TEMPLATE_FIELDS.has(key)) continue
    cleanMapping[key] = value == null ? '' : String(value).slice(0, 120)
  }
  const cleanUnits = {}
  for (const key of ['length', 'width', 'height']) {
    const value = String(units[key] ?? 'auto')
    cleanUnits[key] = TEMPLATE_UNITS.has(value) ? value : 'auto'
  }
  const headerRow = Math.max(1, Math.min(50, Math.floor(Number(body.headerRow ?? 1))))
  const startRow = Math.max(headerRow + 1, Math.min(500, Math.floor(Number(body.startRow ?? 2))))
  const mergeRows = TEMPLATE_MERGE_ROWS.has(String(body.mergeRows ?? 'none')) ? String(body.mergeRows ?? 'none') : 'none'
  const dimensionMode = TEMPLATE_DIMENSION_MODES.has(String(body.dimensionMode ?? 'separate'))
    ? String(body.dimensionMode ?? 'separate')
    : 'separate'
  const combinedColumn = body.combinedColumn != null ? String(body.combinedColumn).trim().slice(0, 120) : ''
  const requestedOrder = Array.isArray(body.dimensionOrder) ? body.dimensionOrder.map(String) : []
  const dimensionOrder = isUniqueDimensionOrder(requestedOrder)
    ? requestedOrder
    : ['length', 'width', 'height']
  const cleanDefaults = {}
  if (defaults.label != null) cleanDefaults.label = String(defaults.label).trim().slice(0, 12)
  if (defaults.name != null) cleanDefaults.name = String(defaults.name).trim().slice(0, 120)
  if (defaults.quantity != null && Number.isFinite(Number(defaults.quantity))) {
    cleanDefaults.quantity = Math.max(1, Math.floor(Number(defaults.quantity)))
  }
  if (defaults.color != null) cleanDefaults.color = String(defaults.color).trim().slice(0, 40)
  if (defaults.canRotate != null) cleanDefaults.canRotate = Boolean(defaults.canRotate)
  if (defaults.stackable != null) cleanDefaults.stackable = Boolean(defaults.stackable)
  if (defaults.maxStackLayers != null && Number.isFinite(Number(defaults.maxStackLayers))) {
    cleanDefaults.maxStackLayers = Math.max(1, Math.floor(Number(defaults.maxStackLayers)))
  }
  if (defaults.groundOnly != null) cleanDefaults.groundOnly = Boolean(defaults.groundOnly)
  if (defaults.loadingPriority != null) {
    cleanDefaults.loadingPriority = defaults.loadingPriority === 'first' ? 'first' : 'normal'
  }

  if (dimensionMode === 'combined') {
    if (!(combinedColumn || String(cleanMapping.dimensions ?? '').trim())) {
      return invalid('Incomplete dimension mapping')
    }
    if (!isUniqueDimensionOrder(requestedOrder)) {
      return invalid('Incomplete dimension mapping')
    }
  } else if (!String(cleanMapping.length ?? '').trim()
    || !String(cleanMapping.width ?? '').trim()
    || !String(cleanMapping.height ?? '').trim()) {
    return invalid('Incomplete dimension mapping')
  }


  if (hasDuplicateColumns(cleanMapping, dimensionMode, combinedColumn)) {
    return invalid('Duplicate column mapping')
  }

  return {
    ok: true,
    value: {
      name,
      mapping: cleanMapping,
      units: cleanUnits,
      headerRow,
      startRow,
      mergeRows,
      dimensionMode,
      combinedColumn,
      dimensionOrder,
      defaultValues: cleanDefaults,
    },
  }
}
