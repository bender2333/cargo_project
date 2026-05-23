import { act, renderHook } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { usePlaybackController } from './usePlaybackController'
import type { PlaybackSequence } from '../lib/playback'

function makeSequence(total: number): PlaybackSequence {
  return {
    total,
    steps: Array.from({ length: total }, (_, i) => ({
      step: i + 1,
      // box / loadingStep shapes are not consumed by the hook;
      // we only assert on cursor / playing / speed behaviour here.
      box: { id: `b${i}` } as unknown as PlaybackSequence['steps'][number]['box'],
      loadingStep: { step: i + 1 } as unknown as PlaybackSequence['steps'][number]['loadingStep'],
    })),
  }
}

describe('usePlaybackController', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('initializes cursor to 0 and not playing', () => {
    const { result } = renderHook(({ seq }) => usePlaybackController(seq), { initialProps: { seq: makeSequence(3) } })
    expect(result.current.cursor).toBe(0)
    expect(result.current.playing).toBe(false)
    expect(result.current.speed).toBe('normal')
  })

  it('clamps setCursor to [0, total]', () => {
    const { result } = renderHook(({ seq }) => usePlaybackController(seq), { initialProps: { seq: makeSequence(3) } })
    act(() => result.current.setCursor(5))
    expect(result.current.cursor).toBe(3)
    act(() => result.current.setCursor(-2))
    expect(result.current.cursor).toBe(0)
  })

  it('setCursor pauses playback', () => {
    const { result } = renderHook(({ seq }) => usePlaybackController(seq), { initialProps: { seq: makeSequence(3) } })
    act(() => result.current.togglePlay())
    expect(result.current.playing).toBe(true)
    act(() => result.current.setCursor(1))
    expect(result.current.playing).toBe(false)
  })

  it('finish jumps to the end and pauses', () => {
    const { result } = renderHook(({ seq }) => usePlaybackController(seq), { initialProps: { seq: makeSequence(3) } })
    act(() => result.current.finish())
    expect(result.current.cursor).toBe(3)
    expect(result.current.playing).toBe(false)
  })

  it('reset returns to start and pauses', () => {
    const { result } = renderHook(({ seq }) => usePlaybackController(seq), { initialProps: { seq: makeSequence(3) } })
    act(() => result.current.setCursor(2))
    act(() => result.current.reset())
    expect(result.current.cursor).toBe(0)
    expect(result.current.playing).toBe(false)
  })

  it('auto-advances while playing and stops at the end', () => {
    const { result } = renderHook(({ seq }) => usePlaybackController(seq), { initialProps: { seq: makeSequence(2) } })
    act(() => result.current.togglePlay())
    expect(result.current.playing).toBe(true)
    // normal speed → 600ms per step
    act(() => { vi.advanceTimersByTime(600) })
    expect(result.current.cursor).toBe(1)
    act(() => { vi.advanceTimersByTime(600) })
    expect(result.current.cursor).toBe(2)
    act(() => { vi.advanceTimersByTime(600) })
    expect(result.current.playing).toBe(false)
  })

  it('resets cursor/playing when the sequence length changes', () => {
    const { result, rerender } = renderHook(({ seq }) => usePlaybackController(seq), { initialProps: { seq: makeSequence(3) } })
    act(() => result.current.setCursor(2))
    expect(result.current.cursor).toBe(2)
    rerender({ seq: makeSequence(5) })
    expect(result.current.cursor).toBe(0)
    expect(result.current.playing).toBe(false)
  })
})
