import { createHash } from 'node:crypto'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createServer } from 'vite'
import { loadPackingBenchmarkCases, packingBenchmarkViteConfig } from './packing-benchmark-cases.mjs'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const outputPath = join(root, 'test-data/baselines/packing-results.json')

function hash(summary) {
  return createHash('sha256').update(JSON.stringify(summary)).digest('hex')
}

const vite = await createServer(packingBenchmarkViteConfig(root))

try {
  const benchmark = await loadPackingBenchmarkCases(root, vite)
  const cases = Object.fromEntries(benchmark.cases.map(({ name, container, items, options }) => {
    const result = benchmark.calculatePacking(container, items, options)
    const summary = benchmark.canonicalizePackingResult(result)
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
