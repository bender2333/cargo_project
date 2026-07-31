/**
 * Business invariants for PackingResult layering, support relations, and loading order.
 *
 * These encode PRD rules directly instead of freezing a snapshot:
 *   - PRD 9.3: a box touching the floor is physical layer 1; a box on top of others
 *     goes to a higher layer; layering must derive from support relations.
 *   - PRD 10 / 11.1.3: loading order must be executable on site, which requires every
 *     supporting box to be loaded before the box it supports.
 *
 * The golden contract (`packing-results.json`) only asserts snapshot equality, so it
 * cannot tell correct layering from consistently-wrong layering. These tests can.
 *
 * Fixtures are the same five cases the golden contract and benchmark use.
 */
import { readFileSync } from 'node:fs'
import { dirname, resolve, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { beforeAll, describe, expect, it } from 'vitest'
import * as XLSX from 'xlsx'
import type { ContainerSpec, CargoItem, LoadingMode, PackingResult, PlacedBox } from '../types'
import { containers } from '../data/containers'
import { parseCargoRows } from './importCargo'
import { finalizePlacementGeometry } from './finalizePackingResult'
import { calculatePacking } from './packing'

const moduleDir = dirname(fileURLToPath(import.meta.url))
const dataDir = resolve(moduleDir, '../../test-data')

type Case = { name: string; container: ContainerSpec; result: PackingResult }

const cases: Case[] = []

function loadRussianItems(): CargoItem[] {
  const buffer = readFileSync(join(dataDir, 'excel/俄罗斯整托装柜尺寸.xlsx'))
  const workbook = XLSX.read(buffer, { type: 'buffer' })
  const rows = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]]) as Record<string, string | number | null>[]
  let next = 1
  const { items, errors } = parseCargoRows(rows, {
    createId: () => `russia-pallet-${String(next++).padStart(2, '0')}`,
  })
  if (errors.length > 0) throw new Error(`Russian fixture import failed: ${JSON.stringify(errors)}`)
  return items
}

const russianContainer: ContainerSpec = {
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

// Computing all five fixtures takes ~10-20s, and the 40HQ cases alone are multi-second.
// The default 10s hook timeout flakes under parallel load.
beforeAll(() => {
  const russianItems = loadRussianItems()
  const vietnamInput = JSON.parse(readFileSync(join(dataDir, 'json/vietnam-11/input.json'), 'utf8'))
  const vietnamItems: CargoItem[] = vietnamInput.items.map((item: CargoItem, index: number) => ({
    ...item,
    id: `vietnam-${String(index + 1).padStart(2, '0')}`,
  }))
  const vietnam40hq = containers.find((container) => container.id === '40hq')
  if (!vietnam40hq) throw new Error('Missing 40HQ container fixture')

  const specs: Array<{ name: string; container: ContainerSpec; items: CargoItem[]; loadingMode: LoadingMode }> = [
    { name: 'russia-volume', container: russianContainer, items: russianItems, loadingMode: 'volume' },
    { name: 'vietnam-20gp-quantity', container: vietnamInput.container, items: vietnamItems, loadingMode: 'quantity' },
    { name: 'vietnam-20gp-volume', container: vietnamInput.container, items: vietnamItems, loadingMode: 'volume' },
    { name: 'vietnam-40hq-quantity', container: vietnam40hq, items: vietnamItems, loadingMode: 'quantity' },
    { name: 'vietnam-40hq-volume', container: vietnam40hq, items: vietnamItems, loadingMode: 'volume' },
  ]

  for (const spec of specs) {
    cases.push({
      container: spec.container,
      name: spec.name,
      result: calculatePacking(spec.container, spec.items, { loadingMode: spec.loadingMode }),
    })
  }
}, 120_000)

/**
 * Boxes whose base sits on another box's top face with real footprint overlap.
 * This is the geometric ground truth `supportedBy` must reproduce.
 */
function verticalSupportersOf(box: PlacedBox, placed: PlacedBox[]): string[] {
  const EPSILON = 1
  return placed
    .filter((candidate) => {
      if (candidate.id === box.id) return false
      // candidate's top face must meet this box's base
      if (Math.abs(candidate.z + candidate.height - box.z) > EPSILON) return false
      const overlapX = Math.min(box.x + box.length, candidate.x + candidate.length) - Math.max(box.x, candidate.x)
      const overlapY = Math.min(box.y + box.width, candidate.y + candidate.width) - Math.max(box.y, candidate.y)
      return overlapX > EPSILON && overlapY > EPSILON
    })
    .map((candidate) => candidate.id)
    .sort()
}

function describeFew<T>(items: T[], render: (item: T) => string, limit = 3): string {
  const shown = items.slice(0, limit).map(render).join('; ')
  return items.length > limit ? `${shown}; ... (+${items.length - limit} more)` : shown
}

describe('PackingResult layering invariants (PRD 9.3)', () => {
  it('assigns physical layer 1 to every box resting on the floor', () => {
    for (const { name, result } of cases) {
      const offenders = result.placed.filter((box) => box.z === 0 && box.physicalLayer !== 1)
      expect(
        offenders.length,
        `${name}: ${offenders.length} floor boxes are not on physical layer 1 — `
        + describeFew(offenders, (b) => `${b.id}(z=0, layer=${b.physicalLayer})`),
      ).toBe(0)
    }
  })

  it('marks a box as floor-supported exactly when its base rests on the floor', () => {
    for (const { name, result } of cases) {
      const offenders = result.placed.filter(
        (box) => (box.supportType === 'floor') !== (box.z <= 0.001),
      )
      expect(
        offenders.length,
        `${name}: supportType does not match floor contact — `
        + describeFew(offenders, (b) => `${b.id}(z=${b.z}, type=${b.supportType}, supporters=${b.supportedBy.length})`),
      ).toBe(0)
    }
  })

  it('derives supportedBy from real base-face contact, not horizontal adjacency', () => {
    for (const { name, result } of cases) {
      const offenders = result.placed.filter((box) => {
        const expected = verticalSupportersOf(box, result.placed)
        return JSON.stringify([...box.supportedBy].sort()) !== JSON.stringify(expected)
      })
      expect(
        offenders.length,
        `${name}: ${offenders.length} boxes have supportedBy that is not their vertical support set — `
        + describeFew(offenders, (b) => {
          const expected = verticalSupportersOf(b, result.placed)
          return `${b.id}(has=[${[...b.supportedBy].sort()}], expected=[${expected}])`
        }),
      ).toBe(0)
    }
  })

  it('places a stacked box exactly one layer above its highest supporter', () => {
    for (const { name, result } of cases) {
      const byId = new Map(result.placed.map((box) => [box.id, box]))
      const offenders = result.placed.filter((box) => {
        if (box.supportedBy.length === 0) return false
        const supporterLayers = box.supportedBy
          .map((id) => byId.get(id)?.physicalLayer)
          .filter((layer): layer is number => layer !== undefined)
        if (supporterLayers.length === 0) return false
        return box.physicalLayer !== Math.max(...supporterLayers) + 1
      })
      expect(
        offenders.length,
        `${name}: ${offenders.length} stacked boxes are not one layer above their highest supporter — `
        + describeFew(offenders, (b) => `${b.id}(layer=${b.physicalLayer})`),
      ).toBe(0)
    }
  })
})

describe('PackingResult loading-order invariants', () => {
  // NOTE ON A FALSE GREEN: before the layer/support split this assertion passed with
  // 0 violations, because `supportedBy` held X-axis push-against relations and
  // `workStep` was itself sorted by x — the two were trivially consistent. Measured
  // against the true vertical support set the same fixtures had 1,129 reversed edges.
  // Once `supportedBy` means vertical support again, those surface here.
  it('loads every supporting box before the box it supports', () => {
    for (const { name, result } of cases) {
      const byId = new Map(result.placed.map((box) => [box.id, box]))
      const reversed: Array<{ box: PlacedBox; supporter: PlacedBox }> = []
      for (const box of result.placed) {
        for (const supporterId of box.supportedBy) {
          const supporter = byId.get(supporterId)
          if (supporter && supporter.workStep >= box.workStep) {
            reversed.push({ box, supporter })
          }
        }
      }
      expect(
        reversed.length,
        `${name}: ${reversed.length} support edges are loaded in reverse — `
        + describeFew(reversed, (e) => `${e.supporter.id}(step=${e.supporter.workStep}) after ${e.box.id}(step=${e.box.workStep})`),
      ).toBe(0)
    }
  })

  it('publishes consecutive work steps in runtime array order', () => {
    for (const { name, result } of cases) {
      expect(
        result.workSteps.map((workStep) => workStep.step),
        `${name}: runtime workSteps are not consecutive in array order`,
      ).toEqual(result.workSteps.map((_, index) => index + 1))

      const arrayIndexByBoxId = new Map(result.workSteps.map((workStep, index) => [workStep.boxId, index]))
      const reversed = result.placed.flatMap((box) => box.supportedBy
        .filter((supporterId) => (arrayIndexByBoxId.get(supporterId) ?? Infinity) >= (arrayIndexByBoxId.get(box.id) ?? -1))
        .map((supporterId) => `${supporterId} after ${box.id}`))
      expect(reversed, `${name}: runtime workSteps publish dependents before supporters`).toEqual([])
    }
  })

  it('matches the shared finalizer for identical automatic coordinates', () => {
    for (const { name, container, result } of cases) {
      const finalized = finalizePlacementGeometry(result.placed, container)
      expect(result.placed, `${name}: automatic placed output differs from shared finalizer`).toEqual(finalized.placed)
      expect(result.layers, `${name}: automatic layers differ from shared finalizer`).toEqual(finalized.layers)
      expect(result.workSteps, `${name}: automatic workSteps differ from shared finalizer`).toEqual(finalized.workSteps)
    }
  })

  it('assigns every completed placement a finite positive depth layer', () => {
    for (const { name, result } of cases) {
      const invalid = result.placed.filter((box) => !Number.isFinite(box.depthLayer) || (box.depthLayer ?? 0) <= 0)
      expect(invalid, `${name}: completed placements must have finite positive depthLayer`).toEqual([])
    }
  })

  it('only steps back to a shallower depth when support order or x position requires it', () => {
    // Loading runs far-wall-outward, but support edges outrank depth, and `depthLayer`
    // is not monotonic in x (a box further out can be in an earlier push-against wave
    // when nothing sits directly behind it). Every step back must have one of those
    // reasons; anything else means the ordering itself regressed.
    for (const { name, result } of cases) {
      const byId = new Map(result.placed.map((box) => [box.id, box]))
      const sequence = [...result.placed].sort((a, b) => a.workStep - b.workStep)
      const unjustified: string[] = []
      for (let i = 1; i < sequence.length; i++) {
        const previous = sequence[i - 1]
        const current = sequence[i]
        if (previous.depthLayer <= current.depthLayer) continue
        const waitedOnOutwardSupporter = current.supportedBy.some((id) => {
          const supporter = byId.get(id)
          return supporter !== undefined && supporter.depthLayer >= current.depthLayer
        })
        const previousWasSupporter = result.placed.some((box) => box.supportedBy.includes(previous.id))
        const xStillAdvances = current.x >= previous.x
        if (!waitedOnOutwardSupporter && !previousWasSupporter && !xStillAdvances) {
          unjustified.push(`${previous.id}(depth=${previous.depthLayer},x=${previous.x}) then ${current.id}(depth=${current.depthLayer},x=${current.x})`)
        }
      }
      expect(
        unjustified.length,
        `${name}: ${unjustified.length} unjustified depth reversals — ${describeFew(unjustified, (s) => s)}`,
      ).toBe(0)
    }
  })

  it('assigns every placed box a unique work step', () => {
    for (const { name, result } of cases) {
      const steps = result.placed.map((box) => box.workStep)
      expect(new Set(steps).size, `${name}: work steps are not unique`).toBe(steps.length)
    }
  })
})

describe('PackingResult depth invariants (loading from the far end outward)', () => {
  it('assigns depth layer 1 to boxes against the far wall', () => {
    for (const { name, result } of cases) {
      const atFarWall = result.placed.filter((box) => box.x <= 1)
      expect(atFarWall.length, `${name}: fixture has no box against the far wall`).toBeGreaterThan(0)
      const offenders = atFarWall.filter((box) => box.depthLayer !== 1)
      expect(
        offenders.length,
        `${name}: ${offenders.length} far-wall boxes are not on depth layer 1 — `
        + describeFew(offenders, (b) => `${b.id}(x=${b.x}, depth=${b.depthLayer})`),
      ).toBe(0)
    }
  })

  it('never places a box at a shallower depth than something it is pushed against', () => {
    for (const { name, result } of cases) {
      const offenders = result.placed.filter((box) => {
        // A box further out than the far wall must be at depth >= 2.
        if (box.x <= 1) return false
        return (box.depthLayer ?? 0) < 2
      })
      expect(
        offenders.length,
        `${name}: ${offenders.length} outward boxes claim depth layer 1 — `
        + describeFew(offenders, (b) => `${b.id}(x=${b.x}, depth=${b.depthLayer})`),
      ).toBe(0)
    }
  })
})

describe('PackingResult geometry is unchanged by the layering fix', () => {
  // Guards the fix from altering placement: these numbers come from the golden
  // contract as it stood before the layer/support split.
  const expectedPlacement: Record<string, { placed: number; total: number }> = {
    'russia-volume': { placed: 31, total: 31 },
    'vietnam-20gp-quantity': { placed: 463, total: 864 },
    'vietnam-20gp-volume': { placed: 462, total: 864 },
    'vietnam-40hq-quantity': { placed: 839, total: 864 },
    'vietnam-40hq-volume': { placed: 823, total: 864 },
  }

  it('keeps placed and planned counts identical to the pre-fix baseline', () => {
    for (const { name, result } of cases) {
      const expected = expectedPlacement[name]
      expect(expected, `${name}: missing expected placement`).toBeDefined()
      expect(result.placedCount, `${name}: placed count changed`).toBe(expected.placed)
      expect(result.totalCargoCount, `${name}: planned count changed`).toBe(expected.total)
    }
  })

  it('keeps every placed box inside the effective container and free of overlap', () => {
    for (const { name, result } of cases) {
      const boundary = result.diagnostics.find((d) => d.id === 'boundary-check')
      const overlap = result.diagnostics.find((d) => d.id === 'overlap-check')
      expect(boundary?.severity, `${name}: boundary check regressed`).not.toBe('error')
      expect(overlap?.severity, `${name}: overlap check regressed`).not.toBe('error')
    }
  })
})
