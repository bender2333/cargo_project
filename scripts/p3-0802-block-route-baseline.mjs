// P3-1 read-only baseline: 0802 block-route sensitivity table.
// Usage: node scripts/p3-0802-block-route-baseline.mjs
// Does not write fixtures/goldens; prints JSON rows for decision.md.
import { readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createServer } from 'vite'
import { packingBenchmarkViteConfig } from './packing-benchmark-cases.mjs'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const fixturePath = join(root, 'test-data/json/0802/input.json')

function cloneItems(items) {
  return items.map((item) => ({ ...item }))
}

function reasonCodeDistribution(unplaced) {
  const counts = {}
  for (const entry of unplaced) {
    const code = entry.reasonCode ?? entry.reason ?? 'unknown'
    counts[code] = (counts[code] ?? 0) + entry.quantity
  }
  return counts
}

function unplacedQuantity(unplaced) {
  return unplaced.reduce((sum, entry) => sum + entry.quantity, 0)
}

function gateDiagnostics(items, loadingMode, container, shouldUseBlockEngine, effectiveContainer) {
  const effective = effectiveContainer(container)
  const totalCargoCount = items.reduce((sum, item) => sum + item.quantity, 0)
  const stackableAll = items.every((item) => item.stackable)
  const groundOnlySkuCount = items.filter((item) => item.groundOnly).length
  const groundOnlyBoxCount = items
    .filter((item) => item.groundOnly)
    .reduce((sum, item) => sum + item.quantity, 0)

  // Mirror shouldUseBlockEngine preconditions for auditability (does not change product code).
  const modeOk = loadingMode === 'quantity' || loadingMode === 'volume'
  const skuCountOk = items.length >= 2
  const totalCountOk = totalCargoCount >= 100
  const stackableOk = stackableAll

  // minimumFittingHeight is not exported; reconstruct the same orientation filter used by the gate.
  const fittingHeights = items.map((item) => {
    const dims = [
      [item.length, item.width, item.height],
      [item.width, item.length, item.height],
      [item.length, item.height, item.width],
      [item.height, item.length, item.width],
      [item.width, item.height, item.length],
      [item.height, item.width, item.length],
    ]
    const heights = dims
      .filter(([l, w, h]) => l <= effective.length && w <= effective.width && h <= effective.height)
      .map(([, , h]) => h)
    return heights.length > 0 ? Math.min(...heights) : 0
  })
  const anyExceedsDimensions = fittingHeights.some((height) => height <= 0.001)
  const minFittingHeight = fittingHeights.length ? Math.min(...fittingHeights.filter((h) => h > 0.001), Number.POSITIVE_INFINITY) : 0
  const conservativeMaxPhysicalLayers = Number.isFinite(minFittingHeight) && minFittingHeight > 0
    ? Math.ceil(effective.height / minFittingHeight)
    : null
  const maxStackLayersValues = [...new Set(items.map((item) => item.maxStackLayers))]
  const bindingSkus = items
    .map((item, index) => ({
      index,
      label: item.label,
      id: item.id,
      maxStackLayers: item.maxStackLayers,
      fittingHeight: fittingHeights[index],
    }))
    .filter((row) => row.maxStackLayers !== undefined
      && Number.isFinite(row.maxStackLayers)
      && row.maxStackLayers > 0
      && conservativeMaxPhysicalLayers != null
      && row.maxStackLayers < conservativeMaxPhysicalLayers)

  const gate = shouldUseBlockEngine(items, loadingMode, effective)
  return {
    shouldUseBlockEngine: gate,
    loadingMode,
    totalCargoCount,
    skuCount: items.length,
    modeOk,
    skuCountOk,
    totalCountOk,
    stackableOk,
    anyExceedsDimensions,
    minFittingHeight: Number.isFinite(minFittingHeight) ? minFittingHeight : null,
    conservativeMaxPhysicalLayers,
    maxStackLayersValues,
    bindingSkuCount: bindingSkus.length,
    bindingSkus,
    groundOnlySkuCount,
    groundOnlyBoxCount,
    effectiveContainer: {
      length: effective.length,
      width: effective.width,
      height: effective.height,
    },
  }
}

function summarizeVariant(name, description, items, loadingMode, container, api) {
  const { calculatePacking, shouldUseBlockEngine, effectiveContainer } = api
  const gate = gateDiagnostics(items, loadingMode, container, shouldUseBlockEngine, effectiveContainer)
  const startedAt = Date.now()
  const result = calculatePacking(container, items, { loadingMode })
  const elapsedMs = Date.now() - startedAt
  const unplacedCount = unplacedQuantity(result.unplaced)
  const reasons = reasonCodeDistribution(result.unplaced)
  const groundOnlyId = items.find((item) => item.groundOnly)?.id
  const groundOnlyPlaced = groundOnlyId
    ? result.placed.filter((box) => box.cargoId === groundOnlyId)
    : []
  return {
    name,
    description,
    shouldUseBlockEngine: gate.shouldUseBlockEngine,
    placedCount: result.placedCount,
    unplacedCount,
    totalCargoCount: result.totalCargoCount,
    reasonCodeDistribution: reasons,
    elapsedMs,
    gateDiagnostics: gate,
    groundOnly: groundOnlyId
      ? {
          cargoId: groundOnlyId,
          placed: groundOnlyPlaced.length,
          allZ0: groundOnlyPlaced.every((box) => box.z === 0),
        }
      : null,
    errorDiagnostics: result.diagnostics.filter((entry) => entry.severity === 'error').map((entry) => entry.code ?? entry.message),
  }
}

const vite = await createServer(packingBenchmarkViteConfig(root))
try {
  const [{ calculatePacking, shouldUseBlockEngine }, { effectiveContainer }] = await Promise.all([
    vite.ssrLoadModule('/src/lib/packing.ts'),
    vite.ssrLoadModule('/src/data/containers.ts'),
  ])
  const fixture = JSON.parse(readFileSync(fixturePath, 'utf8'))
  const baseItems = cloneItems(fixture.items)
  const loadingMode = fixture.loadingMode
  const container = fixture.container
  const api = { calculatePacking, shouldUseBlockEngine, effectiveContainer }

  const targetSkuIndex = baseItems.findIndex((item) => !item.groundOnly)
  if (targetSkuIndex < 0) throw new Error('No non-groundOnly SKU found for maxStackLayers variants')
  const targetSku = baseItems[targetSkuIndex]

  const oversizedIndex = baseItems.findIndex((item) => !item.groundOnly && item.id !== targetSku.id)
  if (oversizedIndex < 0) throw new Error('No SKU available for exceeds-container-length variant')
  const oversizedBase = baseItems[oversizedIndex]

  const variants = []

  variants.push(summarizeVariant(
    'original',
    'as-captured: all maxStackLayers=99, one groundOnly SKU',
    cloneItems(baseItems),
    loadingMode,
    container,
    api,
  ))

  variants.push(summarizeVariant(
    'all-maxStackLayers-undefined',
    'every SKU maxStackLayers deleted (undefined)',
    cloneItems(baseItems).map(({ maxStackLayers: _ignored, ...item }) => item),
    loadingMode,
    container,
    api,
  ))

  for (const layers of [10, 12, 13]) {
    const items = cloneItems(baseItems)
    items[targetSkuIndex] = { ...items[targetSkuIndex], maxStackLayers: layers }
    variants.push(summarizeVariant(
      `one-sku-maxStackLayers-${layers}`,
      `SKU label=${targetSku.label} id=${targetSku.id} maxStackLayers=${layers}; others remain 99`,
      items,
      loadingMode,
      container,
      api,
    ))
  }

  {
    const items = cloneItems(baseItems)
    const overLength = container.length + 500
    items[oversizedIndex] = {
      ...items[oversizedIndex],
      length: overLength,
      width: overLength,
      // keep height fittable so the only failure mode is horizontal exceed if rotated; force all dims over length/width
      height: Math.min(items[oversizedIndex].height, container.height),
    }
    // Ensure every orientation exceeds container length or width so minimumFittingHeight returns 0.
    items[oversizedIndex].length = container.length + 500
    items[oversizedIndex].width = container.width + 500
    items[oversizedIndex].height = container.height + 500
    variants.push(summarizeVariant(
      'one-sku-exceeds-container-dims',
      `SKU label=${oversizedBase.label} id=${oversizedBase.id} dims set above container on all axes`,
      items,
      loadingMode,
      container,
      api,
    ))
  }

  const report = {
    generatedAt: new Date().toISOString(),
    fixture: fixturePath,
    source: fixture.source,
    capturedAt: fixture.capturedAt,
    loadingMode,
    container: {
      id: container.id,
      length: container.length,
      width: container.width,
      height: container.height,
    },
    skuCount: baseItems.length,
    totalBoxes: baseItems.reduce((sum, item) => sum + item.quantity, 0),
    mutatedSkuForStackLayers: {
      index: targetSkuIndex,
      id: targetSku.id,
      label: targetSku.label,
      name: targetSku.name,
      quantity: targetSku.quantity,
      height: targetSku.height,
    },
    mutatedSkuForOversized: {
      index: oversizedIndex,
      id: oversizedBase.id,
      label: oversizedBase.label,
      name: oversizedBase.name,
      quantity: oversizedBase.quantity,
    },
    variants,
  }

  console.log(JSON.stringify(report, null, 2))
} finally {
  await vite.close()
}
