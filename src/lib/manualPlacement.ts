import type { CargoItem, ContainerSpec, PlacedBox } from '../types'

export type OrientationKey = 'LWH' | 'WLH' | 'LHW' | 'HLW' | 'WHL' | 'HWL'
export type LabelRotationDeg = 0 | 90 | 180 | 270

export type ManualPlacedBox = {
  id: string
  cargoId: string
  label: string
  color: string
  x: number
  y: number
  z: number
  length: number
  width: number
  height: number
  orientationKey: OrientationKey
  labelRotationDeg: LabelRotationDeg
}

export type ManualDraft = {
  boxes: ManualPlacedBox[]
}

export type ValidationIssue = {
  type: 'boundary' | 'overlap'
  message: string
  boxId: string
}

export type PoolEntry = {
  cargoId: string
  label: string
  color: string
  length: number
  width: number
  height: number
  remaining: number
  canRotate: boolean
  stackable: boolean
}

export type ManualHistory = {
  past: ManualDraft[]
  present: ManualDraft
  future: ManualDraft[]
}

const EPSILON = 0.001
const HISTORY_LIMIT = 100

export function emptyDraft(): ManualDraft {
  return { boxes: [] }
}

export function emptyHistory(): ManualHistory {
  return { past: [], present: emptyDraft(), future: [] }
}

export function addBox(draft: ManualDraft, box: ManualPlacedBox): ManualDraft {
  return { boxes: [...draft.boxes, { ...box }] }
}

export function moveBox(draft: ManualDraft, id: string, dx: number, dy: number): ManualDraft {
  return {
    boxes: draft.boxes.map((box) =>
      box.id === id ? { ...box, x: box.x + dx, y: box.y + dy } : box,
    ),
  }
}

export function setBoxPosition(draft: ManualDraft, id: string, x: number, y: number): ManualDraft {
  return {
    boxes: draft.boxes.map((box) =>
      box.id === id ? { ...box, x, y } : box,
    ),
  }
}

export function removeBox(draft: ManualDraft, id: string): ManualDraft {
  return { boxes: draft.boxes.filter((box) => box.id !== id) }
}

const HORIZONTAL_ROTATION_NEXT: Record<OrientationKey, OrientationKey> = {
  LWH: 'WLH',
  WLH: 'LWH',
  LHW: 'HLW',
  HLW: 'LHW',
  WHL: 'HWL',
  HWL: 'WHL',
}

const LABEL_ROTATION_FOR_ORIENTATION: Record<OrientationKey, LabelRotationDeg> = {
  LWH: 0,
  WLH: 90,
  LHW: 90,
  HLW: 180,
  WHL: 270,
  HWL: 180,
}

export function rotateBox(draft: ManualDraft, id: string): ManualDraft {
  return {
    boxes: draft.boxes.map((box) => {
      if (box.id !== id) return box
      const nextOrientation = HORIZONTAL_ROTATION_NEXT[box.orientationKey]
      return {
        ...box,
        length: box.width,
        width: box.length,
        orientationKey: nextOrientation,
        labelRotationDeg: LABEL_ROTATION_FOR_ORIENTATION[nextOrientation],
      }
    }),
  }
}

function isOutOfBounds(box: ManualPlacedBox, container: ContainerSpec): boolean {
  return (
    box.x < -EPSILON ||
    box.y < -EPSILON ||
    box.x + box.length > container.length + EPSILON ||
    box.y + box.width > container.width + EPSILON ||
    box.z < -EPSILON ||
    box.z + box.height > container.height + EPSILON
  )
}

function overlapsXY(a: ManualPlacedBox, b: ManualPlacedBox): boolean {
  return !(
    a.x + a.length <= b.x + EPSILON ||
    b.x + b.length <= a.x + EPSILON ||
    a.y + a.width <= b.y + EPSILON ||
    b.y + b.width <= a.y + EPSILON
  )
}

export function validateDraft(draft: ManualDraft, container: ContainerSpec): ValidationIssue[] {
  const issues: ValidationIssue[] = []

  for (const box of draft.boxes) {
    if (isOutOfBounds(box, container)) {
      issues.push({
        type: 'boundary',
        boxId: box.id,
        message: `Box ${box.label} exceeds the effective container bounds.`,
      })
    }
  }

  for (let i = 0; i < draft.boxes.length; i += 1) {
    for (let j = i + 1; j < draft.boxes.length; j += 1) {
      const a = draft.boxes[i]
      const b = draft.boxes[j]
      if (overlapsXY(a, b)) {
        issues.push({
          type: 'overlap',
          boxId: a.id,
          message: `Box ${a.label} overlaps with ${b.label}.`,
        })
        issues.push({
          type: 'overlap',
          boxId: b.id,
          message: `Box ${b.label} overlaps with ${a.label}.`,
        })
      }
    }
  }

  return issues
}

export function buildPool(cargoItems: CargoItem[], draft: ManualDraft): PoolEntry[] {
  const usedByCargoId = new Map<string, number>()
  for (const box of draft.boxes) {
    usedByCargoId.set(box.cargoId, (usedByCargoId.get(box.cargoId) ?? 0) + 1)
  }

  return cargoItems.map((item) => {
    const used = usedByCargoId.get(item.id) ?? 0
    const remaining = Math.max(0, item.quantity - used)
    return {
      cargoId: item.id,
      label: item.label ?? item.name,
      color: item.color,
      length: item.length,
      width: item.width,
      height: item.height,
      remaining,
      canRotate: item.canRotate,
      stackable: item.stackable,
    }
  })
}

export function commit(history: ManualHistory, next: ManualDraft): ManualHistory {
  const nextPast = [...history.past, history.present]
  const trimmedPast = nextPast.length > HISTORY_LIMIT
    ? nextPast.slice(nextPast.length - HISTORY_LIMIT)
    : nextPast

  return {
    past: trimmedPast,
    present: next,
    future: [],
  }
}

export function undo(history: ManualHistory): ManualHistory {
  if (history.past.length === 0) {
    return history
  }
  const previous = history.past[history.past.length - 1]
  const remainingPast = history.past.slice(0, -1)
  return {
    past: remainingPast,
    present: previous,
    future: [history.present, ...history.future],
  }
}

export function redo(history: ManualHistory): ManualHistory {
  if (history.future.length === 0) {
    return history
  }
  const [next, ...rest] = history.future
  return {
    past: [...history.past, history.present],
    present: next,
    future: rest,
  }
}

export function makeManualBox(params: {
  id: string
  cargoId: string
  label: string
  color: string
  length: number
  width: number
  height: number
  x: number
  y: number
}): ManualPlacedBox {
  return {
    id: params.id,
    cargoId: params.cargoId,
    label: params.label,
    color: params.color,
    x: params.x,
    y: params.y,
    z: 0,
    length: params.length,
    width: params.width,
    height: params.height,
    orientationKey: 'LWH',
    labelRotationDeg: 0,
  }
}

/**
 * Adapter: convert manual placed boxes into the PlacedBox shape consumed by
 * the 3D scene and the layered plan view. Fills in safe defaults for fields
 * the manual editor does not track yet (work step, layer, support, weight).
 *
 * The set of invalid box ids is passed alongside so the renderer can apply
 * a red highlight without polluting PlacedBox with a manual-only flag.
 */
export function toPlacedBoxes(
  draft: ManualDraft,
  invalidBoxIds: Set<string>,
): PlacedBox[] {
  void invalidBoxIds
  return draft.boxes.map((box) => ({
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
    weight: 0,
    color: box.color,
    stackable: true,
    physicalLayer: 1,
    workStep: 1,
    supportType: 'floor',
    supportedBy: [],
  }))
}
