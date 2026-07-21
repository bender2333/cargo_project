import { describe, expect, it, vi } from 'vitest'
import NoSkippedE2EReporter from './no-skipped-e2e-reporter.mjs'

describe('NoSkippedE2EReporter', () => {
  it('fails an otherwise passing run when Playwright skips a test', () => {
    const reporter = new NoSkippedE2EReporter()
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})

    reporter.onTestEnd({ titlePath: () => ['chromium', 'responsive 3D'] }, { status: 'skipped' })

    expect(reporter.onEnd()).toEqual({ status: 'failed' })
    error.mockRestore()
  })
})
