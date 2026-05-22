import { describe, expect, it } from 'vitest'
import { render } from '@testing-library/react'
import { ManualPlacement2D } from './ManualPlacement2D'
import type { ContainerSpec } from '../types'
import type { ManualDraft } from '../lib/manualPlacement'

const container: ContainerSpec = {
  id: 'test',
  label: 'Test container',
  description: '',
  length: 2000,
  width: 1000,
  height: 1200,
  maxWeight: 10_000,
  doorGap: 0,
  topGap: 0,
  sideGap: 0,
}

const draft: ManualDraft = {
  boxes: [
    {
      id: 'box-1',
      cargoId: 'cargo-1',
      label: 'A',
      color: '#abcdef',
      x: 100,
      y: 200,
      z: 0,
      length: 400,
      width: 300,
      height: 500,
      orientationKey: 'LWH',
      labelRotationDeg: 0,
    },
  ],
}

const padding = 28

function svg(view: 'top' | 'front' | 'side') {
  const { container: dom } = render(
    <ManualPlacement2D
      container={container}
      draft={draft}
      issues={[]}
      onDropFromPool={() => {}}
      onMoveBox={() => {}}
      onSelectBox={() => {}}
      selectedBoxId={null}
      viewMode={view}
    />,
  )
  const element = dom.querySelector('[data-testid="manual-placement-2d"]')
  if (!element) throw new Error('svg missing')
  return element as SVGSVGElement
}

describe('ManualPlacement2D viewMode projection', () => {
  it('top view uses length × width and box rect equals length × width', () => {
    const node = svg('top')
    expect(node.getAttribute('viewBox')).toBe(`0 0 ${container.length + padding * 2} ${container.width + padding * 2}`)
    expect(node.getAttribute('data-view-mode')).toBe('top')
    const rect = node.querySelector('[data-box-id="box-1"] rect[aria-label="A manual placement"]')
    expect(rect?.getAttribute('width')).toBe('400')
    expect(rect?.getAttribute('height')).toBe('300')
  })

  it('front view uses length × height and box rect equals length × height', () => {
    const node = svg('front')
    expect(node.getAttribute('viewBox')).toBe(`0 0 ${container.length + padding * 2} ${container.height + padding * 2}`)
    expect(node.getAttribute('data-view-mode')).toBe('front')
    const rect = node.querySelector('[data-box-id="box-1"] rect[aria-label="A manual placement"]')
    expect(rect?.getAttribute('width')).toBe('400')
    expect(rect?.getAttribute('height')).toBe('500')
  })

  it('side view uses width × height and box rect equals width × height', () => {
    const node = svg('side')
    expect(node.getAttribute('viewBox')).toBe(`0 0 ${container.width + padding * 2} ${container.height + padding * 2}`)
    expect(node.getAttribute('data-view-mode')).toBe('side')
    const rect = node.querySelector('[data-box-id="box-1"] rect[aria-label="A manual placement"]')
    expect(rect?.getAttribute('width')).toBe('300')
    expect(rect?.getAttribute('height')).toBe('500')
  })
})
