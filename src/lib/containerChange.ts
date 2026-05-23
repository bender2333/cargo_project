export function clearPlacementOnContainerChange(params: {
  previousKey: string | null
  nextKey: string
  placementMode: 'auto' | 'manual'
  hasCalculated: boolean
  placedCount: number
}) {
  return Boolean(
    params.previousKey &&
    params.previousKey !== params.nextKey &&
    params.placementMode === 'auto' &&
    params.hasCalculated &&
    params.placedCount > 0,
  )
}
