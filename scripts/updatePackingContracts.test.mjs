import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const scriptPath = join(root, 'scripts/update-packing-contracts.mjs')
const goldenPath = join(root, 'test-data/baselines/packing-results.json')
const temporaryDirectories = []

function runUpdater(outputPath, ...args) {
  const result = spawnSync(process.execPath, [scriptPath, '--output', outputPath, ...args], {
    cwd: root,
    encoding: 'utf8',
    timeout: 30_000,
  })
  if (result.error) {
    throw new Error(`update-packing-contracts subprocess failed: ${result.error.code ?? result.error.message}`)
  }
  return result
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) rmSync(directory, { force: true, recursive: true })
})

describe('packing contract updater regression gate', () => {
  it('refuses regressions without writing and requires an explicit decision to allow them', () => {
    const directory = mkdtempSync(join(tmpdir(), 'packing-contracts-'))
    temporaryDirectories.push(directory)
    const outputPath = join(directory, 'packing-results.json')
    const originalBytes = readFileSync(goldenPath, 'utf8')
    const missingCaseName = 'missing-generated-case'
    const missingCaseBaseline = JSON.parse(originalBytes)
    missingCaseBaseline.cases[missingCaseName] = Object.values(missingCaseBaseline.cases)[0]
    const missingCaseBytes = `${JSON.stringify(missingCaseBaseline, null, 2)}\n`
    writeFileSync(outputPath, missingCaseBytes)

    const missingCaseResult = runUpdater(outputPath)
    const missingCaseOutput = `${missingCaseResult.stdout}${missingCaseResult.stderr}`
    expect(missingCaseResult.status, missingCaseOutput).not.toBe(0)
    expect(missingCaseOutput).toContain(`Missing generated packing contract case: ${missingCaseName}`)
    expect(readFileSync(outputPath, 'utf8')).toBe(missingCaseBytes)

    const inflated = JSON.parse(originalBytes)
    const [placedCaseName, boxesCaseName] = Object.keys(inflated.cases)
    const placedCase = inflated.cases[placedCaseName]
    const boxesCase = inflated.cases[boxesCaseName]
    const currentPlaced = placedCase.summary.totals.placedCount
    const currentBoxes = boxesCase.summary.placements.length
    placedCase.summary.totals.placedCount += 1
    boxesCase.summary.placements.push({ ...boxesCase.summary.placements.at(-1), id: 'inflated-box' })
    placedCase.sha256 = createHash('sha256').update(JSON.stringify(placedCase.summary)).digest('hex')
    boxesCase.sha256 = createHash('sha256').update(JSON.stringify(boxesCase.summary)).digest('hex')
    const inflatedBytes = `${JSON.stringify(inflated, null, 2)}\n`
    writeFileSync(outputPath, inflatedBytes)

    const refused = runUpdater(outputPath)
    const refusalOutput = `${refused.stdout}${refused.stderr}`

    expect(refused.status, refusalOutput).not.toBe(0)
    expect(readFileSync(outputPath, 'utf8')).toBe(inflatedBytes)
    expect(refusalOutput).toContain('Refusing to update packing contracts')
    expect(refusalOutput).toContain(`${placedCaseName}: placedCount ${currentPlaced + 1} -> ${currentPlaced}`)
    expect(refusalOutput).toContain(`${boxesCaseName}: boxes ${currentBoxes + 1} -> ${currentBoxes}`)
    for (const name of Object.keys(inflated.cases)) {
      expect(refusalOutput).toMatch(new RegExp(`^${name}\\s+\\|\\s+\\d+\\/\\d+\\s+\\|\\s+\\d+\\/\\d+\\s+\\|\\s+[+-]?\\d+\\s+\\|\\s+(?:yes|no)$`, 'm'))
    }

    const allowed = runUpdater(outputPath, '--allow-regression')
    const allowedOutput = `${allowed.stdout}${allowed.stderr}`

    expect(allowed.status, allowedOutput).toBe(0)
    expect(allowedOutput).toContain('record a decision')
    expect(readFileSync(outputPath, 'utf8')).not.toBe(inflatedBytes)
    expect(readFileSync(outputPath, 'utf8')).toBe(originalBytes)
  }, 120_000)
})
