import type { CargoItem, ContainerSpec, PackingDiagnostic, PackingResult, PlacementBox, PlacedBox } from '../types'
import { finalizePlacementGeometry } from './finalizePackingResult'
import { buildLabelStats } from './labels'
import type { ValidationIssue } from './manualPlacement'
import { manualIssueIdentity } from './planCompliance'

export const MANUAL_UNPLACED_REASON_CODE = 'manual-not-placed'
const MANUAL_UNPLACED_REASON = 'Not placed in manual plan'

function enrichPlacedBoxes(boxes: PlacementBox[], cargoItems: CargoItem[]) {
  const cargoById = new Map(cargoItems.map((cargo) => [cargo.id, cargo]))
  const indexes = new Map<string, number>()
  return boxes.map((box) => {
    const index = (indexes.get(box.cargoId) ?? 0) + 1
    indexes.set(box.cargoId, index)
    const cargo = cargoById.get(box.cargoId)
    return {
      ...box,
      name: cargo?.name ?? box.name,
      label: cargo?.label || box.label,
      color: cargo?.color ?? box.color,
      index,
    }
  })
}

function buildManualDiagnostics(
  placed: PlacedBox[],
  container: ContainerSpec,
  validationIssues?: ValidationIssue[],
): PackingDiagnostic[] {
  const diagnostics: PackingDiagnostic[] = []
  const usedIds = new Set<string>()

  const pushUnique = (diagnostic: PackingDiagnostic) => {
    if (usedIds.has(diagnostic.id)) return
    usedIds.add(diagnostic.id)
    diagnostics.push(diagnostic)
  }

  const usedWeight = placed.reduce((sum, box) => sum + box.weight, 0)
  const hasProjectedOverweight = validationIssues?.some((issue) => issue.type === 'overweight') ?? false
  if (!hasProjectedOverweight && container.maxWeight && usedWeight > container.maxWeight) {
    pushUnique({
      id: 'weight-check',
      severity: 'error',
      message: `Total weight ${usedWeight} kg exceeds container max weight ${container.maxWeight} kg.`,
    })
  }

  if (validationIssues) {
    for (const issue of validationIssues) {
      const code = issueToDiagnosticCode(issue.type)
      if (!code) continue
      const sourceIssueId = manualIssueIdentity(issue)
      pushUnique({
        id: `${code}:${sourceIssueId}`,
        code,
        source: 'manual',
        sourceIssueId,
        severity: issue.severity === 'warning' ? 'warning' : 'error',
        message: issue.message,
      })
    }
  }

  return diagnostics
}

function issueToDiagnosticCode(type: ValidationIssue['type']): string | null {
  switch (type) {
    case 'boundary': return 'boundary-check'
    case 'overlap': return 'overlap-check'
    case 'floating': return 'support-check'
    case 'stacking':
    case 'max-stack-layers':
    case 'ground-only': return 'stacking-check'
    case 'overweight': return 'weight-check'
    default: return null
  }
}

export function buildManualPackingResult(
  boxes: PlacementBox[],
  container: ContainerSpec,
  cargoItems?: CargoItem[],
  validationIssues?: ValidationIssue[],
): PackingResult {
  const inputBoxes = cargoItems ? enrichPlacedBoxes(boxes, cargoItems) : boxes
  const { placed, layers, workSteps } = finalizePlacementGeometry(inputBoxes, container)

  const usedVolume = placed.reduce((sum, box) => sum + box.length * box.width * box.height, 0)
  const containerVolume = container.length * container.width * container.height
  const usedWeight = placed.reduce((sum, box) => sum + box.weight, 0)
  const placedByCargoId = new Map<string, number>()
  for (const box of placed) {
    placedByCargoId.set(box.cargoId, (placedByCargoId.get(box.cargoId) ?? 0) + 1)
  }
  const unplaced = (cargoItems ?? []).flatMap((cargo) => {
    const quantity = Math.max(0, cargo.quantity - (placedByCargoId.get(cargo.id) ?? 0))
    return quantity > 0
      ? [{
          cargoId: cargo.id,
          name: cargo.name,
          label: cargo.label || cargo.name,
          quantity,
          reason: MANUAL_UNPLACED_REASON,
          reasonCode: MANUAL_UNPLACED_REASON_CODE,
        }]
      : []
  })

  return {
    placed,
    unplaced,
    layers,
    workSteps,
    labelStats: buildLabelStats(cargoItems ?? [], placed),
    diagnostics: buildManualDiagnostics(placed, container, validationIssues),
    totalCargoCount: cargoItems
      ? cargoItems.reduce((sum, cargo) => sum + cargo.quantity, 0)
      : placed.length,
    placedCount: placed.length,
    usedVolume,
    containerVolume,
    volumeUtilization: containerVolume ? (usedVolume / containerVolume) * 100 : 0,
    usedWeight,
    weightUtilization: container.maxWeight ? (usedWeight / container.maxWeight) * 100 : 0,
  }
}
