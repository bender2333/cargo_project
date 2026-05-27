import { describe, expect, it } from 'vitest'
import { deriveCogOverlayState } from './cogView'

describe('deriveCogOverlayState', () => {
  it('shows the 3D overlay only while the CoG tab is active in auto mode', () => {
    expect(deriveCogOverlayState({
      activeResultTab: 'cog',
      placementMode: 'auto',
      overlayEnabled: true,
    })).toMatchObject({
      showOverlay: true,
      boxOpacity: 0.45,
    })
  })

  it('stops the overlay outside the CoG tab or in manual mode', () => {
    expect(deriveCogOverlayState({ activeResultTab: 'layers', placementMode: 'auto', overlayEnabled: true }).showOverlay).toBe(false)
    expect(deriveCogOverlayState({ activeResultTab: 'cog', placementMode: 'manual', overlayEnabled: true }).showOverlay).toBe(false)
    expect(deriveCogOverlayState({ activeResultTab: 'cog', placementMode: 'auto', overlayEnabled: false }).showOverlay).toBe(false)
  })
})
