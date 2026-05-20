import { afterEach, describe, expect, it, vi } from 'vitest'
import { createClientId } from './clientId'

describe('createClientId', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('uses crypto.randomUUID when it is available', () => {
    vi.stubGlobal('crypto', { randomUUID: vi.fn(() => 'uuid-1') })

    expect(createClientId()).toBe('uuid-1')
  })

  it('falls back when crypto.randomUUID is unavailable', () => {
    vi.stubGlobal('crypto', {})
    vi.spyOn(Date, 'now').mockReturnValue(123456)
    vi.spyOn(Math, 'random').mockReturnValue(0.5)

    expect(createClientId()).toBe('cargo-2n9c-i')
  })
})
