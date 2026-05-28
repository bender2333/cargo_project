import { describe, expect, it, vi } from 'vitest'
import { fireEvent } from '@testing-library/react'
import { render } from '@testing-library/react'
import { ManualPlacement2D } from './ManualPlacement2D'
import type { ContainerSpec } from '../types'
import type { ManualDraft } from '../lib/manualPlacement'
import { DEFAULT_PLACEMENT_SETTINGS } from '../lib/placementSettings'

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
    const group = node.querySelector('[data-box-id="box-1"]')
    expect(group?.getAttribute('data-orientation')).toBe('LWH')
    expect(group?.getAttribute('data-label-rotation')).toBe('0')
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

describe('ManualPlacement2D placement settings', () => {
  it('applies the same top-view grid snap settings when moving a box in 2D', () => {
    const onMoveBox = vi.fn()
    const { container: dom } = render(
      <ManualPlacement2D
        container={container}
        draft={draft}
        issues={[]}
        onDropFromPool={() => {}}
        onMoveBox={onMoveBox}
        onSelectBox={() => {}}
        placementSettings={{
          ...DEFAULT_PLACEMENT_SETTINGS,
          gridSnapEnabled: true,
          gridStepMm: 25,
          edgeSnapEnabled: false,
        }}
        selectedBoxId={null}
        viewMode="top"
      />,
    )
    const node = dom.querySelector('[data-testid="manual-placement-2d"]') as SVGSVGElement | null
    if (!node) throw new Error('svg missing')
    let pointReadCount = 0
    node.createSVGPoint = () => ({
      x: 0,
      y: 0,
      matrixTransform: () => {
        pointReadCount += 1
        return pointReadCount === 1
          ? { x: 151, y: padding + container.width - 276 }
          : { x: 174, y: padding + container.width - 352 }
      },
    } as unknown as DOMPoint)
    node.getScreenCTM = () => ({ inverse: () => ({}) }) as unknown as DOMMatrix
    const box = node.querySelector('[data-box-id="box-1"]') as SVGGElement | null
    if (!box) throw new Error('box missing')

    fireEvent.pointerDown(box, { pointerId: 1, clientX: 0, clientY: 0, button: 0 })
    fireEvent.pointerMove(node, { pointerId: 1, clientX: 0, clientY: 0 })

    expect(onMoveBox).toHaveBeenLastCalledWith('box-1', 125, 275)
  })
})
