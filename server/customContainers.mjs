function positiveNumber(value) {
  const numeric = Number(value)
  return Number.isFinite(numeric) && numeric > 0 ? numeric : null
}

function nonNegativeNumber(value, fallback = 0) {
  if (value == null || value === '') return fallback
  const numeric = Number(value)
  return Number.isFinite(numeric) && numeric >= 0 ? numeric : null
}

export function parseCustomContainerPayload(body) {
  const name = String(body?.name ?? '').trim().slice(0, 120)
  const length = positiveNumber(body?.length)
  const width = positiveNumber(body?.width)
  const height = positiveNumber(body?.height)
  const maxWeight = positiveNumber(body?.maxWeight)
  const doorGap = nonNegativeNumber(body?.doorGap, 0)
  const topGap = nonNegativeNumber(body?.topGap, 0)
  const sideGap = nonNegativeNumber(body?.sideGap, 0)
  if (!name || length == null || width == null || height == null || maxWeight == null
    || doorGap == null || topGap == null || sideGap == null) {
    return null
  }
  return {
    name,
    length,
    width,
    height,
    maxWeight,
    doorGap,
    topGap,
    sideGap,
  }
}
