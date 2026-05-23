export const GRID_SNAP_MM = 50

export function snapToGrid(value: number, step: number = GRID_SNAP_MM, enabled: boolean = true) {
  if (!enabled || step <= 0) return value
  return Math.round(value / step) * step
}
