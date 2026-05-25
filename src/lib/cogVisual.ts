import type { ContainerSpec } from '../types'
import type { CogResult, CogVector } from './centerOfGravity'
import type { VehicleProfile, VehicleProfileId } from '../data/vehicleProfiles'
import { VEHICLE_PROFILES, DEFAULT_VEHICLE_PROFILE } from '../data/vehicleProfiles'

export type SafeCogBox = {
  /** Lower-corner of the safe range in container-local mm. */
  min: CogVector
  /** Upper-corner of the safe range in container-local mm. */
  max: CogVector
  /** Centre point used as the visual anchor. */
  center: CogVector
}

/**
 * Build the "safe" centre-of-gravity range for the chosen vehicle profile.
 * Profile ratios drive the band size; e.g. flatbed widens X but lowers Z.
 */
export function computeSafeCogBox(
  container: Pick<ContainerSpec, 'length' | 'width' | 'height'>,
  profile?: VehicleProfile,
): SafeCogBox {
  const cfg = profile ?? VEHICLE_PROFILES[DEFAULT_VEHICLE_PROFILE]
  const cx = container.length / 2
  const cy = container.width / 2
  const cz = (container.height * (cfg.safeZMin + cfg.safeZMax)) / 2
  const halfX = container.length * cfg.safeRatioX
  const halfY = container.width * cfg.safeRatioY
  return {
    min: { x: cx - halfX, y: cy - halfY, z: container.height * cfg.safeZMin },
    max: { x: cx + halfX, y: cy + halfY, z: container.height * cfg.safeZMax },
    center: { x: cx, y: cy, z: cz },
  }
}

export type TruckSilhouette = {
  /** Container-local mm; group anchored so x=0 is at container front, z=0 is the container floor */
  cabFront: number // x coordinate where the cab nose points (negative — in front of container)
  cabBack: number  // x coordinate where the cab meets the trailer hitch (negative)
  cabWidth: number
  cabHeight: number
  trailerStart: number
  trailerEnd: number
  trailerWidth: number
  frontAxleX: number  // landing-gear / king-pin area
  rearAxleX: number   // rear axle group center
  wheelRadius: number
}

/**
 * Sketch dimensions for a tractor + trailer silhouette underneath the container.
 * The container sits on the trailer bed from x=0 to x=container.length. The cab
 * extends ~2.5 m in front (negative x) and the rear axles sit roughly under the
 * back 25% of the trailer — these are common HGV proportions, not a CAD model.
 */
export function buildTruckSilhouette(container: Pick<ContainerSpec, 'length' | 'width' | 'height'>): TruckSilhouette {
  return {
    cabFront: -2500,
    cabBack: -200,
    cabWidth: Math.min(2500, container.width),
    cabHeight: 2200,
    trailerStart: 0,
    trailerEnd: container.length,
    trailerWidth: container.width,
    frontAxleX: 600,
    rearAxleX: container.length - 1500,
    wheelRadius: 450,
  }
}

export type CogOverlay = {
  cog: CogVector
  center: CogVector
  offset: CogVector
  safe: SafeCogBox
  truck: TruckSilhouette | null
  warning: boolean
  balanced: boolean
  profileId: VehicleProfileId
}

export function buildCogOverlay(
  cog: CogResult,
  container: Pick<ContainerSpec, 'length' | 'width' | 'height'>,
  profileId: VehicleProfileId = DEFAULT_VEHICLE_PROFILE,
): CogOverlay {
  const profile = VEHICLE_PROFILES[profileId] ?? VEHICLE_PROFILES[DEFAULT_VEHICLE_PROFILE]
  return {
    cog: cog.cog,
    center: cog.center,
    offset: cog.offset,
    safe: computeSafeCogBox(container, profile),
    truck: profile.drawSilhouette ? buildTruckSilhouette(container) : null,
    warning: cog.warning,
    balanced: cog.balanced,
    profileId,
  }
}
