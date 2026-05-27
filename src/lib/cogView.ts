export type CogViewMode = 'cog'

export type CogViewState = {
  showOverlay: boolean
  boxOpacity: number | null
}

export function deriveCogOverlayState(input: {
  activeResultTab: string
  placementMode: 'auto' | 'manual'
  overlayEnabled: boolean
}): CogViewState {
  const showOverlay = input.overlayEnabled && input.activeResultTab === 'cog' && input.placementMode === 'auto'
  return {
    showOverlay,
    boxOpacity: showOverlay ? 0.45 : null,
  }
}
