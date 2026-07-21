import fs from 'node:fs/promises'
import path from 'node:path'
import { expect, test } from '@playwright/test'
import type { Locator, Page } from '@playwright/test'

const outputPath = path.join(process.cwd(), 'test-results/benchmark/browser.json')

type TimedCondition = 'interactive' | 'boxes' | 'pixels'

async function timedClickToCondition(trigger: Locator, condition: TimedCondition) {
  return trigger.evaluate(async (element, expectedCondition) => {
    const isVisible = (target: Element | null) => {
      if (!(target instanceof HTMLElement)) return false
      const style = window.getComputedStyle(target)
      return style.display !== 'none' && style.visibility !== 'hidden' && target.getClientRects().length > 0
    }
    const hasNonEmptyPixels = () => {
      const source = document.querySelector('[data-testid="container-scene"] canvas') as HTMLCanvasElement | null
      if (!source || source.width === 0 || source.height === 0) return false
      const gl = source.getContext('webgl2') ?? source.getContext('webgl')
      if (!gl) return false
      const pixel = new Uint8Array(4)
      const colors = new Set<string>()
      for (let x = 1; x < 8; x += 1) {
        for (let y = 1; y < 8; y += 1) {
          gl.readPixels(Math.floor(source.width * x / 8), Math.floor(source.height * y / 8), 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel)
          colors.add(pixel.join(','))
        }
      }
      return colors.size > 1
    }
    const conditionMet = () => {
      if (expectedCondition === 'interactive') {
        const report = document.querySelector('[data-testid="report-panel"]')
        const loadButton = [...document.querySelectorAll('button')].find(
          (button) => /^(Load|装箱)$/.test(button.textContent?.trim() ?? ''),
        )
        return isVisible(report) && Boolean(loadButton && !loadButton.disabled)
      }
      if (expectedCondition === 'boxes') {
        const scene = document.querySelector('[data-testid="container-scene"]')
        return Number(scene?.getAttribute('data-box-count') ?? 0) > 0
      }
      return hasNonEmptyPixels()
    }

    const start = performance.now()
    ;(element as HTMLButtonElement).click()
    await new Promise<void>((resolve, reject) => {
      const timeout = window.setTimeout(() => reject(new Error(`Timed condition did not complete: ${expectedCondition}`)), 60_000)
      const poll = () => {
        if (conditionMet()) {
          window.clearTimeout(timeout)
          resolve()
          return
        }
        requestAnimationFrame(poll)
      }
      requestAnimationFrame(poll)
    })
    return performance.now() - start
  }, condition)
}

async function measure(run: () => Promise<number>, beforeSample: () => Promise<void>, iterationsPerSample = 1) {
  for (let iteration = 0; iteration < iterationsPerSample; iteration += 1) {
    await beforeSample()
    await run()
  }
  const samples = []
  for (let index = 0; index < 5; index += 1) {
    let total = 0
    for (let iteration = 0; iteration < iterationsPerSample; iteration += 1) {
      await beforeSample()
      total += await run()
    }
    samples.push(Number((total / iterationsPerSample).toFixed(3)))
  }
  return { samples, iterationsPerSample }
}

async function login(page: Page) {
  await page.goto('/')
  await page.fill('#username', 'admin')
  await page.fill('#password', 'admin123')
  const elapsed = await timedClickToCondition(page.locator('button[type="submit"]'), 'interactive')
  await expect(page.getByTestId('report-panel')).toBeVisible()
  await expect(page.getByRole('button', { name: /^(Load|装箱)$/ })).toBeEnabled()
  await page.waitForLoadState('networkidle')
  return elapsed
}

async function automaticLoad(page: Page, iteration: number) {
  const mode = iteration % 2 === 0 ? 'volume' : 'quantity'
  await page.getByTestId('loading-rules-panel').getByRole('combobox').selectOption(mode)
  const scene = page.getByTestId('container-scene')
  await expect(scene).toHaveAttribute('data-box-count', '0')
  const elapsed = await timedClickToCondition(page.getByRole('button', { name: /^(Load|装箱)$/ }), 'boxes')
  await expect(scene).toHaveAttribute('data-box-count', /^[1-9]\d*$/)
  return elapsed
}

async function canvasFirstPixels(page: Page) {
  await page.getByRole('button', { name: '2D', exact: true }).click()
  const elapsed = await timedClickToCondition(page.getByRole('button', { name: '3D', exact: true }), 'pixels')
  const canvas = page.getByTestId('container-scene').locator('canvas')
  await expect(canvas).toBeVisible()
  return elapsed
}

async function resizeCanvas(page: Page) {
  await page.setViewportSize({ width: 1280, height: 760 })
  const canvas = page.getByTestId('container-scene').locator('canvas')
  await expect(canvas).toBeVisible()
  const compactWidth = await canvas.evaluate((element) => (element as HTMLCanvasElement).clientWidth)
  await page.evaluate((minimumWidth) => {
    const state = window as typeof window & { __frontendBenchmarkResize?: Promise<number> }
    state.__frontendBenchmarkResize = new Promise<number>((resolve, reject) => {
      let start = 0
      let previous = ''
      let stableSince = 0
      const timeout = window.setTimeout(() => reject(new Error('Canvas dimensions did not stabilize')), 10_000)
      window.addEventListener('resize', () => {
        start = performance.now()
        const poll = () => {
          const source = document.querySelector('[data-testid="container-scene"] canvas') as HTMLCanvasElement | null
          if (!source) {
            requestAnimationFrame(poll)
            return
          }
          const dimensions = `${source.clientWidth}x${source.clientHeight}:${source.width}x${source.height}`
          const now = performance.now()
          if (dimensions !== previous) {
            previous = dimensions
            stableSince = now
          }
          if (
            source.clientWidth > minimumWidth
            && source.width >= source.clientWidth
            && source.height >= source.clientHeight
            && now - stableSince >= 200
          ) {
            window.clearTimeout(timeout)
            resolve(now - start)
            return
          }
          requestAnimationFrame(poll)
        }
        requestAnimationFrame(poll)
      }, { once: true })
    })
  }, compactWidth)
  await page.setViewportSize({ width: 1920, height: 1080 })
  return page.evaluate(() => {
    const state = window as typeof window & { __frontendBenchmarkResize?: Promise<number> }
    if (!state.__frontendBenchmarkResize) throw new Error('Resize benchmark probe was not installed')
    return state.__frontendBenchmarkResize
  })
}

test('records repeatable frontend architecture timings', async ({ browser, page }) => {
  await page.addInitScript(() => {
    try { localStorage.clear() } catch { /* opaque origins have no storage */ }
  })
  const cdp = await page.context().newCDPSession(page)
  const stabilize = async () => {
    await cdp.send('HeapProfiler.collectGarbage')
    await page.evaluate(() => new Promise<void>((resolve) => {
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
    }))
  }
  try {
    const loginClickToInteractiveMs = await measure(() => login(page), stabilize, 3)
    let loadIteration = 0
    const automaticLoadToResultMs = await measure(() => automaticLoad(page, loadIteration++), stabilize, 50)
    const canvasFirstNonEmptyPixelsMs = await measure(() => canvasFirstPixels(page), stabilize, 4)
    const viewportResizeToStableCanvasMs = await measure(() => resizeCanvas(page), stabilize, 4)

    await fs.mkdir(path.dirname(outputPath), { recursive: true })
    await fs.writeFile(outputPath, `${JSON.stringify({
      browserVersion: browser.version(),
      browserTarget: new URL(page.url()).origin,
      browserRuntime: process.env.PLAYWRIGHT_BASE_URL ? 'external' : 'production-preview',
      metrics: {
        loginClickToInteractiveMs,
        automaticLoadToResultMs,
        canvasFirstNonEmptyPixelsMs,
        viewportResizeToStableCanvasMs,
      },
    }, null, 2)}\n`)
  } finally {
    if (!page.isClosed()) await cdp.detach()
  }
})
