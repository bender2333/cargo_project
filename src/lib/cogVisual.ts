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

/**
 * Legacy silhouette descriptor (kept for tests that still consume the simple
 * rectangle-based layout). Prefer {@link TruckGeometry} for new code.
 */
export type TruckSilhouette = {
  cabFront: number
  cabBack: number
  cabWidth: number
  cabHeight: number
  trailerStart: number
  trailerEnd: number
  trailerWidth: number
  frontAxleX: number
  rearAxleX: number
  wheelRadius: number
}

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

/**
 * Full geometry descriptor for the tractor + trailer drawn beneath the container.
 *
 * All coordinates are in container-local mm: x=0 is the front of the container,
 * x=container.length is the back; y is across width (centred on 0 for the truck
 * group); z is vertical (z=0 is the container floor, the trailer deck sits at a
 * small negative offset).
 *
 * The descriptor only carries dimensions and key points — no Three.js. The
 * scene component (`ContainerScene`) translates these into LineSegments meshes.
 */
export type TruckGeometry = {
  /** Driver cab: trapezoidal body (front lower / narrower, back taller / wider). */
  cab: {
    /** x of the front nose of the cab (negative — in front of container) */
    frontX: number
    /** x where the cab meets the trailer hitch */
    backX: number
    /** body height at the front (lower) and back (taller) */
    frontHeight: number
    backHeight: number
    /** body width at the front and back (front slightly narrower for the trapezoid look) */
    frontWidth: number
    backWidth: number
  }
  /** Windshield: slanted plane on the front face of the cab. */
  windshield: {
    /** lower edge (front grille top) */
    bottomX: number
    bottomZ: number
    /** upper edge (roof front) */
    topX: number
    topZ: number
    width: number
  }
  /** Vertical grille bars in front of the windshield, evenly spaced. */
  grille: {
    x: number
    bottomZ: number
    topZ: number
    width: number
    /** number of vertical bars */
    bars: number
  }
  /** Optional roof deflector — a small box on top of the cab that hints at the cab's orientation. */
  roofDeflector: {
    frontX: number
    backX: number
    bottomZ: number
    topZ: number
    width: number
  }
  /** Trailer deck — the rectangle the container sits on. */
  trailer: {
    startX: number
    endX: number
    width: number
    deckThickness: number
  }
  /** Longitudinal chassis beam connecting front and rear axles. */
  chassisBeam: {
    fromX: number
    toX: number
    z: number
    width: number
  }
  /** Kingpin marker (small ring + cross) above the front landing-gear area. */
  kingPin: {
    x: number
    z: number
    radius: number
  }
  /** Axles with dual-wheel groups on each side. */
  axles: Array<{
    x: number
    /** vertical centre of the wheels */
    z: number
    /** distance from container centre-line to inner wheel face */
    halfTrack: number
    wheelRadius: number
    /** centre-to-centre spacing of the two wheels in a dual group */
    dualSpacing: number
  }>
}

const TRUCK_PRESETS = {
  cabFrontX: -2800,
  cabBackX: -300,
  cabFrontHeight: 2400,
  cabBackHeight: 2800,
  cabWidthShrink: 0.94, // front width = back width * shrink, gives the trapezoid look
  windshieldSlant: 0.45, // fraction of cab height occupied by the slanted glass
  grilleBars: 4,
  roofDeflectorHeight: 350,
  deckThickness: 180,
  chassisBeamWidth: 200,
  kingPinOffsetFromFront: 1200, // mm from cab back toward the trailer (positive x)
  kingPinRadius: 110,
  wheelRadius: 480,
  dualSpacing: 380, // centre-to-centre of the two wheels in a side
  rearAxleSetbackFromTail: 1800,
  frontAxleOffsetFromHead: 700,
} as const

/**
 * Produce the structured truck geometry for a given container + vehicle profile.
 * Geometry is purely a function of `container.length` / `container.width` and is
 * easily unit-testable.
 */
export function buildTruckGeometry(
  container: Pick<ContainerSpec, 'length' | 'width' | 'height'>,
  profile?: VehicleProfile,
): TruckGeometry | null {
  const cfg = profile ?? VEHICLE_PROFILES[DEFAULT_VEHICLE_PROFILE]
  if (!cfg.drawSilhouette) return null
  const cabBackWidth = Math.min(2500, container.width)
  const cabFrontWidth = cabBackWidth * TRUCK_PRESETS.cabWidthShrink
  const windshieldZ0 = TRUCK_PRESETS.cabFrontHeight * (1 - TRUCK_PRESETS.windshieldSlant)
  const grilleX = TRUCK_PRESETS.cabFrontX + 30
  const grilleWidth = cabFrontWidth * 0.7
  const roofZ = TRUCK_PRESETS.cabBackHeight
  const roofDeflectorWidth = cabBackWidth * 0.78
  const halfTrack = container.width / 2 - 80 // wheels tucked just under the deck edge
  const kingPinX = TRUCK_PRESETS.kingPinOffsetFromFront
  return {
    cab: {
      frontX: TRUCK_PRESETS.cabFrontX,
      backX: TRUCK_PRESETS.cabBackX,
      frontHeight: TRUCK_PRESETS.cabFrontHeight,
      backHeight: TRUCK_PRESETS.cabBackHeight,
      frontWidth: cabFrontWidth,
      backWidth: cabBackWidth,
    },
    windshield: {
      bottomX: TRUCK_PRESETS.cabFrontX,
      bottomZ: windshieldZ0,
      topX: TRUCK_PRESETS.cabFrontX + (TRUCK_PRESETS.cabBackX - TRUCK_PRESETS.cabFrontX) * 0.35,
      topZ: roofZ,
      width: cabFrontWidth,
    },
    grille: {
      x: grilleX,
      bottomZ: 700,
      topZ: windshieldZ0 - 80,
      width: grilleWidth,
      bars: TRUCK_PRESETS.grilleBars,
    },
    roofDeflector: {
      frontX: TRUCK_PRESETS.cabBackX - 600,
      backX: TRUCK_PRESETS.cabBackX - 100,
      bottomZ: roofZ,
      topZ: roofZ + TRUCK_PRESETS.roofDeflectorHeight,
      width: roofDeflectorWidth,
    },
    trailer: {
      startX: 0,
      endX: container.length,
      width: container.width,
      deckThickness: TRUCK_PRESETS.deckThickness,
    },
    chassisBeam: {
      fromX: kingPinX,
      toX: container.length - TRUCK_PRESETS.rearAxleSetbackFromTail + 600,
      z: -TRUCK_PRESETS.deckThickness - 80,
      width: TRUCK_PRESETS.chassisBeamWidth,
    },
    kingPin: {
      x: kingPinX,
      z: -TRUCK_PRESETS.deckThickness,
      radius: TRUCK_PRESETS.kingPinRadius,
    },
    axles: [
      {
        x: TRUCK_PRESETS.frontAxleOffsetFromHead,
        z: -TRUCK_PRESETS.deckThickness - TRUCK_PRESETS.wheelRadius * 0.6,
        halfTrack,
        wheelRadius: TRUCK_PRESETS.wheelRadius,
        dualSpacing: TRUCK_PRESETS.dualSpacing,
      },
      {
        x: container.length - TRUCK_PRESETS.rearAxleSetbackFromTail,
        z: -TRUCK_PRESETS.deckThickness - TRUCK_PRESETS.wheelRadius * 0.6,
        halfTrack,
        wheelRadius: TRUCK_PRESETS.wheelRadius,
        dualSpacing: TRUCK_PRESETS.dualSpacing,
      },
    ],
  }
}

export type CogOverlay = {
  cog: CogVector
  center: CogVector
  offset: CogVector
  safe: SafeCogBox
  /** Legacy simple silhouette — kept so existing tests / callers compile. */
  truck: TruckSilhouette | null
  /** Rich geometry descriptor used by the new scene rendering. */
  truckGeometry: TruckGeometry | null
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
    truckGeometry: buildTruckGeometry(container, profile),
    warning: cog.warning,
    balanced: cog.balanced,
    profileId,
  }
}
