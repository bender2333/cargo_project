import { describe, expect, it } from 'vitest'
import { manualMoveCommitArgs } from './manualMoveCommit'
import { setBoxPosition, validateDraft, type ManualDraft } from './manualPlacement'
import { DEFAULT_PLACEMENT_SETTINGS } from './placementSettings'
import type { ContainerSpec } from '../types'

const snapshotContainer: ContainerSpec = {
  id: '20gp-effective',
  label: "Container 20' effective",
  description: '',
  length: 5758,
  width: 2352,
  height: 2385,
  maxWeight: 28200,
  doorGap: 0,
  topGap: 0,
  sideGap: 0,
}

const snapshotDraft: ManualDraft = {
  boxes: [
    {
      id: 'manual-c',
      cargoId: 'cargo-c',
      label: 'C',
      color: '#f97316',
      x: 1200,
      y: 1200,
      z: 0,
      length: 400,
      width: 500,
      height: 600,
      orientationKey: 'LWH',
      labelRotationDeg: 0,
      stackable: true,
    },
    {
      id: 'manual-d-floor',
      cargoId: 'cargo-d',
      label: 'D',
      color: '#ef4444',
      x: 1800,
      y: 1200,
      z: 0,
      length: 400,
      width: 500,
      height: 600,
      orientationKey: 'LWH',
      labelRotationDeg: 0,
      stackable: true,
    },
    {
      id: 'manual-d-stacked',
      cargoId: 'cargo-d',
      label: 'D',
      color: '#ef4444',
      x: 1872.4349428332753,
      y: 1102.2984813119972,
      z: 600,
      length: 400,
      width: 500,
      height: 600,
      orientationKey: 'LWH',
      labelRotationDeg: 0,
      stackable: true,
    },
    {
      id: 'manual-b',
      cargoId: 'cargo-b',
      label: 'B',
      color: '#2563eb',
      x: 2200,
      y: 1100,
      z: 0,
      length: 400,
      width: 500,
      height: 600,
      orientationKey: 'LWH',
      labelRotationDeg: 0,
      stackable: true,
    },
  ],
}

describe('manualMoveCommitArgs', () => {
  it('commits z in plane mode so a stacked box can be moved back to the floor', () => {
    expect(manualMoveCommitArgs({
      mode: 'plane',
      boxId: 'manual-d',
      currentX: 1872.43,
      currentY: 1102.3,
      finalX: 2300,
      finalY: 1200,
      finalZ: 0,
    })).toEqual(['manual-d', 2300, 1200, 0])
  })

  it('keeps x/y locked in z mode while committing the new z', () => {
    expect(manualMoveCommitArgs({
      mode: 'z',
      boxId: 'manual-d',
      currentX: 1872.43,
      currentY: 1102.3,
      finalX: 2300,
      finalY: 1200,
      finalZ: 650,
    })).toEqual(['manual-d', 1872.43, 1102.3, 650])
  })

  it('reproduces the downloaded D snapshot root cause and clears floating when floor z is committed', () => {
    expect(validateDraft(snapshotDraft, snapshotContainer, DEFAULT_PLACEMENT_SETTINGS.supportPolicy)).toEqual([])

    const staleZDraft = setBoxPosition(snapshotDraft, 'manual-d-stacked', 2600, 1200)
    expect(validateDraft(staleZDraft, snapshotContainer, DEFAULT_PLACEMENT_SETTINGS.supportPolicy)).toEqual(
      expect.arrayContaining([expect.objectContaining({ boxId: 'manual-d-stacked', type: 'floating' })]),
    )

    const [boxId, x, y, z] = manualMoveCommitArgs({
      mode: 'plane',
      boxId: 'manual-d-stacked',
      currentX: 1872.4349428332753,
      currentY: 1102.2984813119972,
      finalX: 2600,
      finalY: 1200,
      finalZ: 0,
    })
    const floorDraft = setBoxPosition(snapshotDraft, boxId, x, y, z)
    expect(validateDraft(floorDraft, snapshotContainer, DEFAULT_PLACEMENT_SETTINGS.supportPolicy)).toEqual([])
  })
})
