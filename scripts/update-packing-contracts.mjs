import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createServer } from 'vite'
import * as XLSX from 'xlsx'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const outputPath = join(root, 'test-data/baselines/packing-results.json')

function hash(summary) {
  return createHash('sha256').update(JSON.stringify(summary)).digest('hex')
}

const vite = await createServer({ root, configFile: false, server: { middlewareMode: true }, appType: 'custom' })

try {
  const [{ containers }, { parseCargoRows }, { calculatePacking }, { canonicalizePackingResult }] = await Promise.all([
    vite.ssrLoadModule('/src/data/containers.ts'),
    vite.ssrLoadModule('/src/lib/importCargo.ts'),
    vite.ssrLoadModule('/src/lib/packing.ts'),
    vite.ssrLoadModule('/src/lib/packingContract.ts'),
  ])

  const workbook = XLSX.read(readFileSync(join(root, 'test-data/excel/俄罗斯整托装柜尺寸.xlsx')), { type: 'buffer' })
  const rows = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]])
  let russianIndex = 1
  const russianImport = parseCargoRows(rows, {
    createId: () => `russia-pallet-${String(russianIndex++).padStart(2, '0')}`,
  })
  if (russianImport.errors.length > 0 || russianImport.items.length !== 31) {
    throw new Error(`Russian fixture import failed: ${JSON.stringify(russianImport.errors)}`)
  }

  const russianContainer = {
    id: 'custom-russian',
    label: 'Custom Russian container',
    description: '13400 x 2450 x 2650 mm custom container',
    length: 13400,
    width: 2450,
    height: 2650,
    maxWeight: 30_000,
    doorGap: 0,
    topGap: 0,
    sideGap: 0,
  }

  const vietnamInput = JSON.parse(readFileSync(join(root, 'test-data/json/vietnam-11/input.json'), 'utf8'))
  const vietnamItems = vietnamInput.items.map((item, index) => ({
    ...item,
    id: `vietnam-${String(index + 1).padStart(2, '0')}`,
  }))
  const vietnam40hq = containers.find((container) => container.id === '40hq')
  if (!vietnam40hq) throw new Error('Missing 40HQ container fixture')

  const results = {
    'russia-volume': calculatePacking(russianContainer, russianImport.items, { loadingMode: 'volume' }),
    'vietnam-20gp-quantity': calculatePacking(vietnamInput.container, vietnamItems, { loadingMode: 'quantity' }),
    'vietnam-20gp-volume': calculatePacking(vietnamInput.container, vietnamItems, { loadingMode: 'volume' }),
    'vietnam-40hq-quantity': calculatePacking(vietnam40hq, vietnamItems, { loadingMode: 'quantity' }),
    'vietnam-40hq-volume': calculatePacking(vietnam40hq, vietnamItems, { loadingMode: 'volume' }),
  }

  const cases = Object.fromEntries(Object.entries(results).map(([name, result]) => {
    const summary = canonicalizePackingResult(result)
    const sha256 = hash(summary)
    console.log(`${name}: ${result.placedCount}/${result.totalCargoCount} ${sha256}`)
    return [name, { sha256, summary }]
  }))

  mkdirSync(dirname(outputPath), { recursive: true })
  writeFileSync(outputPath, `${JSON.stringify({ schemaVersion: 1, cases }, null, 2)}\n`)
  console.log(`Updated ${outputPath}`)
} finally {
  await vite.close()
}
