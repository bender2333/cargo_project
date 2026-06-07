import type { CargoItem, ContainerSpec, PlacedBox } from '../types'
import {
  addBox,
  isBlockingManualIssue,
  makeManualBox,
  validateDraft,
} from './manualPlacement'
import type { ManualDraft, ManualPlacedBox, ValidationIssue } from './manualPlacement'
import { orientations, placementScore } from './packing'
import type { BoxOrientation, PackingPoint } from './packing'
import type { SupportPolicy } from './placementSettings'

type QuickPlaceInput = {
  cargo: CargoItem
  draft: ManualDraft
  container: ContainerSpec
  createId: () => string
  supportPolicy?: SupportPolicy
}

type QuickPlaceSuccess = {
  ok: true
  nextDraft: ManualDraft
  box: ManualPlacedBox
  issues: ValidationIssue[]
}

type QuickPlaceFailure = {
  ok: false
  nextDraft: ManualDraft
  box: null
  issues: ValidationIssue[]
  reason: 'quantity-limit' | 'no-space'
}

export type QuickPlaceResult = QuickPlaceSuccess | QuickPlaceFailure

function pointKey(point: PackingPoint) {
  return `${Math.round(point.x)}:${Math.round(point.y)}:${Math.round(point.z)}`
}

function quickPlaceCandidates(draft: ManualDraft, container: ContainerSpec): PackingPoint[] {
  const seen = new Set<string>()
  return [
    { x: 0, y: 0, z: 0 },
    ...draft.boxes.flatMap((box) => [
      { x: box.x + box.length, y: box.y, z: box.z },
      { x: box.x, y: box.y + box.width, z: box.z },
      { x: box.x, y: box.y, z: box.z + box.height },
    ]),
  ]
    .filter((point) => point.x <= container.length && point.y <= container.width && point.z <= container.height)
    .filter((point) => {
      const key = pointKey(point)
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
}

function orientationLabel(orientationKey: BoxOrientation['orientationKey']) {
  const [x, y, z] = orientationKey.split('')
  return `X:${x}+ Y:${y}+ Z:${z}+`
}

function manualBoxAsPlacedBox(box: ManualPlacedBox): PlacedBox {
  return {
    id: box.id,
    cargoId: box.cargoId,
    name: box.label,
    label: box.label,
    index: 1,
    x: box.x,
    y: box.y,
    z: box.z,
    length: box.length,
    width: box.width,
    height: box.height,
    orientationKey: box.orientationKey,
    labelRotationDeg: box.labelRotationDeg,
    yawQuarterTurn: box.yawQuarterTurn,
    pitchQuarterTurn: box.pitchQuarterTurn,
    orientationAxes: box.orientationAxes,
    orientationLabel: box.orientationLabel,
    weight: box.weight ?? 0,
    color: box.color,
    canRotate: box.canRotate ?? true,
    stackable: box.stackable ?? true,
    maxStackLayers: box.maxStackLayers,
    groundOnly: box.groundOnly,
    physicalLayer: 1,
    verticalLayer: 1,
    workStep: 1,
    supportType: 'floor',
    supportedBy: [],
    verticalSupportedBy: [],
  }
}

function makeCandidateBox(input: QuickPlaceInput, point: PackingPoint, box: BoxOrientation) {
  const manualBox = makeManualBox({
    id: input.createId(),
    cargoId: input.cargo.id,
    label: input.cargo.label ?? input.cargo.name,
    color: input.cargo.color,
    length: box.length,
    width: box.width,
    height: box.height,
    weight: input.cargo.weight,
    canRotate: input.cargo.canRotate,
    stackable: input.cargo.stackable,
    maxStackLayers: input.cargo.maxStackLayers,
    x: point.x,
    y: point.y,
    z: point.z,
  })
  return {
    ...manualBox,
    orientationKey: box.orientationKey,
    labelRotationDeg: 0 as const,
    yawQuarterTurn: 0 as const,
    pitchQuarterTurn: 0 as const,
    orientationLabel: orientationLabel(box.orientationKey),
  }
}

export function quickPlaceCargo(input: QuickPlaceInput): QuickPlaceResult {
  const used = input.draft.boxes.filter((box) => box.cargoId === input.cargo.id).length
  if (used >= input.cargo.quantity) {
    return { ok: false, nextDraft: input.draft, box: null, issues: [], reason: 'quantity-limit' }
  }

  const placedForScore = input.draft.boxes.map(manualBoxAsPlacedBox)
  const candidates = orientations(input.cargo)
    .flatMap((box) => quickPlaceCandidates(input.draft, input.container).map((point) => ({
      box,
      point,
      score: placementScore(input.cargo, box, point, placedForScore, input.container),
    })))
    .sort((a, b) => a.score - b.score || b.box.width - a.box.width || b.box.length * b.box.width - a.box.length * a.box.width)

  for (const candidate of candidates) {
    const box = makeCandidateBox(input, candidate.point, candidate.box)
    const nextDraft = addBox(input.draft, box)
    const issues = validateDraft(nextDraft, input.container, input.supportPolicy).filter((issue) => issue.boxId === box.id)
    if (!issues.some(isBlockingManualIssue)) {
      return { ok: true, nextDraft, box, issues }
    }
  }

  return { ok: false, nextDraft: input.draft, box: null, issues: [], reason: 'no-space' }
}
