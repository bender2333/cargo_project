import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createServer } from 'vite'
import { loadPackingBenchmarkCases, packingBenchmarkViteConfig } from './packing-benchmark-cases.mjs'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const defaultOutputPath = join(root, 'test-data/baselines/packing-results.json')

let outputPath = defaultOutputPath
let allowRegression = false
for (let index = 2; index < process.argv.length; index += 1) {
  const argument = process.argv[index]
  if (argument === '--allow-regression') {
    allowRegression = true
  } else if (argument === '--output' && process.argv[index + 1]) {
    outputPath = resolve(process.argv[++index])
  } else {
    throw new Error(`Unknown or incomplete argument: ${argument}`)
  }
}

const previous = JSON.parse(readFileSync(outputPath, 'utf8'))

function hash(summary) {
  return createHash('sha256').update(JSON.stringify(summary)).digest('hex')
}

const vite = await createServer(packingBenchmarkViteConfig(root))

try {
  const benchmark = await loadPackingBenchmarkCases(root, vite)
  const cases = Object.fromEntries(benchmark.cases.map(({ name, container, items, options }) => {
    const result = benchmark.calculatePacking(container, items, options)
    const summary = benchmark.canonicalizePackingResult(result)
    return [name, { sha256: hash(summary), summary }]
  }))
  const generatedNames = new Set(Object.keys(cases))
  const missingGeneratedNames = Object.keys(previous.cases).filter((name) => !generatedNames.has(name))
  if (missingGeneratedNames.length > 0) {
    throw new Error(`Missing generated packing contract case: ${missingGeneratedNames.join(', ')}`)
  }
  const comparisons = Object.entries(cases).map(([name, candidate]) => {
    const existing = previous.cases[name]
    if (!existing) throw new Error(`Missing existing packing contract case: ${name}`)
    return {
      name,
      oldPlaced: existing.summary.totals.placedCount,
      oldTotal: existing.summary.totals.totalCargoCount,
      newPlaced: candidate.summary.totals.placedCount,
      newTotal: candidate.summary.totals.totalCargoCount,
      oldBoxes: existing.summary.placements.length,
      newBoxes: candidate.summary.placements.length,
      hashChanged: existing.sha256 !== candidate.sha256,
    }
  })

  console.log('case | old placed/total | new placed/total | delta | hash changed')
  for (const comparison of comparisons) {
    const delta = comparison.newPlaced - comparison.oldPlaced
    console.log(`${comparison.name} | ${comparison.oldPlaced}/${comparison.oldTotal} | ${comparison.newPlaced}/${comparison.newTotal} | ${delta >= 0 ? '+' : ''}${delta} | ${comparison.hashChanged ? 'yes' : 'no'}`)
  }

  const regressions = comparisons.flatMap((comparison) => [
    ...(comparison.newPlaced < comparison.oldPlaced
      ? [`${comparison.name}: placedCount ${comparison.oldPlaced} -> ${comparison.newPlaced}`]
      : []),
    ...(comparison.newBoxes < comparison.oldBoxes
      ? [`${comparison.name}: boxes ${comparison.oldBoxes} -> ${comparison.newBoxes}`]
      : []),
  ])

  if (regressions.length > 0 && !allowRegression) {
    console.error(`Refusing to update packing contracts:\n${regressions.join('\n')}\nRe-run with --allow-regression only after approval.`)
    process.exitCode = 1
  } else {
    if (regressions.length > 0) {
      console.warn(`WARNING: Allowing packing regressions:\n${regressions.join('\n')}\nYou must record a decision explaining this regression.`)
    }
    mkdirSync(dirname(outputPath), { recursive: true })
    writeFileSync(outputPath, `${JSON.stringify({ schemaVersion: 1, cases }, null, 2)}\n`)
    console.log(`Updated ${outputPath}`)
  }
} finally {
  await vite.close()
}
