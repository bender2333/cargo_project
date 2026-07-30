import { describe, expect, it } from 'vitest'
import type { CargoItem, ContainerSpec, PackingResult } from '../types'
import {
  assertHistorySnapshotSize,
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

  it('keeps manual draft only for manual mode', () => {
    const draft = { boxes: [{ id: 'm1', cargoId: 'a', label: 'A', x: 1, y: 2, z: 3, length: 1, width: 1, height: 1, orientationKey: 'LWH' as const, labelRotationDeg: 0 as const }] }
    const snapshot = buildHistorySnapshot({
      container,
      cargoItems: [cargo],
      packingResult,
      placementMode: 'manual',
      manualDraft: draft as never,
      draftInitialized: true,
    })
    expect(snapshot.manualDraft).toEqual(draft)
    expect(snapshot.draftInitialized).toBe(true)

    const auto = buildHistorySnapshot({
      container,
      cargoItems: [cargo],
      packingResult,
      placementMode: 'auto',
      manualDraft: draft as never,
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
