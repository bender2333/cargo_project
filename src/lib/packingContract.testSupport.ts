import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { expect } from 'vitest'
import type { CargoItem, PackingResult } from '../types'
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

/** Counts placed and unplaced quantities by cargo ID, so duplicate labels remain distinct. */
export function expectQuantityConservation(cargoItems: CargoItem[], result: PackingResult) {
  const cargoById = new Map(cargoItems.map((item) => [item.id, item]))
  const placedByCargoId = new Map<string, number>()
  const unplacedByCargoId = new Map<string, number>()

  for (const box of result.placed) {
    expect(cargoById.has(box.cargoId), `Placed box ${box.id} references unknown cargo ${box.cargoId}`).toBe(true)
    placedByCargoId.set(box.cargoId, (placedByCargoId.get(box.cargoId) ?? 0) + 1)
  }

  for (const entry of result.unplaced) {
    const item = cargoById.get(entry.cargoId)
    expect(item, `Unplaced row references unknown cargo ${entry.cargoId}`).toBeDefined()
    unplacedByCargoId.set(entry.cargoId, (unplacedByCargoId.get(entry.cargoId) ?? 0) + entry.quantity)
  }

  for (const item of cargoItems) {
    const placedCount = placedByCargoId.get(item.id) ?? 0
    const unplacedCount = unplacedByCargoId.get(item.id) ?? 0
    expect(
      placedCount + unplacedCount,
      `${item.id}${item.label ? ` (${item.label})` : ''}: placed + unplaced quantity must equal planned quantity`,
    ).toBe(item.quantity)
  }
}