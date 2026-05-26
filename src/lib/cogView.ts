export type CogViewMode = 'packing' | 'cog' | 'mixed'

export type CogViewState = {
  mode: CogViewMode
  showOverlay: boolean
  showGravityField: boolean
  boxOpacity: number | null
  fieldOpacity: number
}

export function deriveCogViewState(input: {
  mode: CogViewMode
  overlayEnabled: boolean
  gravityFieldEnabled: boolean
  mixedBoxOpacity?: number
  fieldOpacity?: number
}): CogViewState {
  const fieldOpacity = Math.min(1, Math.max(0.1, input.fieldOpacity ?? 0.55))
  if (!input.overlayEnabled || input.mode === 'packing') {
    return {
      mode: input.mode,
      showOverlay: false,
      showGravityField: false,
      boxOpacity: null,
      fieldOpacity,
    }
  }
  if (input.mode === 'cog') {
    return {
      mode: input.mode,
      showOverlay: true,
      showGravityField: input.gravityFieldEnabled,
      boxOpacity: 0.24,
      fieldOpacity,
    }
  }
  return {
    mode: input.mode,
    showOverlay: true,
    showGravityField: input.gravityFieldEnabled,
    boxOpacity: Math.min(1, Math.max(0.15, input.mixedBoxOpacity ?? 0.62)),
    fieldOpacity,
  }
}
