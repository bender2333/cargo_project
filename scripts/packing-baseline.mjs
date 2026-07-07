// 装箱基线快照脚本（子任务1，块构建重写前的基准）
// 用法: node scripts/packing-baseline.mjs
// 产出: test-data/json/baseline-2026-07-07/<fixture>-<mode>.json
// 指标: placed/util/包络填充率/地面空格率/贯穿缝体素占比 + 每箱坐标
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, resolve, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { calculatePacking } from '../src/lib/packing.ts'
import { effectiveContainer } from '../src/data/containers.ts'

const moduleDir = dirname(fileURLToPath(import.meta.url))
const root = resolve(moduleDir, '..')
const outDir = join(root, 'test-data/json/baseline-2026-07-07')
mkdirSync(outDir, { recursive: true })

const V = 50 // 体素边长mm

function voxelMetrics(placed, container) {
  const c = effectiveContainer(container)
  if (placed.length === 0) return null
  const NX = Math.ceil(c.length / V), NY = Math.ceil(c.width / V), NZ = Math.ceil(c.height / V)
  const occ = new Uint8Array(NX * NY * NZ)
  const idx = (xi, yi, zi) => (xi * NY + yi) * NZ + zi
  for (const b of placed) {
    const x0 = Math.floor(b.x / V), x1 = Math.ceil((b.x + b.length) / V)
    const y0 = Math.floor(b.y / V), y1 = Math.ceil((b.y + b.width) / V)
    const z0 = Math.floor(b.z / V), z1 = Math.ceil((b.z + b.height) / V)
    for (let xi = x0; xi < x1 && xi < NX; xi++)
      for (let yi = y0; yi < y1 && yi < NY; yi++)
        for (let zi = z0; zi < z1 && zi < NZ; zi++) occ[idx(xi, yi, zi)] = 1
  }
  const envX = Math.max(...placed.map((b) => b.x + b.length))
  const envY = Math.max(...placed.map((b) => b.y + b.width))
  const envZ = Math.max(...placed.map((b) => b.z + b.height))
  const EX = Math.ceil(envX / V), EY = Math.ceil(envY / V), EZ = Math.ceil(envZ / V)
  // 包络内填充
  let envFilled = 0
  for (let xi = 0; xi < EX; xi++) for (let yi = 0; yi < EY; yi++) for (let zi = 0; zi < EZ; zi++) if (occ[idx(xi, yi, zi)]) envFilled++
  const envEmpty = EX * EY * EZ - envFilled
  // 地面空格率（z=0层）
  let floorFilled = 0
  for (let xi = 0; xi < NX; xi++) for (let yi = 0; yi < NY; yi++) if (occ[idx(xi, yi, 0)]) floorFilled++
  const floorEmptyPct = ((NX * NY - floorFilled) / (NX * NY)) * 100
  // 贯穿缝：每层占用率的方差 + 平均缺口（包络内各z层）
  const layerFill = []
  for (let zi = 0; zi < EZ; zi++) {
    let f = 0
    for (let xi = 0; xi < EX; xi++) for (let yi = 0; yi < EY; yi++) if (occ[idx(xi, yi, zi)]) f++
    layerFill.push(f / (EX * EY))
  }
  const boxVol = placed.reduce((s, b) => s + b.length * b.width * b.height, 0)
  return {
    envelope: { x: envX, y: envY, z: envZ },
    envelopeFillPct: +(boxVol / (envX * envY * envZ) * 100).toFixed(2),
    envelopeEmptyPct: +(envEmpty / (EX * EY * EZ) * 100).toFixed(2),
    floorEmptyPct: +floorEmptyPct.toFixed(2),
    layerFillProfile: layerFill.map((v) => +(v * 100).toFixed(0)),
  }
}

function summarize(container, items, mode) {
  const t0 = Date.now()
  const res = calculatePacking(container, items, { loadingMode: mode })
  const ms = Date.now() - t0
  const c = effectiveContainer(container)
  const contVol = c.length * c.width * c.height
  const boxVol = res.placed.reduce((s, b) => s + b.length * b.width * b.height, 0)
  return {
    mode,
    ms,
    placed: res.placedCount,
    total: res.totalCargoCount,
    unplaced: res.unplaced.reduce((s, u) => s + u.quantity, 0),
    utilPct: +(boxVol / contVol * 100).toFixed(2),
    voxel: voxelMetrics(res.placed, container),
    boxes: res.placed.map((b) => ({ id: b.id, cargoId: b.cargoId, label: b.label, x: b.x, y: b.y, z: b.z, l: b.length, w: b.width, h: b.height, o: b.orientationKey })),
  }
}

// 夹具：越南十一批真实输入（20GP，来自 debug snapshot）
const vn = JSON.parse(readFileSync(join(root, 'test-data/json/vietnam-11/input.json'), 'utf8'))
for (const mode of ['quantity', 'volume']) {
  const snap = summarize(vn.container, vn.items, mode)
  writeFileSync(join(outDir, `vietnam-11-${mode}.json`), JSON.stringify(snap, null, 2))
  const vx = snap.voxel
  console.log(`[vietnam-11 ${mode}] placed=${snap.placed}/${snap.total} util=${snap.utilPct}% 包络填充=${vx.envelopeFillPct}% 地面空格=${vx.floorEmptyPct}% ${snap.ms}ms`)
}
console.log('baseline written to', outDir)
