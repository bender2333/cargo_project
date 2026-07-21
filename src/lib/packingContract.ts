import type { PackingDiagnostic, PackingResult } from '../types'

function compareText(a: string, b: string) {
  return a < b ? -1 : a > b ? 1 : 0
}

function roundNumber(value: number) {
  const rounded = Number(value.toFixed(6))
  return Object.is(rounded, -0) ? 0 : rounded
}

function sorted(values: string[]) {
  return [...values].sort(compareText)
}

function canonicalParams(params: PackingDiagnostic['params']): Record<string, string | number> | null {
  if (!params) return null
  return Object.fromEntries(
    Object.keys(params)
      .sort(compareText)
      .map((key) => [key, typeof params[key] === 'number' ? roundNumber(params[key]) : params[key]]),
  )
}

export function canonicalizePackingResult(result: PackingResult) {
  return {
    totals: {
      totalCargoCount: result.totalCargoCount,
      placedCount: result.placedCount,
      unplacedCount: result.unplaced.reduce((sum, entry) => sum + entry.quantity, 0),
      usedVolume: roundNumber(result.usedVolume),
      containerVolume: roundNumber(result.containerVolume),
      volumeUtilization: roundNumber(result.volumeUtilization),
      usedWeight: roundNumber(result.usedWeight),
      weightUtilization: roundNumber(result.weightUtilization),
    },
    labelStats: result.labelStats
      .map((stat) => ({
        label: stat.label,
        name: stat.name,
        color: stat.color,
        planned: stat.planned,
        placed: stat.placed,
        unplaced: stat.unplaced,
        layers: [...stat.layers].sort((a, b) => a - b),
      }))
      .sort((a, b) => compareText(a.label, b.label) || compareText(a.name, b.name)),
    layers: result.layers
      .map((layer) => ({
        id: layer.id,
        physicalLayer: layer.physicalLayer,
        minZ: roundNumber(layer.minZ),
        maxZ: roundNumber(layer.maxZ),
        count: layer.count,
        weight: roundNumber(layer.weight),
        volume: roundNumber(layer.volume),
        labels: layer.labels
          .map((entry) => ({ ...entry }))
          .sort((a, b) => compareText(a.label, b.label) || compareText(a.color, b.color)),
        supportedBy: sorted(layer.supportedBy),
      }))
      .sort((a, b) => a.physicalLayer - b.physicalLayer || compareText(a.id, b.id)),
    workSteps: result.workSteps
      .map((step) => ({ ...step }))
      .sort((a, b) => a.step - b.step || compareText(a.boxId, b.boxId)),
    placements: result.placed
      .map((box) => ({
        id: box.id,
        cargoId: box.cargoId,
        name: box.name,
        label: box.label,
        index: box.index,
        x: roundNumber(box.x),
        y: roundNumber(box.y),
        z: roundNumber(box.z),
        length: roundNumber(box.length),
        width: roundNumber(box.width),
        height: roundNumber(box.height),
        orientationKey: box.orientationKey,
        labelRotationDeg: box.labelRotationDeg,
        yawQuarterTurn: box.yawQuarterTurn ?? null,
        pitchQuarterTurn: box.pitchQuarterTurn ?? null,
        orientationAxes: box.orientationAxes ? { ...box.orientationAxes } : null,
        orientationLabel: box.orientationLabel ?? null,
        weight: roundNumber(box.weight),
        color: box.color,
        canRotate: box.canRotate,
        stackable: box.stackable,
        maxStackLayers: box.maxStackLayers ?? null,
        groundOnly: box.groundOnly ?? null,
        physicalLayer: box.physicalLayer,
        verticalLayer: box.verticalLayer ?? null,
        workStep: box.workStep,
        supportType: box.supportType,
        supportedBy: sorted(box.supportedBy),
        verticalSupportedBy: box.verticalSupportedBy ? sorted(box.verticalSupportedBy) : null,
      }))
      .sort((a, b) => compareText(a.id, b.id)),
    unplaced: result.unplaced
      .map((entry) => ({
        cargoId: entry.cargoId,
        name: entry.name,
        label: entry.label,
        quantity: entry.quantity,
        reasonCode: entry.reasonCode,
      }))
      .sort((a, b) => compareText(a.cargoId, b.cargoId) || compareText(a.label, b.label)),
    diagnostics: result.diagnostics
      .map((entry) => ({
        id: entry.id,
        severity: entry.severity,
        code: entry.code ?? null,
        params: canonicalParams(entry.params),
      }))
      .sort((a, b) => compareText(a.id, b.id) || compareText(a.code ?? '', b.code ?? '')),
  }
}

export type PackingResultContract = ReturnType<typeof canonicalizePackingResult>
