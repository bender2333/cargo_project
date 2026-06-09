import { describe, expect, it } from 'vitest'
import { buildCargoDebugSnapshot, restoreManualDebugScenario } from './debugSnapshot'
import { DEFAULT_PLACEMENT_SETTINGS } from './placementSettings'
import { makeManualBox, validateDraft } from './manualPlacement'
import { containers, effectiveContainer } from '../data/containers'
import type { CargoItem, PlacedBox } from '../types'

const cargoItems: CargoItem[] = [
  {
    id: 'cargo-a',
    name: 'Probe crate',
    label: 'A',
    length: 1000,
    width: 800,
    height: 600,
    weight: 120,
    quantity: 2,
    color: '#f59e0b',
    canRotate: true,
    stackable: true,
  },
]

const manualBox = makeManualBox({
  id: 'manual-cargo-a-1',
  cargoId: 'cargo-a',
  label: 'A',
  color: '#f59e0b',
  length: 1000,
  width: 800,
  height: 600,
  weight: 120,
  x: 0,
  y: 0,
  z: 0,
})

const manualPlacedBox: PlacedBox = {
  id: manualBox.id,
  cargoId: manualBox.cargoId,
  name: manualBox.label,
  label: manualBox.label,
  index: 1,
  x: manualBox.x,
  y: manualBox.y,
  z: manualBox.z,
  length: manualBox.length,
  width: manualBox.width,
  height: manualBox.height,
  orientationKey: 'LWH',
  labelRotationDeg: 0,
  yawQuarterTurn: 0,
  pitchQuarterTurn: 0,
  orientationAxes: { x: 'L+', y: 'W+', z: 'H+' },
  orientationLabel: 'X:L+ Y:W+ Z:T+',
  weight: 120,
  color: '#f59e0b',
  canRotate: true,
  stackable: true,
  physicalLayer: 1,
  workStep: 1,
  supportType: 'floor',
  supportedBy: [],
}

describe('debug snapshot', () => {
  it('captures enough manual placement state to recreate a drag/drop failure scene in tests', () => {
    const selectedContainer = containers[0]
    const draft = { boxes: [manualBox] }
    const issues = validateDraft(draft, effectiveContainer(selectedContainer), DEFAULT_PLACEMENT_SETTINGS.supportPolicy)

    const snapshot = buildCargoDebugSnapshot({
      user: { id: 'u1', username: 'tester', role: 'user' },
      locale: 'zh',
      projectName: 'Debug project',
      shipmentName: 'Manual drag probe',
      placementMode: 'manual',
      workspaceView: '3d',
      sceneViewMode: 'iso',
      planViewMode: 'top',
      activeResultTab: 'layers',
      activeLayerId: 'all',
      activeLabelId: 'all',
      selectedContainer,
      effectiveContainer: effectiveContainer(selectedContainer),
      loadingMode: 'quantity',
      defaultMaxStackLayers: 2,
      cargoItems,
      placementSettings: DEFAULT_PLACEMENT_SETTINGS,
      hasCalculated: true,
      automatic: {
        placedBoxes: [],
        visibleBoxes: [],
        unplaced: [],
        diagnostics: [],
        layersCount: 0,
        placedCount: 0,
        totalCargoCount: 2,
      },
      manual: {
        draft,
        placedBoxes: [manualPlacedBox],
        pool: [{ cargoId: 'cargo-a', label: 'A', color: '#f59e0b', length: 1000, width: 800, height: 600, remaining: 1, canRotate: true, stackable: true }],
        issues,
        invalidBoxIds: [],
        selectedBoxId: manualBox.id,
        notice: {
          id: 'move-manual-cargo-a-1-1',
          operation: 'move',
          boxId: manualBox.id,
          reasonCode: 'floating',
          message: '操作未生效：货物处于悬空状态，底面至少需要 50% 支撑。',
          createdAt: 1,
        },
        capacity: {
          totalVolume: 1,
          usedVolume: 1,
          remainingVolume: 0,
          volumeRatio: 1,
          totalWeight: 1,
          usedWeight: 1,
          remainingWeight: 0,
          weightRatio: 1,
          floorArea: 1,
          usedFloorArea: 1,
          remainingFloorArea: 0,
          floorRatio: 1,
        },
      },
      measurements: [],
      ui: {
        gridSnap: true,
        edgeSnap: true,
        clearanceEnabled: false,
        workspaceMaximized: false,
      },
      historyCount: 0,
      recentErrors: ['[warn] drag rejected'],
      capturedAt: '2026-05-28T00:00:00.000Z',
    })

    expect(snapshot.schemaVersion).toBe(1)
    expect(snapshot.manual.draft.boxes[0]).toMatchObject({
      id: 'manual-cargo-a-1',
      cargoId: 'cargo-a',
      x: 0,
      y: 0,
      z: 0,
    })
    expect(snapshot.manual.notice?.reasonCode).toBe('floating')
    expect(snapshot.cargo.items[0].label).toBe('A')
    expect(snapshot.defaultMaxStackLayers).toBe(2)
    expect(snapshot.recovery.testHelper).toBe('restoreManualDebugScenario')

    const restored = restoreManualDebugScenario(snapshot)
    expect(restored.container.length).toBe(effectiveContainer(selectedContainer).length)
    expect(restored.manualDraft.boxes).toHaveLength(1)
    expect(restored.placementSettings.supportPolicy.minSupportRatio).toBe(0.5)
    expect(restored.defaultMaxStackLayers).toBe(2)
    expect(restored.expectedIssues).toEqual(issues)
  })
})
