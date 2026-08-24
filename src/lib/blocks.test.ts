import { describe, expect, it } from 'vitest'
import type { CargoItem, ContainerSpec } from '../types'
import { bestBlocksForSpace, generateBlockCandidates, maxBlocksForSpace } from './blocks'

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

describe('bestBlocksForSpace', () => {
  it('fills a narrow residual strip with a long one-row block instead of dropping to a single leftover carton', () => {
    const strip = { length: 5758, width: 312, height: 2385 }
    const item = cargo({ length: 350, width: 250, height: 360, quantity: 207 })
    const blocks = bestBlocksForSpace(item, 207, strip)
    const best = [...blocks].sort((a, b) => b.count - a.count || b.footprintArea - a.footprintArea)[0]

    expect(best).toBeDefined()
    expect(best.width).toBeLessThanOrEqual(strip.width)
    expect(best.length).toBeGreaterThanOrEqual(350 * 10)
    expect(best.count).toBeGreaterThanOrEqual(90)
  })

  it('keeps a bounded same-orientation frontier that changes EMS shape, not only the max-count block', () => {
    const space = { length: 5758, width: 2000, height: 360 }
    const item = cargo({ length: 530, width: 305, height: 360, quantity: 56, canRotate: true })
    const blocks = bestBlocksForSpace(item, 56, space)
    const catalog = generateBlockCandidates(item, space)

    const wlhMax = blocks.find((block) => block.orientationKey === 'WLH' && block.nx === 18 && block.ny === 3 && block.nz === 1)
    const wlhFewerRows = blocks.find((block) => block.orientationKey === 'WLH' && block.ny === 2 && block.nz === 1)
    const wlhFewerCols = blocks.find((block) => block.orientationKey === 'WLH' && block.nx === 17 && block.ny === 3 && block.nz === 1)
    const lwhWide = blocks.find((block) => block.orientationKey === 'LWH' && block.nx === 9 && block.ny === 6 && block.nz === 1)

    expect(wlhMax, 'primary max-count WLH 18x3 must stay').toMatchObject({ count: 54, length: 5490, width: 1590 })
    expect(lwhWide, 'same-count wider LWH 9x6 must stay available').toMatchObject({ count: 54, length: 4770, width: 1830 })
    expect(wlhFewerRows, 'ny-1 candidate must change the leftover width').toBeDefined()
    expect(wlhFewerCols, 'nx-1 candidate must change the leftover length').toBeDefined()
    expect(blocks.length).toBeGreaterThan(6)
    expect(blocks.length).toBeLessThanOrEqual(32)
    expect(blocks.length).toBeLessThan(catalog.length)
    const keys = blocks.map((block) => `${block.orientationKey}:${block.nx}x${block.ny}x${block.nz}`)
    expect(new Set(keys).size).toBe(keys.length)

    const primaries = maxBlocksForSpace(item, 56, space)
    expect(primaries.every((block) => blocks.some((candidate) => (
      candidate.orientationKey === block.orientationKey
      && candidate.nx === block.nx
      && candidate.ny === block.ny
      && candidate.nz === block.nz
    )))).toBe(true)
    expect(primaries.length).toBeLessThan(blocks.length)
  })
})
