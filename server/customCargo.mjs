function positiveNumber(value) {
  const numeric = Number(value)
  return Number.isFinite(numeric) && numeric > 0 ? numeric : null
}

function optionalPositiveInteger(value) {
  if (value == null || value === '') return null
  const numeric = Math.floor(Number(value))
  return Number.isFinite(numeric) && numeric > 0 ? numeric : null
}

export function parseCustomCargoPayload(body) {
  const name = String(body?.name ?? '').trim().slice(0, 120)
  const length = positiveNumber(body?.length)
  const width = positiveNumber(body?.width)
  const height = positiveNumber(body?.height)
  const weight = positiveNumber(body?.weight)
  if (!name || length == null || width == null || height == null || weight == null) {
    return null
  }
  const label = String(body?.label ?? name.slice(0, 2)).trim().toUpperCase().slice(0, 12)
  return {
    name,
    label: label || name.slice(0, 2).toUpperCase(),
    length,
    width,
    height,
    weight,
    color: String(body?.color ?? '#f59e0b').trim().slice(0, 40) || '#f59e0b',
    canRotate: body?.canRotate == null ? true : Boolean(body.canRotate),
    stackable: body?.stackable == null ? true : Boolean(body.stackable),
    maxStackLayers: optionalPositiveInteger(body?.maxStackLayers) ?? undefined,
  }
}

export function serializeCustomCargo(row) {
  return {
    id: row.id,
    name: row.name,
    label: row.label,
    length: row.length,
    width: row.width,
    height: row.height,
    weight: row.weight,
    quantity: 1,
    color: row.color,
    canRotate: row.can_rotate === 1,
    stackable: row.stackable === 1,
    maxStackLayers: row.max_stack_layers ?? undefined,
    createdAt: row.created_at,
  }
}
