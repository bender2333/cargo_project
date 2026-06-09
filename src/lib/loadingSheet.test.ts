import { describe, expect, it } from 'vitest'
import type { ContainerSpec, PackingResult, PlacedBox } from '../types'
import { buildLoadingSheetModel } from './loadingSheet'
import { buildLoadingTaskGroups } from './loadingTaskGroups'

const container: ContainerSpec = {
  id: '40hq',
  label: "40' HQ",
  description: '',
  length: 12000,
  width: 2400,
  height: 2600,
  maxWeight: 26000,
  doorGap: 0,
  topGap: 0,
  sideGap: 0,
}

function makeBox(overrides: Partial<PlacedBox> & Pick<PlacedBox, 'id' | 'workStep' | 'label'>): PlacedBox {
  return {
    id: overrides.id,
    cargoId: overrides.cargoId ?? `cargo-${overrides.label}`,
    name: overrides.name ?? `Cargo ${overrides.label}`,
    label: overrides.label,
    index: overrides.index ?? overrides.workStep,
    x: overrides.x ?? 0,
    y: overrides.y ?? 0,
    z: overrides.z ?? 0,
    length: overrides.length ?? 1000,
    width: overrides.width ?? 500,
    height: overrides.height ?? 400,
    orientationKey: 'LWH',
    labelRotationDeg: 0,
    weight: overrides.weight ?? 10,
    color: overrides.color ?? '#f59e0b',
    canRotate: true,
    stackable: true,
    physicalLayer: overrides.physicalLayer ?? 1,
    workStep: overrides.workStep,
    supportType: overrides.supportType ?? 'floor',
    supportedBy: overrides.supportedBy ?? [],
  }
}

function makeResult(boxes: PlacedBox[]): PackingResult {
  const usedVolume = 4_500_000
  const usedWeight = 60
  const stats = new Map<string, { label: string; name: string; color: string; planned: number; placed: number; unplaced: number; layers: Set<number> }>()
  for (const box of boxes) {
    const key = `${box.label}\u0000${box.name}`
    const existing = stats.get(key)
    if (existing) {
      existing.planned += 1
      existing.placed += 1
      existing.layers.add(box.physicalLayer)
    } else {
      stats.set(key, {
        label: box.label,
        name: box.name,
        color: box.color,
        planned: 1,
        placed: 1,
        unplaced: 0,
        layers: new Set([box.physicalLayer]),
      })
    }
  }
  return {
    placed: boxes,
    unplaced: [],
    layers: [],
    workSteps: boxes.map((box) => ({
      step: box.workStep,
      boxId: box.id,
      cargoId: box.cargoId,
      label: box.label,
      physicalLayer: box.physicalLayer,
      supportType: box.supportType,
    })),
    labelStats: [...stats.values()].map((stat) => ({ ...stat, layers: [...stat.layers].sort((a, b) => a - b) })),
    diagnostics: [],
    totalCargoCount: boxes.length,
    placedCount: boxes.length,
    usedVolume,
    containerVolume: container.length * container.width * container.height,
    volumeUtilization: 6.01,
    usedWeight,
    weightUtilization: 0.23,
  }
}

describe('buildLoadingSheetModel', () => {
  it('keeps loading task group count, sequence, and new box ids aligned', () => {
    const result = makeResult([
      makeBox({ id: 'a1', label: 'A', workStep: 1, x: 0 }),
      makeBox({ id: 'a2', label: 'A', workStep: 2, x: 200 }),
      makeBox({ id: 'b1', label: 'B', workStep: 3, x: 1100, color: '#2563eb' }),
      makeBox({ id: 'c1', label: 'C', workStep: 4, x: 1100, z: 400, physicalLayer: 2, supportType: 'fully-supported', supportedBy: ['b1'], color: '#16a34a' }),
    ])

    const groups = buildLoadingTaskGroups(result)
    const model = buildLoadingSheetModel(result, container)

    expect(model.steps).toHaveLength(groups.length)
    expect(model.steps.map((step) => step.sequence)).toEqual(groups.map((group) => group.sequence))
    expect(model.steps.map((step) => step.newBoxIds)).toEqual(groups.map((group) => group.boxIds))
  })

  it('makes each cumulative step grow exactly by that task group', () => {
    const result = makeResult([
      makeBox({ id: 'a1', label: 'A', workStep: 1, x: 0 }),
      makeBox({ id: 'a2', label: 'A', workStep: 2, x: 200 }),
      makeBox({ id: 'b1', label: 'B', workStep: 3, x: 1100, color: '#2563eb' }),
      makeBox({ id: 'c1', label: 'C', workStep: 4, x: 1100, z: 400, physicalLayer: 2, supportType: 'fully-supported', supportedBy: ['b1'], color: '#16a34a' }),
    ])

    const model = buildLoadingSheetModel(result, container)

    for (const [index, step] of model.steps.entries()) {
      const previous = new Set(index === 0 ? [] : model.steps[index - 1].cumulativeBoxIds)
      const current = new Set(step.cumulativeBoxIds)
      for (const id of previous) expect(current.has(id)).toBe(true)
      const delta = step.cumulativeBoxIds.filter((id) => !previous.has(id)).sort()
      expect(delta).toEqual([...step.newBoxIds].sort())
    }
  })

  it('keeps legend counts and summary metrics tied to the packing result', () => {
    const result = makeResult([
      makeBox({ id: 'a1', label: 'A', workStep: 1, cargoId: 'cargo-a', x: 0 }),
      makeBox({ id: 'a2', label: 'A', workStep: 2, cargoId: 'cargo-a', x: 800 }),
      makeBox({ id: 'b1', label: 'B', workStep: 3, cargoId: 'cargo-b', color: '#2563eb', weight: 40, x: 1100 }),
    ])

    const model = buildLoadingSheetModel(result, container)

    expect(model.legend.rows.map((row) => [row.label, row.count])).toEqual([['A', 2], ['B', 1]])
    expect(model.legend.rows.reduce((sum, row) => sum + row.count, 0)).toBe(result.placed.length)
    expect(model.legend.summary).toMatchObject({
      placedCount: result.placedCount,
      totalWeight: result.usedWeight,
      usedVolume: result.usedVolume,
      containerVolume: result.containerVolume,
      volumeUtilization: result.volumeUtilization,
    })
    expect(model.legend.summary.loadedLength).toBe(2100)
  })

  it('returns an empty model for empty packing results', () => {
    const model = buildLoadingSheetModel(makeResult([]), container)

    expect(model.steps).toEqual([])
    expect(model.legend.rows).toEqual([])
    expect(model.legend.summary).toMatchObject({
      placedCount: 0,
      loadedLength: 0,
    })
  })
})
