import { describe, expect, it } from 'vitest'
import type { CargoItem, ContainerSpec } from '../types'
import { generateBlockCandidates } from './blocks'

function container(overrides: Partial<ContainerSpec> = {}): ContainerSpec {
  return {
    id: '20gp',
    label: "Container 20'",
    description: '',
    length: 5758,
    width: 2352,
    height: 2385,
    maxWeight: 28200,
    doorGap: 0,
    topGap: 0,
    sideGap: 0,
    ...overrides,
  }
}

function cargo(overrides: Partial<CargoItem> = {}): CargoItem {
  return {
    id: 'tb-c10',
    name: 'TB-C10',
    label: 'TB-C10',
    length: 530,
    width: 305,
    height: 310,
    weight: 8,
    quantity: 126,
    color: '#f97316',
    canRotate: true,
    stackable: true,
    ...overrides,
  }
}

describe('generateBlockCandidates', () => {
  it('generates regular same-SKU blocks wide enough to use seven 305mm cartons across a 20GP width', () => {
    const blocks = generateBlockCandidates(cargo(), container())

    const sevenAcross = blocks.find((block) => (
      block.orientationKey === 'LWH'
      && block.ny === 7
      && block.nx === 1
      && block.nz === 1
    ))

    expect(sevenAcross).toMatchObject({
      width: 2135,
      count: 7,
    })
    expect(sevenAcross!.width).toBeLessThanOrEqual(container().width)
  })

  it('keeps ground-only cargo blocks on a single vertical layer', () => {
    const blocks = generateBlockCandidates(cargo({ groundOnly: true }), container())

    expect(blocks.length).toBeGreaterThan(0)
    expect(blocks.every((block) => block.nz === 1)).toBe(true)
  })

  it('keeps non-stackable cargo blocks on a single vertical layer', () => {
    const blocks = generateBlockCandidates(cargo({ stackable: false }), container())

    expect(blocks.length).toBeGreaterThan(0)
    expect(blocks.every((block) => block.nz === 1)).toBe(true)
  })

  it('honors maxStackLayers when building vertical block candidates', () => {
    const blocks = generateBlockCandidates(cargo({ maxStackLayers: 3 }), container({ height: 4000 }))

    expect(blocks.length).toBeGreaterThan(0)
    expect(Math.max(...blocks.map((block) => block.nz))).toBe(3)
  })

  it('keeps every block zero-gap: block volume equals one carton volume times nx * ny * nz', () => {
    const blocks = generateBlockCandidates(cargo({ quantity: 20, canRotate: false }), container())

    expect(blocks.length).toBeGreaterThan(0)
    for (const block of blocks) {
      expect(block.volume).toBe(block.box.length * block.box.width * block.box.height * block.nx * block.ny * block.nz)
      expect(block.volume).toBe(cargo().length * cargo().width * cargo().height * block.count)
    }
  })
})
