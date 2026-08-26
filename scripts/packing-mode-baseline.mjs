// Read-only quantity/volume packing baseline. Does not change goldens or packing.ts.
// Usage: node scripts/packing-mode-baseline.mjs
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createServer } from 'vite'
import { packingBenchmarkViteConfig } from './packing-benchmark-cases.mjs'

const VOXEL = 50
const VOXEL_VOLUME = VOXEL * VOXEL * VOXEL
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const outDir = join(root, 'test-results/current')
const outPath = join(outDir, 'packing-mode-baseline.json')

function cloneItems(items) {
  return items.map((item) => ({ ...item }))
}

function loadJson(relativePath) {
  return JSON.parse(readFileSync(join(root, relativePath), 'utf8'))
}

function unplacedCount(unplaced) {
  return unplaced.reduce((sum, entry) => sum + entry.quantity, 0)
}

function skuPlaced(items, result) {
  const counts = new Map()
  for (const box of result.placed) {
    counts.set(box.cargoId, (counts.get(box.cargoId) ?? 0) + 1)
  }
  return items.map((item) => ({
    id: item.id,
    name: item.name,
    label: item.label,
    requested: item.quantity,
    placed: counts.get(item.id) ?? 0,
  }))
}

function seedItems(seed) {
  const sizes = [
    { length: 530, width: 305, height: 310 },
    { length: 530, width: 305, height: 360 },
    { length: 580, width: 365, height: 435 },
    { length: 350, width: 260, height: 210 },
    { length: 400, width: 400, height: 380 },
  ]
  let state = seed >>> 0
  const next = () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0
    return state / 0x100000000
  }
  return sizes.map((size, index) => {
    const id = `r${seed}-${index}`
    return {
      id,
      name: id,
      label: id,
      weight: 8,
      color: '#64748b',
      canRotate: true,
      stackable: true,
      ...size,
      quantity: 40 + Math.floor(next() * 80),
    }
  })
}

/**
 * Same meaning as analyzePackingGaps in src/lib/packing.compactness.test.ts.
 * internal_notch = empty 3D component that never touches a container face.
 * interCargo = empty run with cargo on both sides in the same z slice.
 * external_residual = empty component that touches a container face.
 */
function analyzePackingGaps(placed, container, voxel = VOXEL) {
  if (placed.length === 0) {
    return {
      internalNotchVoxels: 0,
      internalNotchVolume: 0,
      internalNotchMaxRunMm: 0,
      interCargoMaxMm: 0,
      interCargo: { mm: 0, x: 0, y: 0, z: 0, axis: 'x' },
      externalResidualVoxels: 0,
      externalResidualVolume: 0,
      envX: 0,
      envY: 0,
      envZ: 0,
    }
  }

  const envX = Math.max(...placed.map((box) => box.x + box.length))
  const envY = Math.max(...placed.map((box) => box.y + box.width))
  const envZ = Math.max(...placed.map((box) => box.z + box.height))
  const nx = Math.ceil(container.length / voxel)
  const ny = Math.ceil(container.width / voxel)
  const nz = Math.ceil(container.height / voxel)
  const occupied = new Uint8Array(nx * ny * nz)
  const index = (x, y, z) => (x * ny + y) * nz + z

  for (const box of placed) {
    const x0 = Math.max(0, Math.floor(box.x / voxel))
    const x1 = Math.min(nx, Math.ceil((box.x + box.length) / voxel))
    const y0 = Math.max(0, Math.floor(box.y / voxel))
    const y1 = Math.min(ny, Math.ceil((box.y + box.width) / voxel))
    const z0 = Math.max(0, Math.floor(box.z / voxel))
    const z1 = Math.min(nz, Math.ceil((box.z + box.height) / voxel))
    for (let x = x0; x < x1; x += 1) {
      for (let y = y0; y < y1; y += 1) {
        for (let z = z0; z < z1; z += 1) occupied[index(x, y, z)] = 1
      }
    }
  }

  let interCargoMaxMm = 0
  let interCargo = { mm: 0, x: 0, y: 0, z: 0, axis: 'x' }
  const noteBothSides = (mm, x, y, z, axis) => {
    if (mm <= interCargoMaxMm) return
    interCargoMaxMm = mm
    interCargo = { mm, x, y, z, axis }
  }

  for (let z = 0; z < Math.max(0, nz - 1); z += 1) {
    for (let x = 0; x < nx; x += 1) {
      let y = 0
      while (y < ny) {
        if (occupied[index(x, y, z)]) {
          y += 1
          continue
        }
        const start = y
        while (y < ny && !occupied[index(x, y, z)]) y += 1
        if (start > 0 && y < ny && occupied[index(x, start - 1, z)] && occupied[index(x, y, z)]) {
          noteBothSides((y - start) * voxel, x * voxel, start * voxel, z * voxel, 'y')
        }
      }
    }
    for (let y = 0; y < ny; y += 1) {
      let x = 0
      while (x < nx) {
        if (occupied[index(x, y, z)]) {
          x += 1
          continue
        }
        const start = x
        while (x < nx && !occupied[index(x, y, z)]) x += 1
        if (start > 0 && x < nx && occupied[index(start - 1, y, z)] && occupied[index(x, y, z)]) {
          noteBothSides((x - start) * voxel, start * voxel, y * voxel, z * voxel, 'x')
        }
      }
    }
  }

  const visited = new Uint8Array(nx * ny * nz)
  const dirs = [
    [1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1],
  ]
  let internalNotchVoxels = 0
  let internalNotchMaxRunMm = 0
  let externalResidualVoxels = 0

  for (let x = 0; x < nx; x += 1) {
    for (let y = 0; y < ny; y += 1) {
      for (let z = 0; z < nz; z += 1) {
        const startIndex = index(x, y, z)
        if (occupied[startIndex] || visited[startIndex]) continue
        const stack = [[x, y, z]]
        visited[startIndex] = 1
        let count = 0
        let touchesBoundary = false
        let minX = x
        let maxX = x
        let minY = y
        let maxY = y
        let minZ = z
        let maxZ = z
        while (stack.length > 0) {
          const current = stack.pop()
          if (!current) break
          const [cx, cy, cz] = current
          count += 1
          if (cx === 0 || cy === 0 || cz === 0 || cx === nx - 1 || cy === ny - 1 || cz === nz - 1) {
            touchesBoundary = true
          }
          minX = Math.min(minX, cx)
          maxX = Math.max(maxX, cx)
          minY = Math.min(minY, cy)
          maxY = Math.max(maxY, cy)
          minZ = Math.min(minZ, cz)
          maxZ = Math.max(maxZ, cz)
          for (const [dx, dy, dz] of dirs) {
            const nx2 = cx + dx
            const ny2 = cy + dy
            const nz2 = cz + dz
            if (nx2 < 0 || ny2 < 0 || nz2 < 0 || nx2 >= nx || ny2 >= ny || nz2 >= nz) continue
            const next = index(nx2, ny2, nz2)
            if (occupied[next] || visited[next]) continue
            visited[next] = 1
            stack.push([nx2, ny2, nz2])
          }
        }
        if (touchesBoundary) {
          externalResidualVoxels += count
        } else {
          internalNotchVoxels += count
          const span = Math.max(maxX - minX + 1, maxY - minY + 1, maxZ - minZ + 1) * voxel
          if (span > internalNotchMaxRunMm) internalNotchMaxRunMm = span
        }
      }
    }
  }

  return {
    internalNotchVoxels,
    internalNotchVolume: internalNotchVoxels * VOXEL_VOLUME,
    internalNotchMaxRunMm,
    interCargoMaxMm,
    interCargo,
    externalResidualVoxels,
    externalResidualVolume: externalResidualVoxels * VOXEL_VOLUME,
    envX,
    envY,
    envZ,
  }
}

function summarizeRun(name, fixture, loadingMode, container, items, result, elapsedMs, effective, search, quality) {
  const gaps = analyzePackingGaps(result.placed, effective)
  return {
    name,
    fixture,
    loadingMode,
    container: {
      id: container.id,
      length: container.length,
      width: container.width,
      height: container.height,
    },
    placedCount: result.placedCount,
    unplacedCount: unplacedCount(result.unplaced),
    totalCargoCount: result.totalCargoCount,
    usedVolume: result.usedVolume,
    containerVolume: result.containerVolume,
    volumeUtilization: result.volumeUtilization,
    internalNotchVolume: quality?.internalNotchVolume ?? gaps.internalNotchVolume,
    unsupportedSpanRisk: quality?.unsupportedSpanRisk ?? null,
    interCargoMaxMm: quality?.interCargoMaxMm ?? gaps.interCargoMaxMm,
    elapsedMs,
    statesExpanded: search?.statesExpanded ?? null,
    candidatesEvaluated: search?.candidatesEvaluated ?? null,
    budgetExceeded: search?.budgetExceeded ?? null,
    skuPlaced: skuPlaced(items, result),
    gaps,
    search: search ?? null,
  }
}

const vite = await createServer(packingBenchmarkViteConfig(root))
try {
  const [{ calculatePacking, lastPackingSearchStats }, { containers, effectiveContainer }, { packingQualityOf }, { MINIMUM_SUPPORT_RATIO }] = await Promise.all([
    vite.ssrLoadModule('/src/lib/packing.ts'),
    vite.ssrLoadModule('/src/data/containers.ts'),
    vite.ssrLoadModule('/src/lib/packingObjective.ts'),
    vite.ssrLoadModule('/src/lib/packingFeasibility.ts'),
  ])

  const gp20 = containers.find((item) => item.id === '20gp')
  const hq40 = containers.find((item) => item.id === '40hq')
  if (!gp20 || !hq40) throw new Error('missing 20gp or 40hq')

  const fixture0824 = loadJson('test-data/json/0824/input.json')
  const fixture0802 = loadJson('test-data/json/0802/input.json')
  const vietnamInput = loadJson('test-data/json/vietnam-11/input.json')
  const vietnamItems = vietnamInput.items.map((item, index) => ({
    ...item,
    id: `vietnam-${String(index + 1).padStart(2, '0')}`,
  }))

  const jobs = [
    {
      name: '0824-quantity',
      fixture: 'test-data/json/0824/input.json',
      container: fixture0824.container,
      items: cloneItems(fixture0824.items),
      loadingMode: 'quantity',
    },
    {
      name: '0824-volume',
      fixture: 'test-data/json/0824/input.json',
      container: fixture0824.container,
      items: cloneItems(fixture0824.items),
      loadingMode: 'volume',
    },
    {
      name: 'vietnam-20gp-quantity',
      fixture: 'test-data/json/vietnam-11/input.json',
      container: vietnamInput.container,
      items: cloneItems(vietnamItems),
      loadingMode: 'quantity',
    },
    {
      name: 'vietnam-20gp-volume',
      fixture: 'test-data/json/vietnam-11/input.json',
      container: vietnamInput.container,
      items: cloneItems(vietnamItems),
      loadingMode: 'volume',
    },
    {
      name: 'vietnam-40hq-quantity',
      fixture: 'test-data/json/vietnam-11/input.json',
      container: hq40,
      items: cloneItems(vietnamItems),
      loadingMode: 'quantity',
    },
    {
      name: 'vietnam-40hq-volume',
      fixture: 'test-data/json/vietnam-11/input.json',
      container: hq40,
      items: cloneItems(vietnamItems),
      loadingMode: 'volume',
    },
    {
      name: '0802-quantity',
      fixture: 'test-data/json/0802/input.json',
      container: fixture0802.container,
      items: cloneItems(fixture0802.items),
      loadingMode: fixture0802.loadingMode || 'quantity',
    },
    {
      name: '0802-volume',
      fixture: 'test-data/json/0802/input.json',
      container: fixture0802.container,
      items: cloneItems(fixture0802.items),
      loadingMode: 'volume',
    },
    ...[1, 7, 13].map((seed) => ({
      name: `compactness-seed-${seed}`,
      fixture: `packing.compactness.test.ts:seed-${seed}`,
      container: gp20,
      items: seedItems(seed),
      loadingMode: 'quantity',
    })),
  ]

  const runs = []
  for (const job of jobs) {
    const startedAt = Date.now()
    const result = calculatePacking(job.container, job.items, { loadingMode: job.loadingMode })
    const elapsedMs = Date.now() - startedAt
    const effective = effectiveContainer(job.container)
    const quality = packingQualityOf({
      container: effective,
      cargoStates: [],
      emsList: [],
      placed: result.placed,
      placedById: new Map(result.placed.map((box) => [box.id, box])),
      usedWeight: result.usedWeight,
      minSupportRatio: MINIMUM_SUPPORT_RATIO,
    })
    runs.push(summarizeRun(
      job.name,
      job.fixture,
      job.loadingMode,
      job.container,
      job.items,
      result,
      elapsedMs,
      effective,
      lastPackingSearchStats(),
      quality,
    ))
  }

  const report = {
    generatedAt: new Date().toISOString(),
    voxelMm: VOXEL,
    search: null,
    runs,
  }

  mkdirSync(outDir, { recursive: true })
  writeFileSync(outPath, `${JSON.stringify(report, null, 2)}\n`)
  console.log(JSON.stringify(report, null, 2))
  console.error(`wrote ${outPath}`)
} finally {
  await vite.close()
}
