import { describe, expect, it } from 'vitest'
import type { CargoItem, ContainerSpec } from '../types'
import { addBox, emptyDraft, makeManualBox, validateDraft } from './manualPlacement'
import { quickPlaceCargo } from './quickPlace'
import { renderedFootprint } from './renderedFootprint'

function container(overrides: Partial<ContainerSpec> = {}): ContainerSpec {
  return {
    id: 'test',
    label: 'Test container',
    description: '',
    length: 1000,
    width: 1000,
    height: 1200,
    maxWeight: 20000,
    doorGap: 0,
    topGap: 0,
    sideGap: 0,
    ...overrides,
  }
}

function cargo(overrides: Partial<CargoItem> = {}): CargoItem {
  return {
    id: 'cargo-a',
    name: 'Carton A',
    label: 'A',
    length: 500,
    width: 500,
    height: 400,
    weight: 10,
    quantity: 4,
    color: '#f59e0b',
    canRotate: true,
    stackable: true,
    ...overrides,
  }
}

describe('quickPlaceCargo', () => {
  it('places the next cargo by automatic depth-first scoring instead of grid scan order', () => {
    const existing = makeManualBox({
      id: 'existing',
      cargoId: 'cargo-a',
      label: 'A',
      color: '#f59e0b',
      length: 500,
      width: 500,
      height: 400,
      x: 0,
      y: 0,
    })
    const draft = addBox(emptyDraft(), existing)

    const result = quickPlaceCargo({
      cargo: cargo(),
      draft,
      container: container(),
      createId: () => 'quick-1',
    })

    expect(result.ok).toBe(true)
    expect(result.box).toMatchObject({ id: 'quick-1', x: 0, y: 500, z: 0 })
    expect(result.nextDraft.boxes).toHaveLength(2)
    expect(validateDraft(result.nextDraft, container()).filter((issue) => issue.boxId === 'quick-1')).toEqual([])
  })

  it('tries rotatable orientations and chooses the best scored legal placement', () => {
    const narrowCargo = cargo({
      length: 700,
      width: 300,
      height: 400,
      quantity: 1,
      canRotate: true,
    })

    const result = quickPlaceCargo({
      cargo: narrowCargo,
      draft: emptyDraft(),
      container: container({ length: 500, width: 1000, height: 1200 }),
      createId: () => 'quick-rotated',
    })

    expect(result.ok).toBe(true)
    expect(result.box).toMatchObject({ id: 'quick-rotated', length: 300, width: 700, x: 0, y: 0, z: 0 })
    expect(validateDraft(result.nextDraft, container({ length: 500, width: 1000, height: 1200 })).filter((issue) => issue.boxId === 'quick-rotated')).toEqual([])
  })

  it('keeps rotated quick-place metadata aligned with the validated render footprint', () => {
    const result = quickPlaceCargo({
      cargo: cargo({ length: 700, width: 300, height: 400, quantity: 1 }),
      draft: emptyDraft(),
      container: container({ length: 500, width: 1000, height: 1200 }),
      createId: () => 'quick-rendered',
    })

    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error('Expected rotated quick placement to succeed')
    expect(result.box).toMatchObject({
      length: 300,
      width: 700,
      height: 400,
      baseLength: 700,
      baseWidth: 300,
      baseHeight: 400,
      orientationKey: 'WLH',
      orientationAxes: { x: 'W+', y: 'L+', z: 'H+' },
    })
    expect(renderedFootprint(result.box)).toEqual({ xExtent: 300, yExtent: 700, zExtent: 400 })
  })

  it('keeps dense 0720 D-cargo quick placements consistent between validation and rendering', () => {
    const snapshotContainer = container({ length: 5900, width: 2350, height: 2380 })
    const snapshotCargo = cargo({
      id: 'cargo-0720-d',
      label: 'D',
      length: 530,
      width: 305,
      height: 360,
      quantity: 48,
      weight: 24,
    })
    let draft = emptyDraft()
    let id = 0

    for (let index = 0; index < snapshotCargo.quantity; index += 1) {
      const result = quickPlaceCargo({
        cargo: snapshotCargo,
        draft,
        container: snapshotContainer,
        createId: () => `quick-0720-${id += 1}`,
      })
      expect(result.ok).toBe(true)
      if (!result.ok) throw new Error(`Expected 0720 cargo ${index + 1} to fit`)
      expect(renderedFootprint(result.box)).toEqual({
        xExtent: result.box.length,
        yExtent: result.box.width,
        zExtent: result.box.height,
      })
      draft = result.nextDraft
    }

    expect(validateDraft(draft, snapshotContainer)).toEqual([])
  })

  it('stacks on an existing compatible top when no floor space remains', () => {
    const floor = [
      { id: 'a', x: 0, y: 0 },
      { id: 'b', x: 500, y: 0 },
      { id: 'c', x: 0, y: 500 },
      { id: 'd', x: 500, y: 500 },
    ].reduce(
      (draft, item) => addBox(draft, makeManualBox({
        id: item.id,
        cargoId: 'cargo-a',
        label: 'A',
        color: '#f59e0b',
        length: 500,
        width: 500,
        height: 400,
        x: item.x,
        y: item.y,
      })),
      emptyDraft(),
    )

    const result = quickPlaceCargo({
      cargo: cargo({ quantity: 5 }),
      draft: floor,
      container: container(),
      createId: () => 'quick-stack',
    })

    expect(result.ok).toBe(true)
    expect(result.box).toMatchObject({ id: 'quick-stack', x: 0, y: 500, z: 400 })
    expect(validateDraft(result.nextDraft, container()).filter((issue) => issue.boxId === 'quick-stack')).toEqual([])
  })

  it('fails loudly when the cargo quantity has already been fully placed', () => {
    const draft = addBox(emptyDraft(), makeManualBox({
      id: 'existing',
      cargoId: 'cargo-a',
      label: 'A',
      color: '#f59e0b',
      length: 500,
      width: 500,
      height: 400,
      x: 0,
      y: 0,
    }))

    const result = quickPlaceCargo({
      cargo: cargo({ quantity: 1 }),
      draft,
      container: container(),
      createId: () => 'quick-over',
    })

    expect(result.ok).toBe(false)
    if (result.ok) throw new Error('Expected quick place to fail on quantity limit')
    expect(result.reason).toBe('quantity-limit')
    expect(result.nextDraft).toBe(draft)
  })
})
