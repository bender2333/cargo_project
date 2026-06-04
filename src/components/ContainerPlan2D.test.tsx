import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { ContainerSpec, PlacedBox } from '../types'
import { ContainerPlan2D } from './ContainerPlan2D'

const container: ContainerSpec = {
  id: '20gp',
  label: "Container 20'",
  description: '',
  length: 5758,
  width: 2352,
  height: 2385,
  maxWeight: 28_000,
  doorGap: 0,
  topGap: 0,
  sideGap: 0,
}

const box = (overrides: Partial<PlacedBox>): PlacedBox => ({
  id: 'box-1',
  cargoId: 'cargo-1',
  name: 'Cargo',
  label: 'A',
  index: 1,
  x: 0,
  y: 0,
  z: 0,
  length: 400,
  width: 500,
  height: 600,
  orientationKey: 'LWH',
  labelRotationDeg: 0,
  weight: 1,
  color: '#f97316',
  stackable: true,
  physicalLayer: 1,
  workStep: 1,
  supportType: 'floor',
  supportedBy: [],
  ...overrides,
})

describe('ContainerPlan2D label deconfliction', () => {
  it('downgrades covered all-layer labels but keeps the top projected label readable', () => {
    const boxes = [
      box({ id: 'box-a', label: 'A', z: 0, physicalLayer: 1 }),
      box({ id: 'box-q', label: 'Q', z: 1800, physicalLayer: 4, color: '#2563eb' }),
    ]

    const { container: dom } = render(
      <ContainerPlan2D
        activeLabelId="all"
        activeLayerId="all"
        boxes={boxes}
        container={container}
        mode="top"
      />,
    )

    expect(dom.querySelector('[data-box-id="box-a"]')?.getAttribute('data-label-mode')).toBe('compact')
    expect(dom.querySelector('[data-box-id="box-q"]')?.getAttribute('data-label-mode')).toBe('full')
  })

  it('keeps selected or layer-filtered labels full even when their projection is covered', () => {
    const boxes = [
      box({ id: 'box-a', label: 'A', z: 0, physicalLayer: 1 }),
      box({ id: 'box-q', label: 'Q', z: 1800, physicalLayer: 4, color: '#2563eb' }),
    ]

    const selected = render(
      <ContainerPlan2D
        activeLabelId="all"
        activeLayerId="all"
        boxes={boxes}
        container={container}
        mode="top"
        selectedBoxId="box-a"
      />,
    )
    expect(selected.container.querySelector('[data-box-id="box-a"]')?.getAttribute('data-label-mode')).toBe('full')

    const layerFiltered = render(
      <ContainerPlan2D
        activeLabelId="all"
        activeLayerId="1"
        boxes={boxes}
        container={container}
        mode="top"
      />,
    )
    expect(layerFiltered.container.querySelector('[data-box-id="box-a"]')?.getAttribute('data-label-mode')).toBe('full')
  })
})
