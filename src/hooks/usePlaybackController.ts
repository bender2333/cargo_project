import { useCallback, useEffect, useState } from 'react'
import type { PlaybackSequence } from '../lib/playback'

export type PlaybackSpeed = 'slow' | 'normal' | 'fast'

export type PlaybackController = {
  cursor: number
  playing: boolean
  speed: PlaybackSpeed
  setCursor: (next: number) => void
  setSpeed: (next: PlaybackSpeed) => void
  togglePlay: () => void
  reset: () => void
  finish: () => void
}

const SPEED_INTERVAL_MS: Record<PlaybackSpeed, number> = {
  slow: 1200,
  normal: 600,
  fast: 250,
}

/**
 * Owns the playback cursor / play state / speed / auto-advance timer for a
 * given playback sequence. Resets to zero whenever the sequence length
 * changes (so a new packing result restarts at step 0).
 */
export function usePlaybackController(sequence: PlaybackSequence): PlaybackController {
  const [cursor, setCursorState] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [speed, setSpeed] = useState<PlaybackSpeed>('normal')

  useEffect(() => {
    setCursorState(0)
    setPlaying(false)
  }, [sequence.total])

  useEffect(() => {
    if (!playing) return
    if (cursor >= sequence.total) {
      setPlaying(false)
      return
    }
    const interval = SPEED_INTERVAL_MS[speed]
    const handle = window.setTimeout(() => {
      setCursorState((c) => Math.min(c + 1, sequence.total))
    }, interval)
    return () => window.clearTimeout(handle)
  }, [playing, cursor, sequence.total, speed])

  const setCursor = useCallback((next: number) => {
    setCursorState(Math.max(0, Math.min(next, sequence.total)))
    setPlaying(false)
  }, [sequence.total])

  const togglePlay = useCallback(() => {
    setPlaying((p) => !p)
  }, [])

  const reset = useCallback(() => {
    setCursorState(0)
    setPlaying(false)
  }, [])

  const finish = useCallback(() => {
    setCursorState(sequence.total)
    setPlaying(false)
  }, [sequence.total])

  return { cursor, playing, speed, setCursor, setSpeed, togglePlay, reset, finish }
}
