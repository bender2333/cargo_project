import type { LoadingStep, PackingResult, PlacedBox } from '../types'

export type PlaybackStep = {
  step: number
  box: PlacedBox
  loadingStep: LoadingStep
}

export type PlaybackSequence = {
  steps: PlaybackStep[]
  total: number
}

/**
 * Build a playback sequence by joining each LoadingStep to its PlacedBox.
 * Steps are returned in ascending step order. Steps without a matching placed
 * box are skipped so the sequence stays renderable.
 */
export function buildPlaybackSequence(result: PackingResult | null | undefined): PlaybackSequence {
  if (!result || !result.workSteps?.length) {
    return { steps: [], total: 0 }
  }
  const byId = new Map<string, PlacedBox>()
  for (const box of result.placed) {
    byId.set(box.id, box)
  }
  const ordered = [...result.workSteps].sort((a, b) => a.step - b.step)
  const steps: PlaybackStep[] = []
  for (const ls of ordered) {
    const box = byId.get(ls.boxId)
    if (!box) continue
    steps.push({ step: ls.step, box, loadingStep: ls })
  }
  return { steps, total: steps.length }
}

/**
 * Return the boxes that are visible at the given playback cursor (1-indexed).
 * `cursor = 0` shows nothing; `cursor = total` shows the full plan.
 */
export function visibleBoxesAt(sequence: PlaybackSequence, cursor: number): PlacedBox[] {
  const clamped = Math.max(0, Math.min(cursor, sequence.total))
  return sequence.steps.slice(0, clamped).map((entry) => entry.box)
}

/**
 * Pick the box that should be highlighted as "about to be loaded" at the
 * given cursor. Returns null when the playback is at the start or end.
 */
export function currentBoxAt(sequence: PlaybackSequence, cursor: number): PlacedBox | null {
  if (cursor <= 0 || cursor > sequence.total) return null
  return sequence.steps[cursor - 1]?.box ?? null
}
