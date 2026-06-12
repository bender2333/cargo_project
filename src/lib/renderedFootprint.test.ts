import { describe, expect, it } from 'vitest'
import { renderedFootprint } from './renderedFootprint'
import { makeManualBox } from './manualPlacement'
import type { OrientationKey, OrientationAxes } from './manualPlacement'

describe('renderedFootprint', () => {
  it('makeManualBox produces a box whose rendered extent matches stored dimensions', () => {
    const box = makeManualBox({
      id: 'm1',
      cargoId: 'c1',
      label: 'A',
      color: '#000',
      length: 1200,
      width: 800,
      height: 600,
      weight: 100,
      x: 100,
      y: 200,
      z: 0,
    })
    const fp = renderedFootprint(box)
    expect(fp.xExtent).toBeCloseTo(box.length, 1)
    expect(fp.yExtent).toBeCloseTo(box.width, 1)
    expect(fp.zExtent).toBeCloseTo(box.height, 1)
  })

  it('makeManualBox with different dimensions still self-consistent', () => {
    const box = makeManualBox({
      id: 'm2',
      cargoId: 'c2',
      label: 'B',
      color: '#111',
      length: 400,
      width: 300,
      height: 200,
      x: 50,
      y: 50,
    })
    const fp = renderedFootprint(box)
    expect(fp.xExtent).toBeCloseTo(box.length, 1)
    expect(fp.yExtent).toBeCloseTo(box.width, 1)
    expect(fp.zExtent).toBeCloseTo(box.height, 1)
  })

  it('orientationKey=LWH without orientationAxes renders consistently', () => {
    const goodBox = {
      length: 1200,
      width: 800,
      height: 600,
      orientationKey: 'LWH' as OrientationKey,
      orientationAxes: undefined as OrientationAxes | undefined,
    }
    const fp = renderedFootprint(goodBox)
    expect(fp.xExtent).toBeCloseTo(goodBox.length, 1)
    expect(fp.yExtent).toBeCloseTo(goodBox.width, 1)
    expect(fp.zExtent).toBeCloseTo(goodBox.height, 1)
  })

  it('a container-height box renders with correct z extent', () => {
    const box = makeManualBox({
      id: 'tall',
      cargoId: 'c3',
      label: 'T',
      color: '#222',
      length: 400,
      width: 300,
      height: 800,
      x: 0,
      y: 0,
    })
    const fp = renderedFootprint(box)
    expect(fp.xExtent).toBeCloseTo(box.length, 1)
    expect(fp.yExtent).toBeCloseTo(box.width, 1)
    expect(fp.zExtent).toBeCloseTo(box.height, 1)
  })

  it('box wider than long renders with correct extent', () => {
    const box = makeManualBox({
      id: 'wide',
      cargoId: 'c4',
      label: 'W',
      color: '#333',
      length: 400,
      width: 900,
      height: 300,
      x: 0,
      y: 0,
    })
    const fp = renderedFootprint(box)
    expect(fp.xExtent).toBeCloseTo(box.length, 1)
    expect(fp.yExtent).toBeCloseTo(box.width, 1)
    expect(fp.zExtent).toBeCloseTo(box.height, 1)
  })
})
