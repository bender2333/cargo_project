import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import * as XLSX from 'xlsx'

export function packingBenchmarkViteConfig(root) {
  return {
    root,
    configFile: false,
    optimizeDeps: { noDiscovery: true },
    server: { middlewareMode: true },
    appType: 'custom',
  }
}

export async function loadPackingBenchmarkCases(root, vite) {
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

  return {
    calculatePacking,
    canonicalizePackingResult,
    cases: [
      { name: 'russia-volume', container: russianContainer, items: russianImport.items, options: { loadingMode: 'volume' } },
      { name: 'vietnam-20gp-quantity', container: vietnamInput.container, items: vietnamItems, options: { loadingMode: 'quantity' } },
      { name: 'vietnam-20gp-volume', container: vietnamInput.container, items: vietnamItems, options: { loadingMode: 'volume' } },
      { name: 'vietnam-40hq-quantity', container: vietnam40hq, items: vietnamItems, options: { loadingMode: 'quantity' } },
      { name: 'vietnam-40hq-volume', container: vietnam40hq, items: vietnamItems, options: { loadingMode: 'volume' } },
    ],
  }
}
