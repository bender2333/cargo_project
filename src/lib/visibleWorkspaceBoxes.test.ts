import { describe, expect, it } from 'vitest'
import type { PlacedBox } from '../types'
import { buildPlaybackSequence } from './playback'
import { deriveVisibleWorkspaceBoxes } from './visibleWorkspaceBoxes'

const box = (id: string, workStep: number): PlacedBox => ({
  id,
  cargoId: `cargo-${id}`,
  name: id,
  label: id.toUpperCase(),
  index: workStep,
  x: 0,
  y: 0,
  z: 0,
  length: 100,
  width: 100,
  height: 100,
  orientationKey: 'LWH',
  labelRotationDeg: 0,
  weight: 1,
  color: '#f97316',
  canRotate: true,
  stackable: true,
  physicalLayer: 1,
  depthLayer: 1,
  workStep,
  supportType: 'floor',
  supportedBy: [],
})

describe('deriveVisibleWorkspaceBoxes', () => {
  const a = box('a', 1)
  const b = box('b', 2)
  const automaticPlaced = [a, b]
  const manualPlacedBoxes = [a, b]
  const playbackSequence = buildPlaybackSequence({
    placed: automaticPlaced,
    unplaced: [],
    layers: [],
    workSteps: [
      { step: 1, boxId: 'a', cargoId: 'cargo-a', label: 'A', physicalLayer: 1, supportType: 'floor' },
      { step: 2, boxId: 'b', cargoId: 'cargo-b', label: 'B', physicalLayer: 1, supportType: 'floor' },
    ],
    labelStats: [],
    diagnostics: [],
    totalCargoCount: 2,
    placedCount: 2,
    usedVolume: 0,
    containerVolume: 1,
    volumeUtilization: 0,
    usedWeight: 0,
    weightUtilization: 0,
  })

  it('returns full automatic placed when calculated and not in playback', () => {
    const { visibleAutoBoxes, visibleManualBoxes } = deriveVisibleWorkspaceBoxes({
      placementMode: 'auto',
      playbackActive: false,
      playbackSequence,
      playbackCursor: 1,
      hasCalculated: true,
      automaticPlaced,
      manualPlacedBoxes,
    })
    expect(visibleAutoBoxes.map((item) => item.id)).toEqual(['a', 'b'])
    expect(visibleManualBoxes.map((item) => item.id)).toEqual(['a', 'b'])
  })

  it('returns empty automatic boxes before calculation', () => {
    const { visibleAutoBoxes } = deriveVisibleWorkspaceBoxes({
      placementMode: 'auto',
      playbackActive: false,
      playbackSequence,
      playbackCursor: 0,
      hasCalculated: false,
      automaticPlaced,
      manualPlacedBoxes,
    })
    expect(visibleAutoBoxes).toEqual([])
  })

  it('trims automatic boxes to playback cursor only in auto playback', () => {
    const { visibleAutoBoxes, visibleManualBoxes } = deriveVisibleWorkspaceBoxes({
      placementMode: 'auto',
      playbackActive: true,
      playbackSequence,
      playbackCursor: 1,
      hasCalculated: true,
      automaticPlaced,
      manualPlacedBoxes,
    })
    expect(visibleAutoBoxes.map((item) => item.id)).toEqual(['a'])
    expect(visibleManualBoxes.map((item) => item.id)).toEqual(['a', 'b'])
  })

  it('trims manual boxes to playback cursor only in manual playback', () => {
    const { visibleAutoBoxes, visibleManualBoxes } = deriveVisibleWorkspaceBoxes({
      placementMode: 'manual',
      playbackActive: true,
      playbackSequence,
      playbackCursor: 1,
      hasCalculated: true,
      automaticPlaced,
      manualPlacedBoxes,
    })
    expect(visibleManualBoxes.map((item) => item.id)).toEqual(['a'])
    expect(visibleAutoBoxes.map((item) => item.id)).toEqual(['a', 'b'])
  })
})
