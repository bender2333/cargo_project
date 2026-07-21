import { describe, expect, it } from 'vitest'
import * as frontendBenchmark from './frontendBenchmark.mjs'
import * as packingBenchmarkCases from './packing-benchmark-cases.mjs'

const {
  gateBenchmark,
  gateBenchmarkUpdate,
  REQUIRED_ALGORITHM_ITERATIONS,
  REQUIRED_ALGORITHM_CASES,
  REQUIRED_BROWSER_ITERATIONS,
  REQUIRED_BROWSER_METRICS,
  summarizeSamples,
  validateBenchmarkReport,
} = frontendBenchmark

const stableHash = 'a'.repeat(64)

function metric(value = 100) {
  return { samples: [value, value, value, value, value], medianMs: value, p95Ms: value }
}

function benchmark(overrides = {}) {
  const base = {
    schemaVersion: 1,
    environment: {
      platform: 'win32',
      arch: 'x64',
      cpu: 'Benchmark CPU',
      logicalCpus: 8,
      nodeMajor: 24,
      browserMajor: 140,
      browserTarget: 'http://127.0.0.1:5176',
      browserRuntime: 'production-preview',
    },
    contractHashes: Object.fromEntries(REQUIRED_ALGORITHM_CASES.map((name) => [name, stableHash])),
    algorithm: {
      warmupRuns: 1,
      sampleRuns: 5,
      cases: Object.fromEntries(REQUIRED_ALGORITHM_CASES.map((name) => [name, {
        ...metric(),
        iterationsPerSample: REQUIRED_ALGORITHM_ITERATIONS[name],
      }])),
    },
    browser: {
      warmupRuns: 1,
      sampleRuns: 5,
      metrics: Object.fromEntries(REQUIRED_BROWSER_METRICS.map((name) => [name, {
        ...metric(),
        iterationsPerSample: REQUIRED_BROWSER_ITERATIONS[name],
      }])),
    },
    bundle: {
      initialFiles: ['assets/main.css', 'assets/main.js', 'index.html'],
      initialHtmlGzipBytes: 100,
      initialCssGzipBytes: 200,
      initialJsGzipBytes: 700,
      initialGzipBytes: 1_000,
      totalJsGzipBytes: 1_000,
      componentGzipBytes: {
        'assets/lazy.js': 300,
        'assets/main.css': 200,
        'assets/main.js': 700,
        'index.html': 100,
      },
    },
  }
  return {
    ...base,
    ...overrides,
    environment: { ...base.environment, ...overrides.environment },
    contractHashes: { ...base.contractHashes, ...overrides.contractHashes },
    algorithm: {
      ...base.algorithm,
      ...overrides.algorithm,
      cases: { ...base.algorithm.cases, ...overrides.algorithm?.cases },
    },
    browser: {
      ...base.browser,
      ...overrides.browser,
      metrics: { ...base.browser.metrics, ...overrides.browser?.metrics },
    },
    bundle: { ...base.bundle, ...overrides.bundle },
  }
}

function setTiming(report, value) {
  for (const name of REQUIRED_ALGORITHM_CASES) {
    report.algorithm.cases[name] = { ...metric(value), iterationsPerSample: REQUIRED_ALGORITHM_ITERATIONS[name] }
  }
  for (const name of REQUIRED_BROWSER_METRICS) {
    report.browser.metrics[name] = { ...metric(value), iterationsPerSample: REQUIRED_BROWSER_ITERATIONS[name] }
  }
  return report
}

describe('frontend architecture benchmark gates', () => {
  it('disables Vite dependency discovery during deterministic algorithm sampling', () => {
    expect(packingBenchmarkCases.packingBenchmarkViteConfig).toBeTypeOf('function')
    expect(packingBenchmarkCases.packingBenchmarkViteConfig?.('C:/repo')).toMatchObject({
      root: 'C:/repo',
      configFile: false,
      optimizeDeps: { noDiscovery: true },
      server: { middlewareMode: true },
      appType: 'custom',
    })
  })

  it('reads only initial scripts, module preloads, and stylesheets from production HTML', () => {
    const html = `
      <link rel="stylesheet" href="/assets/main.css">
      <link rel="modulepreload" href="/assets/shared.js">
      <link rel="prefetch" href="/assets/lazy.js">
      <script type="module" src="/assets/entry.js"></script>
    `

    expect(frontendBenchmark.initialAssetFiles).toBeTypeOf('function')
    expect(frontendBenchmark.initialAssetFiles?.(html)).toEqual([
      'assets/entry.js',
      'assets/main.css',
      'assets/shared.js',
    ])
  })

  it('fails when production HTML references an asset missing from bundle measurement', () => {
    expect(() => frontendBenchmark.summarizeBundleAssets?.(
      ['index.html', 'assets/missing.js'],
      { 'index.html': 100 },
    )).toThrow('assets/missing.js')
  })

  it('summarizes exactly five samples with a median and nearest-rank P95', () => {
    expect(summarizeSamples([50, 10, 30, 20, 40])).toEqual({
      samples: [50, 10, 30, 20, 40],
      medianMs: 30,
      p95Ms: 50,
    })
    expect(() => summarizeSamples([1, 2, 3, 4])).toThrow('exactly 5')
  })

  it('reports the per-operation average for a batched timing sample', () => {
    let elapsed = 0
    expect(frontendBenchmark.measureAverage).toBeTypeOf('function')
    expect(frontendBenchmark.measureAverage?.(() => {
      elapsed += 4
      return elapsed
    }, 10, () => elapsed)).toEqual({ result: 40, durationMs: 4 })
  })

  it('passes exact timing and bundle growth boundaries', () => {
    const actual = setTiming(benchmark({ bundle: { totalJsGzipBytes: 1_050 } }), 120)

    expect(gateBenchmark(benchmark(), actual)).toEqual({ timingComparable: true, failures: [] })
  })

  it('fails values above timing and bundle growth boundaries', () => {
    const actual = setTiming(benchmark({
      bundle: { initialJsGzipBytes: 701, initialGzipBytes: 1_001, totalJsGzipBytes: 1_051 },
    }), 120.01)

    expect(gateBenchmark(benchmark(), actual).failures).toEqual(expect.arrayContaining([
      expect.stringContaining('algorithm.russia-volume.medianMs'),
      expect.stringContaining('browser.loginClickToInteractiveMs.p95Ms'),
      'initial JS gzip increased',
      'initial total gzip increased',
      'total JS gzip exceeded 5%',
    ]))
  })

  it('always checks contracts and bundle gates when timings are not comparable', () => {
    const baseline = benchmark()
    const actual = benchmark({
      environment: { ...baseline.environment, cpu: 'Different CPU' },
      contractHashes: { [REQUIRED_ALGORITHM_CASES[0]]: 'b'.repeat(64) },
      bundle: { initialHtmlGzipBytes: 101, initialGzipBytes: 1_001 },
    })

    const result = gateBenchmark(baseline, actual)
    expect(result.timingComparable).toBe(false)
    expect(result.failures).toEqual(expect.arrayContaining([
      expect.stringContaining('contract hash'),
      expect.stringContaining('initial HTML gzip'),
    ]))
  })

  it('does not let a shrinking CSS asset hide initial JavaScript growth', () => {
    const actual = benchmark({
      bundle: { initialCssGzipBytes: 199, initialJsGzipBytes: 701, initialGzipBytes: 1_000 },
    })

    expect(gateBenchmark(benchmark(), actual).failures).toEqual(['initial JS gzip increased'])
  })

  it('allows timing rebaselines without allowing hard-gate regressions', () => {
    const baseline = benchmark()
    baseline.algorithm.cases['russia-volume'].iterationsPerSample = 100
    const slower = setTiming(benchmark(), 500)
    expect(gateBenchmarkUpdate(baseline, slower).failures).toEqual([])

    slower.bundle.initialJsGzipBytes += 1
    expect(gateBenchmarkUpdate(baseline, slower).failures).toContain('initial JS gzip increased')
  })

  it('does not compare timings across browser targets or runtime modes', () => {
    const baseline = benchmark()

    expect(gateBenchmark(baseline, benchmark({
      environment: { ...baseline.environment, browserTarget: 'http://101.33.232.150' },
    })).timingComparable).toBe(false)
    expect(gateBenchmark(baseline, benchmark({
      environment: { ...baseline.environment, browserRuntime: 'external' },
    })).timingComparable).toBe(false)
  })

  it('rejects missing or extra benchmark cases and metrics', () => {
    const missing = benchmark()
    delete missing.algorithm.cases[REQUIRED_ALGORITHM_CASES[0]]
    delete missing.browser.metrics[REQUIRED_BROWSER_METRICS[0]]
    const extra = benchmark()
    extra.contractHashes.unplanned = stableHash

    expect(validateBenchmarkReport(missing)).toEqual(expect.arrayContaining([
      expect.stringContaining('algorithm.cases missing keys'),
      expect.stringContaining('browser.metrics missing keys'),
    ]))
    expect(validateBenchmarkReport(extra)).toContain('contractHashes unexpected keys: unplanned')
  })

  it('rejects non-finite samples, missing bundle fields, and missing initial assets', () => {
    const report = benchmark()
    report.algorithm.cases[REQUIRED_ALGORITHM_CASES[0]].samples[0] = Number.NaN
    report.bundle.totalJsGzipBytes = undefined
    report.bundle.initialFiles.push('assets/missing.js')
    report.browser.metrics[REQUIRED_BROWSER_METRICS[0]].iterationsPerSample = 1

    expect(validateBenchmarkReport(report)).toEqual(expect.arrayContaining([
      expect.stringContaining('samples must contain five finite non-negative values'),
      'bundle.totalJsGzipBytes must be finite and non-negative',
      'bundle initial asset is missing or invalid: assets/missing.js',
      `browser.${REQUIRED_BROWSER_METRICS[0]}.iterationsPerSample must be ${REQUIRED_BROWSER_ITERATIONS[REQUIRED_BROWSER_METRICS[0]]}`,
    ]))
  })
})
