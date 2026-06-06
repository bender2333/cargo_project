import type { CargoItem, ContainerSpec } from '../types'
import {
  addBox,
  isBlockingManualIssue,
  makeManualBox,
  validateDraft,
} from './manualPlacement'
import type { ManualDraft, ManualPlacedBox, ValidationIssue } from './manualPlacement'
import type { SupportPolicy } from './placementSettings'

type QuickPlaceInput = {
  cargo: CargoItem
  draft: ManualDraft
  container: ContainerSpec
  createId: () => string
  supportPolicy?: SupportPolicy
  stepMm?: number
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

function floorCandidates(cargo: CargoItem, container: ContainerSpec, stepMm: number) {
  const candidates: Array<{ x: number; y: number; z: number }> = []
  const maxX = container.length - cargo.length
  const maxY = container.width - cargo.width
  if (maxX < 0 || maxY < 0 || container.height < cargo.height) {
    return candidates
  }

  for (let y = 0; y <= maxY; y += stepMm) {
    for (let x = 0; x <= maxX; x += stepMm) {
      candidates.push({ x, y, z: 0 })
    }
  }

  if (maxX % stepMm !== 0 || maxY % stepMm !== 0) {
    candidates.push({ x: Math.max(0, maxX), y: Math.max(0, maxY), z: 0 })
  }
  return candidates
}

function stackCandidates(cargo: CargoItem, draft: ManualDraft, container: ContainerSpec) {
  return draft.boxes
    .filter((box) => box.stackable !== false)
    .map((box) => ({ x: box.x, y: box.y, z: box.z + box.height }))
    .filter((candidate) => (
      candidate.x + cargo.length <= container.length &&
      candidate.y + cargo.width <= container.width &&
      candidate.z + cargo.height <= container.height
    ))
}

export function quickPlaceCargo(input: QuickPlaceInput): QuickPlaceResult {
  const used = input.draft.boxes.filter((box) => box.cargoId === input.cargo.id).length
  if (used >= input.cargo.quantity) {
    return { ok: false, nextDraft: input.draft, box: null, issues: [], reason: 'quantity-limit' }
  }

  const stepMm = Math.max(1, input.stepMm ?? Math.min(input.cargo.length, input.cargo.width, 500))
  const candidates = [
    ...floorCandidates(input.cargo, input.container, stepMm),
    ...stackCandidates(input.cargo, input.draft, input.container),
  ]

  for (const candidate of candidates) {
    const box = makeManualBox({
      id: input.createId(),
      cargoId: input.cargo.id,
      label: input.cargo.label ?? input.cargo.name,
      color: input.cargo.color,
      length: input.cargo.length,
      width: input.cargo.width,
      height: input.cargo.height,
      weight: input.cargo.weight,
      canRotate: input.cargo.canRotate,
      stackable: input.cargo.stackable,
      maxStackLayers: input.cargo.maxStackLayers,
      x: candidate.x,
      y: candidate.y,
      z: candidate.z,
    })
    const nextDraft = addBox(input.draft, box)
    const issues = validateDraft(nextDraft, input.container, input.supportPolicy).filter((issue) => issue.boxId === box.id)
    if (!issues.some(isBlockingManualIssue)) {
      return { ok: true, nextDraft, box, issues }
    }
  }

  return { ok: false, nextDraft: input.draft, box: null, issues: [], reason: 'no-space' }
}
