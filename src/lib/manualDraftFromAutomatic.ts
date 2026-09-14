import type { CargoItem, PackingResult } from '../types'
import { makeManualBox, type ManualDraft } from './manualPlacement'
import { baseDimensionsFromPlaced } from './orientationTransform'

export type CreateManualPlacementId = (sourceId?: string) => string

export function draftFromAutomaticResult(
  automaticDisplayResult: PackingResult,
  cargoItems: CargoItem[],
  createId: CreateManualPlacementId,
): ManualDraft {
  const cargoById = new Map(cargoItems.map((cargo) => [cargo.id, cargo]))
  return {
    boxes: automaticDisplayResult.placed.map((box) => {
      const cargo = cargoById.get(box.cargoId)
      const base = baseDimensionsFromPlaced(box)
      return {
        ...makeManualBox({
          id: createId(box.id),
          cargoId: box.cargoId,
          label: box.label,
          color: box.color,
          length: base.length,
          width: base.width,
          height: base.height,
          weight: box.weight,
          canRotate: cargo?.canRotate ?? box.canRotate,
          stackable: cargo?.stackable ?? box.stackable,
          maxStackLayers: cargo?.maxStackLayers ?? box.maxStackLayers,
          groundOnly: cargo?.groundOnly ?? box.groundOnly,
          x: box.x,
          y: box.y,
          z: box.z,
        }),
        length: box.length,
        width: box.width,
        height: box.height,
        orientationKey: box.orientationKey,
        labelRotationDeg: box.labelRotationDeg,
        yawQuarterTurn: box.yawQuarterTurn,
        pitchQuarterTurn: box.pitchQuarterTurn,
        orientationAxes: box.orientationAxes ? { ...box.orientationAxes } : undefined,
        orientationLabel: box.orientationLabel,
      }
    }),
  }
}
