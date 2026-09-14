import type { PlacedBox } from '../types'
import { type PlaybackSequence, visibleBoxesAt } from './playback'

export type VisibleWorkspaceBoxesInput = {
  placementMode: 'auto' | 'manual'
  playbackActive: boolean
  playbackSequence: PlaybackSequence
  playbackCursor: number
  hasCalculated: boolean
  automaticPlaced: readonly PlacedBox[]
  manualPlacedBoxes: readonly PlacedBox[]
}

export type VisibleWorkspaceBoxes = {
  visibleAutoBoxes: PlacedBox[]
  visibleManualBoxes: PlacedBox[]
}

/** Single derivation for 2D/3D workspace box lists (incl. playback trim). */
export function deriveVisibleWorkspaceBoxes(input: VisibleWorkspaceBoxesInput): VisibleWorkspaceBoxes {
  const {
    placementMode,
    playbackActive,
    playbackSequence,
    playbackCursor,
    hasCalculated,
    automaticPlaced,
    manualPlacedBoxes,
  } = input

  const visibleAutoBoxes = placementMode === 'auto' && playbackActive
    ? visibleBoxesAt(playbackSequence, playbackCursor)
    : hasCalculated
      ? [...automaticPlaced]
      : []

  const visibleManualBoxes = placementMode === 'manual' && playbackActive
    ? visibleBoxesAt(playbackSequence, playbackCursor)
    : [...manualPlacedBoxes]

  return { visibleAutoBoxes, visibleManualBoxes }
}
