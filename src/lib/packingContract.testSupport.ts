import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { expect } from 'vitest'
import type { PackingResult } from '../types'
import { canonicalizePackingResult, type PackingResultContract } from './packingContract'

type GoldenCase = {
  sha256: string
  summary: PackingResultContract
}

type GoldenFile = {
  schemaVersion: number
  cases: Record<string, GoldenCase>
}

const golden = JSON.parse(
  readFileSync(resolve(process.cwd(), 'test-data/baselines/packing-results.json'), 'utf8'),
) as GoldenFile

function hash(summary: PackingResultContract) {
  return createHash('sha256').update(JSON.stringify(summary)).digest('hex')
}

export function expectPackingResultContract(caseName: string, result: PackingResult) {
  const expected = golden.cases[caseName]
  if (!expected) throw new Error(`Missing packing contract case: ${caseName}`)

  expect(golden.schemaVersion).toBe(1)
  expect(hash(expected.summary)).toBe(expected.sha256)

  const actual = canonicalizePackingResult(result)
  expect(actual).toEqual(expected.summary)
  expect(hash(actual)).toBe(expected.sha256)
}
