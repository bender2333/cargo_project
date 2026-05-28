import type { CargoItem, ContainerSpec, PlacedBox } from '../types'
import { DEFAULT_PLACEMENT_SETTINGS, type SupportPolicy } from './placementSettings'

export type OrientationKey = 'LWH' | 'WLH' | 'LHW' | 'HLW' | 'WHL' | 'HWL'
export type LabelRotationDeg = 0 | 90 | 180 | 270
export type QuarterTurn = 0 | 1 | 2 | 3
export type BodyAxis = 'L' | 'W' | 'H'
export type SignedBodyAxis = 'L+' | 'L-' | 'W+' | 'W-' | 'H+' | 'H-'
export type OrientationAxes = { x: SignedBodyAxis; y: SignedBodyAxis; z: SignedBodyAxis }

export type ManualPlacedBox = {
  id: string
  cargoId: string
  label: string
  color: string
  baseLength?: number
  baseWidth?: number
  baseHeight?: number
  x: number
  y: number
  z: number
  length: number
  width: number
  height: number
  orientationKey: OrientationKey
  labelRotationDeg: LabelRotationDeg
  yawQuarterTurn?: QuarterTurn
  pitchQuarterTurn?: QuarterTurn
  orientationAxes?: OrientationAxes
  orientationLabel?: string
  weight?: number
  canRotate?: boolean
  stackable?: boolean
}

export type ManualDraft = {
  boxes: ManualPlacedBox[]
}

export type ValidationIssue = {
  type: 'boundary' | 'overlap' | 'floating' | 'rotation-disabled' | 'stacking'
  severity?: 'warning' | 'error'
  message: string
  boxId: string
  supportRatio?: number
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
export const MIN_SUPPORT_OVERLAP_RATIO = 0.5

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

export function setBoxPosition(draft: ManualDraft, id: string, x: number, y: number, z?: number): ManualDraft {
  return {
    boxes: draft.boxes.map((box) =>
      box.id === id ? { ...box, x, y, ...(z !== undefined ? { z } : {}) } : box,
    ),
  }
}

export function removeBox(draft: ManualDraft, id: string): ManualDraft {
  return { boxes: draft.boxes.filter((box) => box.id !== id) }
}

const ALL_ORIENTATIONS: OrientationKey[] = ['LWH', 'WLH', 'LHW', 'HLW', 'WHL', 'HWL']

const LABEL_ROTATION_FOR_ORIENTATION: Record<OrientationKey, LabelRotationDeg> = {
  LWH: 0,
  WLH: 0,
  LHW: 0,
  HLW: 0,
  WHL: 0,
  HWL: 0,
}

export function labelRotationForManualOrientation(orientationKey: OrientationKey): LabelRotationDeg {
  return LABEL_ROTATION_FOR_ORIENTATION[orientationKey]
}

function baseDimensionsFor(box: ManualPlacedBox) {
  return {
    length: box.baseLength ?? box.length,
    width: box.baseWidth ?? box.width,
    height: box.baseHeight ?? box.height,
  }
}

function quarterTurn(value: number): QuarterTurn {
  return (((value % 4) + 4) % 4) as QuarterTurn
}

function canonicalAxesForOrientation(orientationKey: OrientationKey): OrientationAxes {
  const [x, y, z] = orientationKey.split('') as BodyAxis[]
  return { x: `${x}+` as SignedBodyAxis, y: `${y}+` as SignedBodyAxis, z: `${z}+` as SignedBodyAxis }
}

function axisLetter(axis: SignedBodyAxis): BodyAxis {
  return axis[0] as BodyAxis
}

function flipAxis(axis: SignedBodyAxis): SignedBodyAxis {
  return `${axisLetter(axis)}${axis.endsWith('+') ? '-' : '+'}` as SignedBodyAxis
}

function orientationKeyForAxes(axes: OrientationAxes): OrientationKey {
  return `${axisLetter(axes.x)}${axisLetter(axes.y)}${axisLetter(axes.z)}` as OrientationKey
}

function axesFromBox(box: ManualPlacedBox): OrientationAxes {
  return box.orientationAxes ?? canonicalAxesForOrientation(box.orientationKey)
}

function rotateAxesRight(axes: OrientationAxes): OrientationAxes {
  return {
    x: axes.y,
    y: flipAxis(axes.x),
    z: axes.z,
  }
}

function rotateAxesDown(axes: OrientationAxes): OrientationAxes {
  return {
    x: axes.x,
    y: axes.z,
    z: flipAxis(axes.y),
  }
}

function displayAxis(axis: SignedBodyAxis) {
  return axis.replace('H', 'T')
}

function orientationLabel(axes: OrientationAxes) {
  return `X:${displayAxis(axes.x)} Y:${displayAxis(axes.y)} Z:${displayAxis(axes.z)}`
}

function labelRotationForQuarterTurns(turns: QuarterTurn): LabelRotationDeg {
  return quarterTurn(-turns) * 90 as LabelRotationDeg
}

function inferTurnsForOrientation(orientationKey: OrientationKey): { yawQuarterTurn: QuarterTurn; pitchQuarterTurn: QuarterTurn } {
  const mapping: Record<OrientationKey, { yawQuarterTurn: QuarterTurn; pitchQuarterTurn: QuarterTurn }> = {
    LWH: { yawQuarterTurn: 0, pitchQuarterTurn: 0 },
    WLH: { yawQuarterTurn: 1, pitchQuarterTurn: 0 },
    LHW: { yawQuarterTurn: 0, pitchQuarterTurn: 1 },
    HLW: { yawQuarterTurn: 1, pitchQuarterTurn: 1 },
    WHL: { yawQuarterTurn: 1, pitchQuarterTurn: 1 },
    HWL: { yawQuarterTurn: 0, pitchQuarterTurn: 1 },
  }
  return mapping[orientationKey]
}

function applyOrientation(
  box: ManualPlacedBox,
  orientationKey: OrientationKey,
  turns: { yawQuarterTurn?: QuarterTurn; pitchQuarterTurn?: QuarterTurn; orientationAxes?: OrientationAxes } = {},
) {
  const base = baseDimensionsFor(box)
  const inferred = inferTurnsForOrientation(orientationKey)
  const yawQuarterTurn = turns.yawQuarterTurn ?? inferred.yawQuarterTurn
  const pitchQuarterTurn = turns.pitchQuarterTurn ?? inferred.pitchQuarterTurn
  const orientationAxes = turns.orientationAxes ?? canonicalAxesForOrientation(orientationKey)
  return {
    ...box,
    ...dimensionsForManualOrientation(base, orientationKey),
    baseLength: base.length,
    baseWidth: base.width,
    baseHeight: base.height,
    orientationKey,
    labelRotationDeg: turns.orientationAxes ? labelRotationForQuarterTurns(quarterTurn(yawQuarterTurn + pitchQuarterTurn)) : LABEL_ROTATION_FOR_ORIENTATION[orientationKey],
    yawQuarterTurn,
    pitchQuarterTurn,
    orientationAxes,
    orientationLabel: orientationLabel(orientationAxes),
  }
}

export function dimensionsForManualOrientation(
  base: { length: number; width: number; height: number },
  orientationKey: OrientationKey,
) {
  const byAxis = {
    L: base.length,
    W: base.width,
    H: base.height,
  }
  const [l, w, h] = orientationKey.split('') as Array<'L' | 'W' | 'H'>
  return {
    length: byAxis[l],
    width: byAxis[w],
    height: byAxis[h],
  }
}

export function nextManualOrientation(orientationKey: OrientationKey): OrientationKey {
  const index = ALL_ORIENTATIONS.indexOf(orientationKey)
  return ALL_ORIENTATIONS[(index + 1) % ALL_ORIENTATIONS.length]
}

export function setManualBoxOrientation(
  draft: ManualDraft,
  id: string,
  orientationKey: OrientationKey,
): ManualDraft {
  return {
    boxes: draft.boxes.map((box) => {
      if (box.id !== id) return box
      return applyOrientation(box, orientationKey)
    }),
  }
}

export function rotateBox(draft: ManualDraft, id: string): ManualDraft {
  return rotateBoxRight90(draft, id)
}

export function rotateBoxRight90(draft: ManualDraft, id: string): ManualDraft {
  const target = draft.boxes.find((box) => box.id === id)
  if (!target) return draft
  const yawQuarterTurn = quarterTurn((target.yawQuarterTurn ?? inferTurnsForOrientation(target.orientationKey).yawQuarterTurn) + 1)
  const pitchQuarterTurn = target.pitchQuarterTurn ?? inferTurnsForOrientation(target.orientationKey).pitchQuarterTurn
  const orientationAxes = rotateAxesRight(axesFromBox(target))
  const orientationKey = orientationKeyForAxes(orientationAxes)
  return {
    boxes: draft.boxes.map((box) =>
      box.id === id ? applyOrientation(box, orientationKey, { yawQuarterTurn, pitchQuarterTurn, orientationAxes }) : box,
    ),
  }
}

export function rotateBoxDown90(draft: ManualDraft, id: string): ManualDraft {
  const target = draft.boxes.find((box) => box.id === id)
  if (!target) return draft
  const inferred = inferTurnsForOrientation(target.orientationKey)
  const yawQuarterTurn = target.yawQuarterTurn ?? inferred.yawQuarterTurn
  const pitchQuarterTurn = quarterTurn((target.pitchQuarterTurn ?? inferred.pitchQuarterTurn) + 1)
  const orientationAxes = rotateAxesDown(axesFromBox(target))
  const orientationKey = orientationKeyForAxes(orientationAxes)
  return {
    boxes: draft.boxes.map((box) =>
      box.id === id ? applyOrientation(box, orientationKey, { yawQuarterTurn, pitchQuarterTurn, orientationAxes }) : box,
    ),
  }
}

export function cycleBoxOrientation(draft: ManualDraft, id: string): ManualDraft {
  const target = draft.boxes.find((box) => box.id === id)
  if (!target) return draft
  return setManualBoxOrientation(draft, id, nextManualOrientation(target.orientationKey))
}

/**
 * Returns the issues that would occur if the given box was rotated in-place, without
 * mutating the draft. Used to surface a specific reason ("rotated width exceeds container
 * width by 100 mm" / "overlaps box B") before the user actually rotates.
 */
export function dryRunRotation(draft: ManualDraft, id: string, container: ContainerSpec, direction: 'right' | 'down' = 'right', supportPolicy?: SupportPolicy): {
  ok: boolean
  rotatedBox: ManualPlacedBox | null
  issues: ValidationIssue[]
} {
  const target = draft.boxes.find((b) => b.id === id)
  if (!target) return { ok: false, rotatedBox: null, issues: [] }
  const rotated = direction === 'down' ? rotateBoxDown90(draft, id) : rotateBoxRight90(draft, id)
  const rotatedBox = rotated.boxes.find((b) => b.id === id) ?? null
  const issues = validateDraft(rotated, container, supportPolicy).filter((issue) => issue.boxId === id)
  return { ok: !issues.some(isBlockingManualIssue), rotatedBox, issues }
}

export function dryRunOrientation(
  draft: ManualDraft,
  id: string,
  orientationKey: OrientationKey,
  container: ContainerSpec,
  supportPolicy?: SupportPolicy,
): {
  ok: boolean
  rotatedBox: ManualPlacedBox | null
  issues: ValidationIssue[]
} {
  const target = draft.boxes.find((b) => b.id === id)
  if (!target) return { ok: false, rotatedBox: null, issues: [] }
  if (target.canRotate === false && orientationKey !== target.orientationKey) {
    return {
      ok: false,
      rotatedBox: target,
      issues: [{
        type: 'rotation-disabled',
        severity: 'error',
        boxId: id,
        message: `Box ${target.label} cannot be rotated.`,
      }],
    }
  }
  const rotated = setManualBoxOrientation(draft, id, orientationKey)
  const rotatedBox = rotated.boxes.find((b) => b.id === id) ?? null
  const issues = validateDraft(rotated, container, supportPolicy).filter((issue) => issue.boxId === id)
  return { ok: !issues.some(isBlockingManualIssue), rotatedBox, issues }
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

function overlapsZ(a: ManualPlacedBox, b: ManualPlacedBox): boolean {
  return a.z < b.z + b.height - EPSILON && b.z < a.z + a.height - EPSILON
}

function overlapAreaXY(a: ManualPlacedBox, b: ManualPlacedBox): number {
  const xOverlap = Math.max(0, Math.min(a.x + a.length, b.x + b.length) - Math.max(a.x, b.x))
  const yOverlap = Math.max(0, Math.min(a.y + a.width, b.y + b.width) - Math.max(a.y, b.y))
  return xOverlap * yOverlap
}

export function findSupport(box: ManualPlacedBox, others: ManualPlacedBox[], minSupportRatio: number = MIN_SUPPORT_OVERLAP_RATIO): { boxId: string; overlapRatio: number } | null {
  if (box.z <= EPSILON) {
    return { boxId: 'floor', overlapRatio: 1 }
  }

  const baseArea = box.length * box.width
  if (baseArea <= 0) return null

  let supportedArea = 0
  let strongestSupport: { boxId: string; overlapRatio: number } | null = null
  for (const other of others) {
    if (other.id === box.id) continue
    const topZ = other.z + other.height
    if (Math.abs(topZ - box.z) > EPSILON) continue
    const overlapRatio = overlapAreaXY(box, other) / baseArea
    if (overlapRatio <= 0) continue
    supportedArea += overlapAreaXY(box, other)
    if (!strongestSupport || overlapRatio > strongestSupport.overlapRatio) {
      strongestSupport = { boxId: other.id, overlapRatio }
    }
  }

  const combinedRatio = Math.min(1, supportedArea / baseArea)
  if (combinedRatio >= minSupportRatio) {
    return strongestSupport ? { boxId: strongestSupport.boxId, overlapRatio: combinedRatio } : null
  }
  return null
}

export function isBlockingManualIssue(issue: ValidationIssue) {
  return issue.severity !== 'warning'
}

export function validateDraft(draft: ManualDraft, container: ContainerSpec, supportPolicy: SupportPolicy = DEFAULT_PLACEMENT_SETTINGS.supportPolicy): ValidationIssue[] {
  const issues: ValidationIssue[] = []

  for (const box of draft.boxes) {
    if (isOutOfBounds(box, container)) {
      issues.push({
        type: 'boundary',
        severity: 'error',
        boxId: box.id,
        message: `Box ${box.label} exceeds the effective container bounds.`,
      })
    }
  }

  for (let i = 0; i < draft.boxes.length; i += 1) {
    for (let j = i + 1; j < draft.boxes.length; j += 1) {
      const a = draft.boxes[i]
      const b = draft.boxes[j]
      if (overlapsXY(a, b) && overlapsZ(a, b)) {
        issues.push({
          type: 'overlap',
          severity: 'error',
          boxId: a.id,
          message: `Box ${a.label} overlaps with ${b.label}.`,
        })
        issues.push({
          type: 'overlap',
          severity: 'error',
          boxId: b.id,
          message: `Box ${b.label} overlaps with ${a.label}.`,
        })
      }
    }
  }

  for (const box of draft.boxes) {
    const support = findSupport(box, draft.boxes, supportPolicy.allowPartialOverhang ? supportPolicy.minSupportRatio : MIN_SUPPORT_OVERLAP_RATIO)
    const supportRatio = support?.overlapRatio ?? 0
    if (!support || supportRatio < supportPolicy.minSupportRatio) {
      issues.push({
        type: 'floating',
        severity: 'error',
        boxId: box.id,
        supportRatio,
        message: `Box ${box.label} is floating and needs at least ${Math.round(supportPolicy.minSupportRatio * 100)}% base support.`,
      })
    } else if (supportPolicy.allowPartialOverhang && supportRatio < supportPolicy.warningSupportRatio) {
      issues.push({
        type: 'floating',
        severity: 'warning',
        boxId: box.id,
        supportRatio,
        message: `Box ${box.label} has partial support (${Math.round(supportRatio * 100)}%) and needs field review.`,
      })
    }
  }

  for (const box of draft.boxes) {
    if (box.z <= EPSILON) continue
    for (const support of draft.boxes) {
      if (support.id === box.id || support.stackable !== false) continue
      const supportTop = support.z + support.height
      if (Math.abs(supportTop - box.z) > EPSILON) continue
      if (overlapAreaXY(box, support) <= 0) continue
      issues.push({
        type: 'stacking',
        severity: 'error',
        boxId: box.id,
        message: `Box ${box.label} is stacked on non-stackable cargo ${support.label}.`,
      })
      break
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
  weight?: number
  canRotate?: boolean
  stackable?: boolean
  x: number
  y: number
  z?: number
}): ManualPlacedBox {
  return {
    id: params.id,
    cargoId: params.cargoId,
    label: params.label,
    color: params.color,
    baseLength: params.length,
    baseWidth: params.width,
    baseHeight: params.height,
    x: params.x,
    y: params.y,
    z: params.z ?? 0,
    length: params.length,
    width: params.width,
    height: params.height,
    orientationKey: 'LWH',
    labelRotationDeg: 0,
    yawQuarterTurn: 0,
    pitchQuarterTurn: 0,
    orientationAxes: { x: 'L+', y: 'W+', z: 'H+' },
    orientationLabel: orientationLabel({ x: 'L+', y: 'W+', z: 'H+' }),
    weight: params.weight ?? 0,
    canRotate: params.canRotate ?? true,
    stackable: params.stackable ?? true,
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
    yawQuarterTurn: box.yawQuarterTurn ?? 0,
    pitchQuarterTurn: box.pitchQuarterTurn ?? 0,
    orientationAxes: axesFromBox(box),
    orientationLabel: box.orientationLabel ?? orientationLabel(axesFromBox(box)),
    weight: box.weight ?? 0,
    color: box.color,
    stackable: box.stackable ?? true,
    physicalLayer: 1,
    workStep: 1,
    supportType: 'floor',
    supportedBy: [],
  }))
}
