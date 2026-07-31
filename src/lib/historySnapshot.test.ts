import { describe, expect, it } from 'vitest'
import type { CargoItem, ContainerSpec, PackingResult } from '../types'
import type { ManualDraft } from './manualPlacement'
import type { HistorySnapshotV2 } from './historySnapshot'
import {
  assertHistorySnapshotSize,
  assertValidHistoryPlanData,
  buildHistorySnapshot,
  classifyHistoryRestore,
  HISTORY_SNAPSHOT_MAX_BYTES,
  HISTORY_SNAPSHOT_VERSION,
  isHistorySnapshotV2,
  measureHistorySnapshotBytes,
} from './historySnapshot'

const container: ContainerSpec = {
  id: 'c1',
  label: 'C',
  description: '',
  length: 1000,
  width: 1000,
  height: 1000,
  maxWeight: 1000,
  doorGap: 0,
  topGap: 0,
  sideGap: 0,
}

const cargo: CargoItem = {
  id: 'a',
  name: 'Alpha',
  label: 'A',
  length: 500,
  width: 400,
  height: 300,
  weight: 10,
  quantity: 1,
  color: '#111',
  canRotate: true,
  stackable: true,
}

const packingResult: PackingResult = {
  placed: [{
    id: 'box-1',
    cargoId: 'a',
    name: 'Alpha',
    label: 'A',
    index: 1,
    x: 10,
    y: 20,
    z: 0,
    length: 500,
    width: 400,
    height: 300,
    orientationKey: 'LWH',
    labelRotationDeg: 0,
    weight: 10,
    color: '#111',
    canRotate: true,
    stackable: true,
    physicalLayer: 1,
    depthLayer: 1,
    workStep: 1,
    supportType: 'floor',
    supportedBy: [],
  }],
  unplaced: [],
  layers: [{
    id: 'layer-1',
    physicalLayer: 1,
    minZ: 0,
    maxZ: 300,
    count: 1,
    weight: 10,
    volume: 60_000_000,
    labels: [{ label: 'A', color: '#111', count: 1 }],
    supportedBy: [],
  }],
  workSteps: [{
    step: 1,
    boxId: 'box-1',
    cargoId: 'a',
    label: 'A',
    physicalLayer: 1,
    supportType: 'floor',
  }],
  labelStats: [{ label: 'A', name: 'Alpha', color: '#111', planned: 1, placed: 1, unplaced: 0, layers: [1] }],
  diagnostics: [],
  totalCargoCount: 1,
  placedCount: 1,
  usedVolume: 60_000_000,
  containerVolume: 1_000_000_000,
  volumeUtilization: 6,
  usedWeight: 10,
  weightUtilization: 1,
}

function snapshot(overrides: Record<string, unknown> = {}) {
  return {
    ...buildHistorySnapshot({
      container,
      cargoItems: [cargo],
      packingResult: structuredClone(packingResult),
      placementMode: 'auto',
    }),
    ...overrides,
  }
}

describe('buildHistorySnapshot', () => {
  it('embeds packing result coordinates and schema version 2', () => {
    const snapshot = buildHistorySnapshot({
      container,
      cargoItems: [cargo],
      packingResult,
      placementMode: 'auto',
    })

    expect(snapshot.schemaVersion).toBe(HISTORY_SNAPSHOT_VERSION)
    expect(isHistorySnapshotV2(snapshot)).toBe(true)
    expect(snapshot.packingResult.placed[0]).toMatchObject({ id: 'box-1', x: 10, y: 20, z: 0, orientationKey: 'LWH' })
    expect(snapshot.labelSummary).toContain('A:1/1')
  })

  it('owns nested input data independently of the caller', () => {
    const input = {
      container: structuredClone(container),
      cargoItems: [structuredClone(cargo)],
      packingResult: structuredClone(packingResult),
      placementMode: 'auto' as const,
    }
    const saved = buildHistorySnapshot(input)

    input.container.label = 'Mutated container'
    input.cargoItems[0].label = 'B'
    input.packingResult.placed[0].x = 900
    input.packingResult.diagnostics.push({ id: 'late', severity: 'error', message: 'Late mutation' })

    expect(saved.container.label).toBe('C')
    expect(saved.cargoItems[0].label).toBe('A')
    expect(saved.packingResult.placed[0].x).toBe(10)
    expect(saved.packingResult.diagnostics).toEqual([])
  })

  it('keeps manual draft only for manual mode', () => {
    const draft = { boxes: [{
      id: 'box-1', cargoId: 'a', label: 'A', color: '#111',
      x: 10, y: 20, z: 0, length: 500, width: 400, height: 300,
      orientationKey: 'LWH' as const, labelRotationDeg: 0 as const,
    }] }
    const manual = buildHistorySnapshot({
      container,
      cargoItems: [cargo],
      packingResult,
      placementMode: 'manual',
      manualDraft: draft,
      draftInitialized: true,
    })
    expect(manual.manualDraft).toEqual(draft)
    expect(manual.draftInitialized).toBe(true)

    const auto = buildHistorySnapshot({
      container,
      cargoItems: [cargo],
      packingResult,
      placementMode: 'auto',
      manualDraft: draft,
      draftInitialized: true,
    })
    expect(auto.manualDraft).toBeUndefined()
  })
})

describe('classifyHistoryRestore', () => {
  it('restores versioned snapshots without recompute', () => {
    const snapshot = buildHistorySnapshot({
      container,
      cargoItems: [cargo],
      packingResult,
      placementMode: 'auto',
    })
    expect(classifyHistoryRestore(snapshot)).toEqual({ kind: 'snapshot', data: snapshot })
  })

  it('marks legacy input-only records for explicit recompute', () => {
    const legacy = {
      containerId: container.id,
      container,
      cargoItems: [cargo],
      placedCount: 1,
      totalCargoCount: 1,
      layerCount: 1,
      labelSummary: 'A:1/1',
    }
    expect(classifyHistoryRestore(legacy)).toEqual({ kind: 'legacy-recompute', data: legacy })
  })

  it('rejects unknown versions and damaged snapshots visibly', () => {
    expect(classifyHistoryRestore({ schemaVersion: 99, container, cargoItems: [cargo] }).kind).toBe('invalid')
    expect(classifyHistoryRestore({ schemaVersion: 2, container, cargoItems: [cargo] }).kind).toBe('invalid')
    expect(classifyHistoryRestore(null).kind).toBe('invalid')
  })
})

function matchingManualSnapshot(): HistorySnapshotV2 & { manualDraft: ManualDraft } {
  const value = structuredClone(snapshot())
  const placed = value.packingResult.placed[0]
  Object.assign(placed, {
    yawQuarterTurn: 0,
    pitchQuarterTurn: 0,
    orientationAxes: { x: 'L+', y: 'W+', z: 'H+' },
    orientationLabel: 'L+ / W+ / H+',
  })
  return {
    ...value,
    placementMode: 'manual' as const,
    manualDraft: { boxes: [{
      id: placed.id,
      cargoId: placed.cargoId,
      label: placed.label,
      color: placed.color,
      baseLength: 500,
      baseWidth: 400,
      baseHeight: 300,
      x: placed.x,
      y: placed.y,
      z: placed.z,
      length: placed.length,
      width: placed.width,
      height: placed.height,
      orientationKey: placed.orientationKey,
      labelRotationDeg: placed.labelRotationDeg,
      yawQuarterTurn: 0,
      pitchQuarterTurn: 0,
      orientationAxes: { x: 'L+', y: 'W+', z: 'H+' },
      orientationLabel: 'L+ / W+ / H+',
    }] },
  }
}
describe('history snapshot runtime validation', () => {
  it('rejects malformed v2 required result arrays', () => {
    for (const field of ['placed', 'unplaced', 'layers', 'workSteps', 'labelStats', 'diagnostics']) {
      const damaged = structuredClone(snapshot())
      ;(damaged.packingResult as unknown as Record<string, unknown>)[field] = null
      expect(() => assertValidHistoryPlanData(damaged), field).toThrow(field)
      expect(classifyHistoryRestore(damaged).kind, field).toBe('invalid')
    }
  })

  it('rejects non-finite numbers and illegal enums', () => {
    const nanCoordinate = structuredClone(snapshot())
    nanCoordinate.packingResult.placed[0].x = Number.NaN
    expect(() => assertValidHistoryPlanData(nanCoordinate)).toThrow(/finite number/)

    const overflowWeight = JSON.parse(JSON.stringify(snapshot()).replace('"weight":10', '"weight":1e309'))
    expect(() => assertValidHistoryPlanData(overflowWeight)).toThrow(/finite number/)

    const badOrientation = structuredClone(snapshot())
    badOrientation.packingResult.placed[0].orientationKey = 'SIDEWAYS' as never
    expect(() => assertValidHistoryPlanData(badOrientation)).toThrow(/orientationKey/)

    expect(() => assertValidHistoryPlanData(snapshot({ placementMode: 'guided' }))).toThrow(/placementMode/)
  })

  it('rejects dangling cargo, box, and supporter references', () => {
    const danglingCargo = structuredClone(snapshot())
    danglingCargo.packingResult.placed[0].cargoId = 'missing-cargo'
    expect(() => assertValidHistoryPlanData(danglingCargo)).toThrow(/cargoId/)

    const danglingStep = structuredClone(snapshot())
    danglingStep.packingResult.workSteps[0].boxId = 'missing-box'
    expect(() => assertValidHistoryPlanData(danglingStep)).toThrow(/boxId/)

    const danglingSupporter = structuredClone(snapshot())
    danglingSupporter.packingResult.placed[0].supportType = 'fully-supported'
    danglingSupporter.packingResult.placed[0].supportedBy = ['missing-box']
    expect(() => assertValidHistoryPlanData(danglingSupporter)).toThrow(/supportedBy/)
  })

  it('rejects non-consecutive or inconsistent work steps', () => {
    const skippedStep = structuredClone(snapshot())
    skippedStep.packingResult.workSteps[0].step = 2
    expect(() => assertValidHistoryPlanData(skippedStep)).toThrow(/consecutive/)

    const mismatchedBoxStep = structuredClone(snapshot())
    mismatchedBoxStep.packingResult.placed[0].workStep = 2
    expect(() => assertValidHistoryPlanData(mismatchedBoxStep)).toThrow(/workStep/)
  })

  it('requires and validates manualDraft for manual snapshots', () => {
    expect(() => assertValidHistoryPlanData(snapshot({ placementMode: 'manual' }))).toThrow(/manualDraft/)
    expect(() => buildHistorySnapshot({
      container,
      cargoItems: [cargo],
      packingResult,
      placementMode: 'manual',
    })).toThrow(/manualDraft/)

    const manual = snapshot({
      placementMode: 'manual',
      manualDraft: { boxes: [{
        id: 'manual-1', cargoId: 'missing-cargo', label: 'A', color: '#111',
        x: 0, y: 0, z: 0, length: 500, width: 400, height: 300,
        orientationKey: 'LWH', labelRotationDeg: 0,
      }] },
    })
    expect(() => assertValidHistoryPlanData(manual)).toThrow(/manualDraft\.boxes\[0\]\.cargoId/)
  })

  it('validates diagnostic provenance fields and rejects manual provenance in auto mode', () => {
    const valid = matchingManualSnapshot()
    valid.packingResult.diagnostics = [{
      id: 'manual:overlap:box-1', severity: 'error', message: 'Overlap',
      source: 'manual', sourceIssueId: 'overlap:box-1',
    }]
    expect(() => assertValidHistoryPlanData(valid)).not.toThrow()

    const autoWithManualSource = snapshot()
    autoWithManualSource.packingResult.diagnostics = structuredClone(valid.packingResult.diagnostics)
    expect(() => assertValidHistoryPlanData(autoWithManualSource)).toThrow(/manual.*auto|auto.*manual/)

    const badSource = structuredClone(valid)
    badSource.packingResult.diagnostics[0].source = 'automatic' as never
    expect(() => assertValidHistoryPlanData(badSource)).toThrow(/source/)

    const badIssueId = structuredClone(valid)
    badIssueId.packingResult.diagnostics[0].sourceIssueId = 42 as never
    expect(() => assertValidHistoryPlanData(badIssueId)).toThrow(/sourceIssueId/)
    const missingSource = structuredClone(valid)
    Reflect.deleteProperty(missingSource.packingResult.diagnostics[0], 'source')
    expect(() => assertValidHistoryPlanData(missingSource)).toThrow(/provided together/)

    const missingSourceIssueId = structuredClone(valid)
    Reflect.deleteProperty(missingSourceIssueId.packingResult.diagnostics[0], 'sourceIssueId')
    expect(() => assertValidHistoryPlanData(missingSourceIssueId)).toThrow(/provided together/)

    const duplicate = structuredClone(valid)
    duplicate.packingResult.diagnostics.push({ ...duplicate.packingResult.diagnostics[0] })
    expect(() => assertValidHistoryPlanData(duplicate)).toThrow(/diagnostics\[1\]\.id must be unique/)
  })

  it('validates optional manual pose metadata', () => {
    const mutations: Array<[string, (value: HistorySnapshotV2 & { manualDraft: ManualDraft }) => void]> = [
      ['baseLength', (value) => { value.manualDraft.boxes[0].baseLength = Number.POSITIVE_INFINITY }],
      ['yawQuarterTurn', (value) => { value.manualDraft.boxes[0].yawQuarterTurn = 4 as never }],
      ['orientationAxes', (value) => { value.manualDraft.boxes[0].orientationAxes!.x = 'Q+' as never }],
      ['orientationLabel', (value) => { value.manualDraft.boxes[0].orientationLabel = 12 as never }],
    ]
    for (const [field, mutate] of mutations) {
      const invalid = matchingManualSnapshot()
      mutate(invalid)
      expect(() => assertValidHistoryPlanData(invalid), field).toThrow(field)
    }
  })

  it('rejects manual drafts that do not describe the saved placed result', () => {
    const mutations: Array<[string, (value: HistorySnapshotV2 & { manualDraft: ManualDraft }) => void]> = [
      ['box IDs', (value) => { value.manualDraft.boxes[0].id = 'other-box' }],
      ['box count', (value) => { value.manualDraft.boxes = [] }],
      ['cargoId', (value) => { value.manualDraft.boxes[0].cargoId = 'other-cargo' }],
      ['coordinates', (value) => { value.manualDraft.boxes[0].x += 1 }],
      ['dimensions', (value) => { value.manualDraft.boxes[0].height += 1 }],
      ['orientationKey', (value) => { value.manualDraft.boxes[0].orientationKey = 'WLH' }],
      ['labelRotationDeg', (value) => { value.manualDraft.boxes[0].labelRotationDeg = 90 }],
      ['pose metadata', (value) => { value.manualDraft.boxes[0].pitchQuarterTurn = 1 }],
    ]
    for (const [field, mutate] of mutations) {
      const invalid = matchingManualSnapshot()
      mutate(invalid)
      expect(() => assertValidHistoryPlanData(invalid), field).toThrow(/manualDraft/)
      expect(classifyHistoryRestore(invalid).kind, field).toBe('invalid')
    }
  })

  it('requires manual draft labels and colors to match the saved result', () => {
    const labelMismatch = matchingManualSnapshot()
    labelMismatch.manualDraft.boxes[0].label = 'B'
    expect(() => assertValidHistoryPlanData(labelMismatch)).toThrow(/label/)

    const colorMismatch = matchingManualSnapshot()
    colorMismatch.manualDraft.boxes[0].color = '#222'
    expect(() => assertValidHistoryPlanData(colorMismatch)).toThrow(/color/)
  })

  it('validates the optional default max stack layer contract', () => {
    for (const value of [0, -1, 1.5, Number.POSITIVE_INFINITY, '5']) {
      const invalid = snapshot({ defaultMaxStackLayers: value })
      expect(() => assertValidHistoryPlanData(invalid), String(value)).toThrow(/defaultMaxStackLayers/)
    }

    expect(() => assertValidHistoryPlanData(snapshot({ defaultMaxStackLayers: 1 }))).not.toThrow()
  })

  it('rejects placed boxes outside the effective container bounds', () => {
    const outsideLength = structuredClone(snapshot())
    outsideLength.packingResult.placed[0].x = 501
    expect(() => assertValidHistoryPlanData(outsideLength)).toThrow(/effective container/)

    const outsideHeight = structuredClone(snapshot())
    outsideHeight.packingResult.placed[0].z = 701
    expect(() => assertValidHistoryPlanData(outsideHeight)).toThrow(/effective container/)
  })

  it('requires layer coverage and work-step metadata to match placed boxes', () => {
    const missingLayers = structuredClone(snapshot())
    missingLayers.packingResult.layers = []
    missingLayers.layerCount = 0
    expect(() => assertValidHistoryPlanData(missingLayers)).toThrow(/layer/)

    const badStepLayer = structuredClone(snapshot())
    badStepLayer.packingResult.workSteps[0].physicalLayer = 2
    expect(() => assertValidHistoryPlanData(badStepLayer)).toThrow(/physicalLayer/)

    const badStepSupport = structuredClone(snapshot())
    badStepSupport.packingResult.workSteps[0].supportType = 'fully-supported'
    expect(() => assertValidHistoryPlanData(badStepSupport)).toThrow(/supportType/)
  })

  it('requires work-step cargo identity to match the placed box', () => {
    const invalid = structuredClone(snapshot())
    invalid.packingResult.workSteps[0].cargoId = 'other-cargo'
    expect(() => assertValidHistoryPlanData(invalid)).toThrow(/cargoId/)
  })
  it('requires v2 totals to match planned cargo quantities', () => {
    const mismatch = structuredClone(snapshot())
    mismatch.packingResult.totalCargoCount = 0
    mismatch.totalCargoCount = 0
    expect(() => assertValidHistoryPlanData(mismatch)).toThrow(/planned cargo|cargo quantities/)
  })

  it('accepts valid v2 and legacy records', () => {
    expect(() => assertValidHistoryPlanData(snapshot())).not.toThrow()
    const legacy = {
      containerId: container.id,
      container,
      cargoItems: [cargo],
      placedCount: 1,
      totalCargoCount: 1,
      layerCount: 1,
      labelSummary: 'A:1/1',
    }
    expect(() => assertValidHistoryPlanData(legacy)).not.toThrow()
    expect(classifyHistoryRestore(legacy).kind).toBe('legacy-recompute')
  })
})

describe('assertHistorySnapshotSize', () => {
  it('rejects oversized payloads', () => {
    const snapshot = buildHistorySnapshot({
      container,
      cargoItems: [cargo],
      packingResult,
      placementMode: 'auto',
    })
    // Inflate via huge name so size check fails without changing schema.
    snapshot.cargoItems = Array.from({ length: 2000 }, (_, i) => ({
      ...cargo,
      id: `c-${i}`,
      name: 'x'.repeat(2000),
    }))
    expect(measureHistorySnapshotBytes(snapshot)).toBeGreaterThan(HISTORY_SNAPSHOT_MAX_BYTES)
    expect(() => assertHistorySnapshotSize(snapshot)).toThrow(/exceeds/)
  })
})

describe('legacy history shape validation', () => {
  it('rejects schema-less records carrying v2-only fields', () => {
    const legacyWithResult = {
      containerId: container.id,
      container,
      cargoItems: [cargo],
      placedCount: 1,
      totalCargoCount: 1,
      layerCount: 1,
      labelSummary: 'A:1/1',
      packingResult,
    }
    expect(() => assertValidHistoryPlanData(legacyWithResult)).toThrow(/legacy.*packingResult/i)
    expect(classifyHistoryRestore(legacyWithResult).kind).toBe('invalid')

    const legacyWithMode = { ...legacyWithResult, placementMode: 'manual' }
    delete (legacyWithMode as Record<string, unknown>).packingResult
    expect(() => assertValidHistoryPlanData(legacyWithMode)).toThrow(/legacy.*placementMode/i)
  })

  it('rejects legacy count totals inconsistent with cargo quantities', () => {
    const legacy = {
      containerId: container.id, container, cargoItems: [cargo], placedCount: 1,
      totalCargoCount: 2, layerCount: 1, labelSummary: 'A:1/1',
    }
    expect(() => assertValidHistoryPlanData(legacy)).toThrow(/totalCargoCount/)
  })
})
