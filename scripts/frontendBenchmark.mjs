import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { gzipSync } from 'node:zlib'
import { JSDOM } from 'jsdom'
import { createServer } from 'vite'
import { loadPackingBenchmarkCases, packingBenchmarkViteConfig } from './packing-benchmark-cases.mjs'

export const REQUIRED_ALGORITHM_CASES = [
  'russia-volume',
  'vietnam-20gp-quantity',
  'vietnam-20gp-volume',
  'vietnam-40hq-quantity',
  'vietnam-40hq-volume',
]

export const REQUIRED_BROWSER_METRICS = [
  'loginClickToInteractiveMs',
  'automaticLoadToResultMs',
  'canvasFirstNonEmptyPixelsMs',
  'viewportResizeToStableCanvasMs',
]

export const REQUIRED_ALGORITHM_ITERATIONS = {
  'russia-volume': 500,
  'vietnam-20gp-quantity': 10,
  'vietnam-20gp-volume': 10,
  'vietnam-40hq-quantity': 1,
  'vietnam-40hq-volume': 1,
}

export const REQUIRED_BROWSER_ITERATIONS = {
  loginClickToInteractiveMs: 3,
  automaticLoadToResultMs: 50,
  canvasFirstNonEmptyPixelsMs: 4,
  viewportResizeToStableCanvasMs: 4,
}

const requiredBundleFields = [
  'initialHtmlGzipBytes',
  'initialCssGzipBytes',
  'initialJsGzipBytes',
  'initialGzipBytes',
  'totalJsGzipBytes',
]

export function summarizeSamples(samples) {
  if (samples.length !== 5) throw new Error(`Expected exactly 5 samples, received ${samples.length}`)
  const sorted = [...samples].sort((a, b) => a - b)
  return { samples, medianMs: sorted[2], p95Ms: sorted[Math.ceil(sorted.length * 0.95) - 1] }
}

export function measureAverage(run, iterations, now = () => performance.now()) {
  const start = now()
  let result
  for (let index = 0; index < iterations; index += 1) result = run()
  return { result, durationMs: (now() - start) / iterations }
}

export function initialAssetFiles(html) {
  const base = new URL('http://benchmark.local')
  const dom = new JSDOM(html)
  const urls = [
    ...[...dom.window.document.querySelectorAll('script[src]')].map((element) => element.getAttribute('src')),
    ...[...dom.window.document.querySelectorAll('link[href]')]
      .filter((element) => element.relList.contains('stylesheet') || element.relList.contains('modulepreload'))
      .map((element) => element.getAttribute('href')),
  ]
  dom.window.close()
  return [...new Set(urls.flatMap((value) => {
    if (!value) return []
    const url = new URL(value, base)
    return url.origin === base.origin ? [decodeURIComponent(url.pathname).replace(/^\/+/, '')] : []
  }))].sort()
}

export function summarizeBundleAssets(initialFiles, componentGzipBytes) {
  const initial = [...new Set(initialFiles)].sort()
  const missing = initial.filter((name) => !Object.hasOwn(componentGzipBytes, name))
  if (missing.length > 0) throw new Error(`Initial assets were not measured: ${missing.join(', ')}`)
  const sum = (files) => files.reduce((total, name) => total + componentGzipBytes[name], 0)
  return {
    initialFiles: initial,
    initialHtmlGzipBytes: sum(initial.filter((name) => name.endsWith('.html'))),
    initialCssGzipBytes: sum(initial.filter((name) => name.endsWith('.css'))),
    initialJsGzipBytes: sum(initial.filter((name) => name.endsWith('.js'))),
    initialGzipBytes: sum(initial),
    totalJsGzipBytes: sum(Object.keys(componentGzipBytes).filter((name) => name.endsWith('.js'))),
    componentGzipBytes,
  }
}

const comparableEnvironmentFields = [
  'platform',
  'arch',
  'cpu',
  'logicalCpus',
  'nodeMajor',
  'browserMajor',
  'browserTarget',
  'browserRuntime',
]

function exactKeyFailures(label, value, requiredKeys) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return [`${label} must be an object`]
  const actualKeys = Object.keys(value)
  const missing = requiredKeys.filter((key) => !actualKeys.includes(key))
  const extra = actualKeys.filter((key) => !requiredKeys.includes(key))
  return [
    ...(missing.length > 0 ? [`${label} missing keys: ${missing.join(', ')}`] : []),
    ...(extra.length > 0 ? [`${label} unexpected keys: ${extra.join(', ')}`] : []),
  ]
}

function finiteNonNegative(value) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
}

export function validateBenchmarkReport(report) {
  const failures = []
  if (report?.schemaVersion !== 1) failures.push('schemaVersion must be 1')
  failures.push(...exactKeyFailures('contractHashes', report?.contractHashes, REQUIRED_ALGORITHM_CASES))
  failures.push(...exactKeyFailures('algorithm.cases', report?.algorithm?.cases, REQUIRED_ALGORITHM_CASES))
  failures.push(...exactKeyFailures('browser.metrics', report?.browser?.metrics, REQUIRED_BROWSER_METRICS))

  if (report?.algorithm?.warmupRuns !== 1 || report?.algorithm?.sampleRuns !== 5) {
    failures.push('algorithm must use one warmup and five samples')
  }
  if (report?.browser?.warmupRuns !== 1 || report?.browser?.sampleRuns !== 5) {
    failures.push('browser must use one warmup and five samples')
  }

  for (const field of comparableEnvironmentFields) {
    const value = report?.environment?.[field]
    if (value === undefined || value === null || value === '') failures.push(`environment.${field} is required`)
  }

  for (const name of REQUIRED_ALGORITHM_CASES) {
    const digest = report?.contractHashes?.[name]
    if (typeof digest !== 'string' || !/^[a-f0-9]{64}$/.test(digest)) failures.push(`contractHashes.${name} must be SHA-256`)
    const metric = report?.algorithm?.cases?.[name]
    if (!Array.isArray(metric?.samples) || metric.samples.length !== 5 || !metric.samples.every(finiteNonNegative)) {
      failures.push(`algorithm.${name}.samples must contain five finite non-negative values`)
    }
    if (!finiteNonNegative(metric?.medianMs) || !finiteNonNegative(metric?.p95Ms)) {
      failures.push(`algorithm.${name} summary must be finite and non-negative`)
    }
    if (metric?.iterationsPerSample !== REQUIRED_ALGORITHM_ITERATIONS[name]) {
      failures.push(`algorithm.${name}.iterationsPerSample must be ${REQUIRED_ALGORITHM_ITERATIONS[name]}`)
    }
  }

  for (const name of REQUIRED_BROWSER_METRICS) {
    const metric = report?.browser?.metrics?.[name]
    if (!Array.isArray(metric?.samples) || metric.samples.length !== 5 || !metric.samples.every(finiteNonNegative)) {
      failures.push(`browser.${name}.samples must contain five finite non-negative values`)
    }
    if (!finiteNonNegative(metric?.medianMs) || !finiteNonNegative(metric?.p95Ms)) {
      failures.push(`browser.${name} summary must be finite and non-negative`)
    }
    if (metric?.iterationsPerSample !== REQUIRED_BROWSER_ITERATIONS[name]) {
      failures.push(`browser.${name}.iterationsPerSample must be ${REQUIRED_BROWSER_ITERATIONS[name]}`)
    }
  }

  for (const field of requiredBundleFields) {
    if (!finiteNonNegative(report?.bundle?.[field])) failures.push(`bundle.${field} must be finite and non-negative`)
  }
  if (!Array.isArray(report?.bundle?.initialFiles) || report.bundle.initialFiles.length === 0) {
    failures.push('bundle.initialFiles must be a non-empty array')
  } else {
    for (const name of report.bundle.initialFiles) {
      if (!finiteNonNegative(report?.bundle?.componentGzipBytes?.[name])) {
        failures.push(`bundle initial asset is missing or invalid: ${name}`)
      }
    }
  }
  return failures
}

function validateHardGateBaseline(report) {
  const failures = []
  if (report?.schemaVersion !== 1) failures.push('schemaVersion must be 1')
  failures.push(...exactKeyFailures('contractHashes', report?.contractHashes, REQUIRED_ALGORITHM_CASES))
  for (const name of REQUIRED_ALGORITHM_CASES) {
    const digest = report?.contractHashes?.[name]
    if (typeof digest !== 'string' || !/^[a-f0-9]{64}$/.test(digest)) failures.push(`contractHashes.${name} must be SHA-256`)
  }
  for (const field of requiredBundleFields) {
    if (!finiteNonNegative(report?.bundle?.[field])) failures.push(`bundle.${field} must be finite and non-negative`)
  }
  if (!Array.isArray(report?.bundle?.initialFiles) || report.bundle.initialFiles.length === 0) {
    failures.push('bundle.initialFiles must be a non-empty array')
  } else {
    for (const name of report.bundle.initialFiles) {
      if (!finiteNonNegative(report?.bundle?.componentGzipBytes?.[name])) {
        failures.push(`bundle initial asset is missing or invalid: ${name}`)
      }
    }
  }
  return failures
}

function hardGateComparisonFailures(baseline, actual) {
  const failures = []
  for (const [name, hash] of Object.entries(baseline.contractHashes)) {
    if (actual.contractHashes[name] !== hash) failures.push(`${name} contract hash mismatch`)
  }
  for (const [field, label] of [
    ['initialHtmlGzipBytes', 'initial HTML gzip'],
    ['initialCssGzipBytes', 'initial CSS gzip'],
    ['initialJsGzipBytes', 'initial JS gzip'],
    ['initialGzipBytes', 'initial total gzip'],
  ]) {
    if (actual.bundle[field] > baseline.bundle[field]) failures.push(`${label} increased`)
  }
  if (actual.bundle.totalJsGzipBytes > baseline.bundle.totalJsGzipBytes * 1.05) {
    failures.push('total JS gzip exceeded 5%')
  }
  return failures
}

export function gateBenchmarkUpdate(baseline, actual) {
  const failures = [
    ...validateHardGateBaseline(baseline).map((failure) => `baseline ${failure}`),
    ...validateBenchmarkReport(actual).map((failure) => `actual ${failure}`),
  ]
  if (failures.length > 0) return { failures }
  failures.push(...hardGateComparisonFailures(baseline, actual))
  return { failures }
}

export function gateBenchmark(baseline, actual) {
  const failures = [
    ...validateBenchmarkReport(baseline).map((failure) => `baseline ${failure}`),
    ...validateBenchmarkReport(actual).map((failure) => `actual ${failure}`),
  ]
  const timingComparable = failures.length === 0 && comparableEnvironmentFields.every(
    (field) => baseline.environment[field] === actual.environment[field],
  )

  if (failures.length > 0) return { timingComparable, failures }

  failures.push(...hardGateComparisonFailures(baseline, actual))

  if (timingComparable) {
    for (const section of ['algorithm', 'browser']) {
      const baselineMetrics = section === 'algorithm' ? baseline.algorithm.cases : baseline.browser.metrics
      const actualMetrics = section === 'algorithm' ? actual.algorithm.cases : actual.browser.metrics
      for (const [name, expected] of Object.entries(baselineMetrics)) {
        for (const statistic of ['medianMs', 'p95Ms']) {
          if (actualMetrics[name][statistic] > expected[statistic] * 1.2) {
            failures.push(`${section}.${name}.${statistic} exceeded 20%`)
          }
        }
      }
    }
  }

  return { timingComparable, failures }
}

const scriptPath = fileURLToPath(import.meta.url)
const root = resolve(dirname(scriptPath), '..')
const resultDir = join(root, 'test-results/benchmark')
const baselinePath = join(root, 'test-data/baselines/frontend-architecture.json')
const actualPath = join(resultDir, 'frontend-architecture.json')

function run(command) {
  const result = spawnSync(command, { cwd: root, shell: true, stdio: 'inherit' })
  if (result.status !== 0) throw new Error(`Command failed (${result.status}): ${command}`)
}

function hash(value) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex')
}

function filesUnder(directory) {
  return readdirSync(directory).flatMap((name) => {
    const path = join(directory, name)
    return statSync(path).isDirectory() ? filesUnder(path) : [path]
  })
}

function measureBundle() {
  const dist = join(root, 'dist')
  const initialFiles = new Set(['index.html', ...initialAssetFiles(readFileSync(join(dist, 'index.html'), 'utf8'))])
  const componentGzipBytes = {}
  for (const path of filesUnder(dist)) {
    const name = relative(dist, path).replaceAll('\\', '/')
    if (!/\.(html|css|js)$/.test(name)) continue
    componentGzipBytes[name] = gzipSync(readFileSync(path), { level: 9 }).length
  }
  return summarizeBundleAssets([...initialFiles], componentGzipBytes)
}

async function measureAlgorithmCase(golden, caseName) {
  const vite = await createServer(packingBenchmarkViteConfig(root))
  try {
    const benchmark = await loadPackingBenchmarkCases(root, vite)
    const input = benchmark.cases.find(({ name }) => name === caseName)
    if (!input) throw new Error(`Missing required algorithm benchmark case: ${caseName}`)
    const iterationsPerSample = REQUIRED_ALGORITHM_ITERATIONS[input.name]
    const calculate = () => benchmark.calculatePacking(input.container, input.items, input.options)
    const verify = (result) => {
      const digest = hash(benchmark.canonicalizePackingResult(result))
      if (digest !== golden.cases[input.name]?.sha256) {
        throw new Error(`${input.name} differs from the frozen packing contract`)
      }
      return digest
    }
    global.gc?.()
    verify(measureAverage(calculate, iterationsPerSample).result)
    const samples = []
    let contractHash
    for (let index = 0; index < 5; index += 1) {
      global.gc?.()
      const { result, durationMs } = measureAverage(calculate, iterationsPerSample)
      samples.push(Number(durationMs.toFixed(3)))
      contractHash = verify(result)
    }
    return {
      name: input.name,
      metric: { ...summarizeSamples(samples), iterationsPerSample },
      contractHash,
    }
  } finally {
    await vite.close()
  }
}

async function measureAlgorithm() {
  const cases = {}
  const contractHashes = {}
  for (const name of REQUIRED_ALGORITHM_CASES) {
    const child = spawnSync(process.execPath, ['--expose-gc', scriptPath, '--algorithm-case', name], {
      cwd: root,
      encoding: 'utf8',
      maxBuffer: 10 * 1024 * 1024,
    })
    if (child.status !== 0) {
      throw new Error(`Algorithm benchmark worker failed for ${name}:\n${child.stdout}\n${child.stderr}`)
    }
    const resultLine = child.stdout.split(/\r?\n/).find((line) => line.startsWith('BENCHMARK_CASE='))
    if (!resultLine) throw new Error(`Algorithm benchmark worker returned no result for ${name}`)
    const result = JSON.parse(resultLine.slice('BENCHMARK_CASE='.length))
    cases[result.name] = result.metric
    contractHashes[result.name] = result.contractHash
  }
  return { cases, contractHashes }
}

async function main() {
  const update = process.argv.includes('--update')
  mkdirSync(resultDir, { recursive: true })
  run('npm run build')
  const algorithm = await measureAlgorithm()
  run('npx playwright test --config=playwright.benchmark.config.ts')
  const browserRaw = JSON.parse(readFileSync(join(resultDir, 'browser.json'), 'utf8'))
  const browser = {
    warmupRuns: 1,
    sampleRuns: 5,
    metrics: Object.fromEntries(Object.entries(browserRaw.metrics).map(([name, metric]) => [name, {
      ...summarizeSamples(metric.samples),
      iterationsPerSample: metric.iterationsPerSample,
    }])),
  }
  const cpus = os.cpus()
  const actual = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    environment: {
      platform: process.platform,
      arch: process.arch,
      cpu: cpus[0]?.model ?? 'unknown',
      logicalCpus: cpus.length,
      node: process.version,
      nodeMajor: Number(process.versions.node.split('.')[0]),
      browser: browserRaw.browserVersion,
      browserMajor: Number(browserRaw.browserVersion.split('.')[0]),
      browserTarget: browserRaw.browserTarget,
      browserRuntime: browserRaw.browserRuntime,
    },
    contractHashes: algorithm.contractHashes,
    algorithm: { warmupRuns: 1, sampleRuns: 5, cases: algorithm.cases },
    browser,
    bundle: measureBundle(),
  }
  const reportFailures = validateBenchmarkReport(actual)
  if (reportFailures.length > 0) throw new Error(`Invalid frontend benchmark report:\n- ${reportFailures.join('\n- ')}`)
  writeFileSync(actualPath, `${JSON.stringify(actual, null, 2)}\n`)

  if (update) {
    if (existsSync(baselinePath)) {
      const hardGate = gateBenchmarkUpdate(JSON.parse(readFileSync(baselinePath, 'utf8')), actual)
      if (hardGate.failures.length > 0) {
        throw new Error(`Frontend benchmark baseline update rejected by hard gates:\n- ${hardGate.failures.join('\n- ')}`)
      }
    }
    writeFileSync(baselinePath, `${JSON.stringify(actual, null, 2)}\n`)
    console.log(`Updated ${baselinePath}`)
    return
  }
  if (!existsSync(baselinePath)) throw new Error(`Missing benchmark baseline: ${baselinePath}`)
  const gate = gateBenchmark(JSON.parse(readFileSync(baselinePath, 'utf8')), actual)
  if (!gate.timingComparable) console.warn('Timing gates not comparable on this environment; contract and bundle gates still ran.')
  if (gate.failures.length > 0) throw new Error(`Frontend benchmark failed:\n- ${gate.failures.join('\n- ')}`)
  console.log(`Frontend benchmark passed (${gate.timingComparable ? 'timings comparable' : 'timings not comparable'}).`)
}

if (process.argv[1] && resolve(process.argv[1]) === scriptPath) {
  const caseFlagIndex = process.argv.indexOf('--algorithm-case')
  const command = caseFlagIndex >= 0
    ? measureAlgorithmCase(
        JSON.parse(readFileSync(join(root, 'test-data/baselines/packing-results.json'), 'utf8')),
        process.argv[caseFlagIndex + 1],
      ).then((result) => console.log(`BENCHMARK_CASE=${JSON.stringify(result)}`))
    : main()
  command.catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
}
