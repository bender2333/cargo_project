export type VehicleProfileId = 'semi-trailer' | 'flatbed' | 'box-truck' | 'container-only'

export type VehicleProfile = {
  id: VehicleProfileId
  /** Half-width of the safe CoG band along container.length (as a fraction of container.length). */
  safeRatioX: number
  /** Half-width of the safe CoG band across container.width (as a fraction of container.width). */
  safeRatioY: number
  /** Lower / upper boundary of the safe CoG band along container.height (fractions). */
  safeZMin: number
  safeZMax: number
  /** Whether to draw a tractor + trailer silhouette beneath the container. */
  drawSilhouette: boolean
}

/**
 * Built-in vehicle profiles used by the Balance / CoG overlay.
 * The thresholds are conservative defaults rooted in road-freight rules of thumb:
 *  - semi-trailer: strict X / Y, low Z preferred (most common HGV).
 *  - flatbed: looser X, similar Y, lower Z preferred (no walls → tipping risk).
 *  - box-truck (rigid): more forgiving, the rigid wheelbase tolerates a higher / wider CoG.
 *  - container-only: no truck drawn, neutral defaults.
 */
export const VEHICLE_PROFILES: Record<VehicleProfileId, VehicleProfile> = {
  'semi-trailer': { id: 'semi-trailer', safeRatioX: 0.10, safeRatioY: 0.05, safeZMin: 0.10, safeZMax: 0.70, drawSilhouette: true },
  'flatbed': { id: 'flatbed', safeRatioX: 0.15, safeRatioY: 0.05, safeZMin: 0.05, safeZMax: 0.55, drawSilhouette: true },
  'box-truck': { id: 'box-truck', safeRatioX: 0.15, safeRatioY: 0.10, safeZMin: 0.10, safeZMax: 0.75, drawSilhouette: true },
  'container-only': { id: 'container-only', safeRatioX: 0.10, safeRatioY: 0.05, safeZMin: 0.10, safeZMax: 0.70, drawSilhouette: false },
}

export const DEFAULT_VEHICLE_PROFILE: VehicleProfileId = 'semi-trailer'
