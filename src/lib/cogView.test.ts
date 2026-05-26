import { describe, expect, it } from 'vitest'
import { deriveCogViewState } from './cogView'

describe('deriveCogViewState', () => {
  it('keeps packing view clean even when toggles are on', () => {
    expect(deriveCogViewState({
      mode: 'packing',
      overlayEnabled: true,
      gravityFieldEnabled: true,
    })).toMatchObject({
      showOverlay: false,
      showGravityField: false,
      boxOpacity: null,
    })
  })

  it('emphasizes gravity field in cog view by reducing box opacity', () => {
    expect(deriveCogViewState({
      mode: 'cog',
      overlayEnabled: true,
      gravityFieldEnabled: true,
    })).toMatchObject({
      showOverlay: true,
      showGravityField: true,
      boxOpacity: 0.24,
    })
  })

  it('allows mixed view opacity to be controlled within safe bounds', () => {
    expect(deriveCogViewState({
      mode: 'mixed',
      overlayEnabled: true,
      gravityFieldEnabled: true,
      mixedBoxOpacity: 0.8,
      fieldOpacity: 2,
    })).toMatchObject({
      showOverlay: true,
      showGravityField: true,
      boxOpacity: 0.8,
      fieldOpacity: 1,
    })
  })
})
