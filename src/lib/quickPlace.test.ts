import { describe, expect, it } from 'vitest'
import type { CargoItem, ContainerSpec } from '../types'
import { addBox, emptyDraft, makeManualBox, validateDraft } from './manualPlacement'
import { quickPlaceCargo } from './quickPlace'

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
  it('places the next cargo at the first valid floor position', () => {
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
      stepMm: 500,
    })

    expect(result.ok).toBe(true)
    expect(result.box).toMatchObject({ id: 'quick-1', x: 500, y: 0, z: 0 })
    expect(result.nextDraft.boxes).toHaveLength(2)
    expect(validateDraft(result.nextDraft, container()).filter((issue) => issue.boxId === 'quick-1')).toEqual([])
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
      stepMm: 500,
    })

    expect(result.ok).toBe(true)
    expect(result.box).toMatchObject({ id: 'quick-stack', x: 0, y: 0, z: 400 })
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
