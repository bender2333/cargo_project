import { readdirSync, readFileSync } from 'node:fs'
import { dirname, resolve, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import * as XLSX from 'xlsx'
import type { ContainerSpec } from '../types'
import { parseCargoRows } from './importCargo'
import { calculatePacking } from './packing'

const moduleDir = dirname(fileURLToPath(import.meta.url))

describe('calculatePacking — 31 Russian pallets in a custom 13400×2450×2650 container', () => {
  it('fits all 31 pallets without violating boundary, overlap, weight, or container limits', () => {
    const fixtureDir = resolve(moduleDir, '../../test-data/excel')
    const fixtures = readdirSync(fixtureDir).filter((name: string) => name.endsWith('.xlsx'))
    expect(fixtures.length).toBeGreaterThan(0)

    const buffer = readFileSync(join(fixtureDir, fixtures[0]))
    const workbook = XLSX.read(buffer, { type: 'buffer' })
    const sheet = workbook.Sheets[workbook.SheetNames[0]]
    const rows = XLSX.utils.sheet_to_json(sheet) as Record<string, string | number | null>[]
    expect(rows.length).toBe(31)

    let nextId = 0
    const { items, errors } = parseCargoRows(rows, { createId: () => `pallet-${nextId++}` })
    expect(errors).toEqual([])
    expect(items.length).toBe(31)

    const container: ContainerSpec = {
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

    const result = calculatePacking(container, items, { loadingMode: 'volume' })

    expect(result.totalCargoCount).toBe(31)
    expect(result.placedCount).toBe(result.totalCargoCount)
    expect(result.unplaced).toEqual([])

    const boundaryCheck = result.diagnostics.find((entry) => entry.id === 'boundary-check')
    const overlapCheck = result.diagnostics.find((entry) => entry.id === 'overlap-check')
    const weightCheck = result.diagnostics.find((entry) => entry.id === 'weight-check')

    expect(boundaryCheck?.severity).not.toBe('error')
    expect(overlapCheck?.severity).not.toBe('error')
    expect(weightCheck?.severity).not.toBe('error')

    for (const box of result.placed) {
      expect(box.x).toBeGreaterThanOrEqual(0)
      expect(box.y).toBeGreaterThanOrEqual(0)
      expect(box.z).toBeGreaterThanOrEqual(0)
      expect(box.x + box.length).toBeLessThanOrEqual(container.length)
      expect(box.y + box.width).toBeLessThanOrEqual(container.width)
      expect(box.z + box.height).toBeLessThanOrEqual(container.height)
    }
  })
})
