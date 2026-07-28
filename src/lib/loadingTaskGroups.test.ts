import { describe, expect, it } from 'vitest'
import type { PackingResult, PlacedBox } from '../types'
import { buildLoadingTaskGroups } from './loadingTaskGroups'

function makeBox(overrides: Partial<PlacedBox> & Pick<PlacedBox, 'id' | 'workStep'>): PlacedBox {
  return {
    id: overrides.id,
    cargoId: `cargo-${overrides.id}`,
    name: `Box ${overrides.id}`,
    label: overrides.label ?? 'A',
    index: 0,
    x: overrides.x ?? 0,
    y: overrides.y ?? 0,
    z: overrides.z ?? 0,
    length: overrides.length ?? 100,
    width: overrides.width ?? 100,
    height: overrides.height ?? 100,
    orientationKey: 'LWH',
    labelRotationDeg: 0,
    weight: 1,
    color: overrides.color ?? '#f59e0b',
    canRotate: true,
    stackable: true,
    physicalLayer: overrides.physicalLayer ?? 1,
    depthLayer: overrides.depthLayer ?? 1,
    workStep: overrides.workStep,
    supportType: overrides.supportType ?? 'floor',
    supportedBy: overrides.supportedBy ?? [],
  }
}

function makeResult(boxes: PlacedBox[]): PackingResult {
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
    labelStats: [],
    diagnostics: [],
    totalCargoCount: boxes.length,
    placedCount: boxes.length,
    usedVolume: 0,
    containerVolume: 0,
    volumeUtilization: 0,
    usedWeight: 0,
    weightUtilization: 0,
  }
}

describe('buildLoadingTaskGroups', () => {
  it('merges consecutive boxes in the same layer, depth segment, label set, and support state', () => {
    const groups = buildLoadingTaskGroups(makeResult([
      makeBox({ id: 'a', workStep: 1, x: 0, label: 'A' }),
      makeBox({ id: 'b', workStep: 2, x: 200, label: 'A' }),
      makeBox({ id: 'c', workStep: 3, x: 400, label: 'A' }),
    ]))

    expect(groups).toHaveLength(1)
    expect(groups[0].boxIds).toEqual(['a', 'b', 'c'])
    expect(groups[0].stepStart).toBe(1)
    expect(groups[0].stepEnd).toBe(3)
    expect(groups[0].labels).toEqual([{ label: 'A', color: '#f59e0b', count: 3 }])
  })

  it('keeps one stack in a single stage', () => {
    // Placing a floor box then stacking on it is one continuous action for the crew, so
    // it stays one stage. This previously split because the stage boundary keyed off
    // `physicalLayer`/`supportType`, which the X-axis overwrite made a proxy for depth.
    const groups = buildLoadingTaskGroups(makeResult([
      makeBox({ id: 'floor', workStep: 1, depthLayer: 1 }),
      makeBox({ id: 'top', workStep: 2, depthLayer: 1, z: 100, supportType: 'fully-supported', supportedBy: ['floor'] }),
    ]))

    expect(groups.map((group) => group.boxIds)).toEqual([['floor', 'top']])
  })

  it('splits across loading waves', () => {
    const groups = buildLoadingTaskGroups(makeResult([
      makeBox({ id: 'wave-1', workStep: 1, depthLayer: 1 }),
      makeBox({ id: 'wave-2', workStep: 2, depthLayer: 2 }),
    ]))

    expect(groups.map((group) => group.boxIds)).toEqual([['wave-1'], ['wave-2']])
  })

  it('splits across obvious depth segments', () => {
    const groups = buildLoadingTaskGroups(makeResult([
      makeBox({ id: 'inner-a', workStep: 1, x: 0 }),
      makeBox({ id: 'inner-b', workStep: 2, x: 900 }),
      makeBox({ id: 'outer', workStep: 3, x: 1000 }),
    ]))

    expect(groups.map((group) => group.boxIds)).toEqual([['inner-a', 'inner-b'], ['outer']])
  })

  it('reports mixed support states within one stage instead of splitting on them', () => {
    // Under the old X-axis overwrite `supportType` was a function of x alone, so it was
    // constant inside a wave and this split never fired independently of the depth split.
    // With real support semantics it would fragment every stack, so the stage keeps the
    // boxes together and surfaces both states through `supportTypes`.
    const groups = buildLoadingTaskGroups(makeResult([
      makeBox({ id: 'floor-a', workStep: 1, supportType: 'floor' }),
      makeBox({ id: 'floor-b', workStep: 2, supportType: 'floor' }),
      makeBox({ id: 'partial', workStep: 3, supportType: 'partially-supported', supportedBy: ['floor-a'] }),
    ]))

    expect(groups.map((group) => group.boxIds)).toEqual([['floor-a', 'floor-b', 'partial']])
    expect(groups[0].supportTypes).toEqual(['floor', 'partially-supported'])
  })

  it('preserves every placed box through step ranges and ids', () => {
    const boxes = [
      makeBox({ id: 'b', workStep: 2, x: 200 }),
      makeBox({ id: 'a', workStep: 1, x: 0 }),
      makeBox({ id: 'c', workStep: 3, x: 1100 }),
    ]
    const groups = buildLoadingTaskGroups(makeResult(boxes))

    expect(groups.flatMap((group) => group.boxIds)).toEqual(['a', 'b', 'c'])
    expect(groups.map((group) => [group.stepStart, group.stepEnd])).toEqual([[1, 2], [3, 3]])
  })
})
