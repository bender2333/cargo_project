/**
 * Pure-function unit tests for ContainerScene rendering helpers.
 *
 * These functions live in ContainerScene.tsx today and will be extracted to
 * rendering.ts in Phase 5 Step 1.  Writing the tests first gives us a red/green
 * gate that confirms nothing changes during the move.
 *
 * NOTE: Three.js creates a WebGL canvas via document.createElement, so tests
 * must run in a DOM environment (happy-dom / jsdom).  The vitest config already
 * uses happy-dom for component tests, so we can import THREE directly here.
 */
import { describe, it, expect } from 'vitest'
import * as THREE from 'three'

// ---------------------------------------------------------------------------
// Import the helpers directly from ContainerScene.tsx so these tests are
// immediately runnable.  After Phase 5 Step 1 the import path will change to
// './rendering' — that is the only line that will need updating.
// ---------------------------------------------------------------------------
import {
  worldCenterForBox, worldPointFromMm, boxOrientationQuaternion,
  boxGeometryForPlaced, sameBoxGeometry,
  isOutOfBounds, rectsOverlap, overlapAreaXY,
  cameraPositionForMode,
} from './rendering'
import type { PlacedBox } from '../../types'

// ---------------------------------------------------------------------------
// Minimal PlacedBox factory — only fields consumed by the tested functions
// ---------------------------------------------------------------------------
function makePlacedBox(overrides: Partial<PlacedBox> = {}): PlacedBox {
  return {
    id: 'b1',
    cargoId: 'c1',
    name: 'Test',
    label: 'A',
    index: 0,
    x: 0, y: 0, z: 0,
    length: 1000, width: 800, height: 600,
    weight: 50,
    color: '#0ea5e9',
    orientationKey: 'LWH',
    labelRotationDeg: 0,
    canRotate: true,
    stackable: true,
    physicalLayer: 1,
    workStep: 1,
    supportType: 'floor',
    supportedBy: [],
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// worldCenterForBox
// ---------------------------------------------------------------------------
describe('worldCenterForBox', () => {
  it('places box at expected world coords for scale=0.001', () => {
    const box = makePlacedBox({ x: 0, y: 0, z: 0, length: 1000, width: 800, height: 600 })
    const scale = 0.001
    const containerLength = 6000
    const containerWidth = 2400
    const v = worldCenterForBox(box, scale, containerLength * scale, containerWidth * scale)
    // x: -containerL/2 + (0 + 1000/2) * scale = -3 + 0.5 = -2.5
    expect(v.x).toBeCloseTo(-containerLength * scale / 2 + (box.x + box.length / 2) * scale, 6)
    expect(v.y).toBeCloseTo((box.z + box.height / 2) * scale, 6)
    expect(v.z).toBeCloseTo(-containerWidth * scale / 2 + (box.y + box.width / 2) * scale, 6)
  })

  it('centre x shifts when box is deeper into container', () => {
    const box1 = makePlacedBox({ x: 0 })
    const box2 = makePlacedBox({ x: 2000 })
    const scale = 0.001
    const L = 6; const W = 2.4
    const v1 = worldCenterForBox(box1, scale, L, W)
    const v2 = worldCenterForBox(box2, scale, L, W)
    expect(v2.x).toBeGreaterThan(v1.x)
  })
})

// ---------------------------------------------------------------------------
// worldPointFromMm
// ---------------------------------------------------------------------------
describe('worldPointFromMm', () => {
  it('converts mm point to Three.js world coords', () => {
    const pt = { x: 1000, y: 500, z: 300 }
    const scale = 0.001
    const L = 6; const W = 2.4
    const v = worldPointFromMm(pt, scale, L, W)
    expect(v.x).toBeCloseTo(-L / 2 + pt.x * scale, 6)
    expect(v.y).toBeCloseTo(pt.z * scale, 6)
    expect(v.z).toBeCloseTo(-W / 2 + pt.y * scale, 6)
  })
})

// ---------------------------------------------------------------------------
// boxOrientationQuaternion
// ---------------------------------------------------------------------------
describe('boxOrientationQuaternion', () => {
  it('default LWH orientation produces a valid (non-zero) quaternion', () => {
    const box = makePlacedBox({ orientationKey: 'LWH' })
    const q = boxOrientationQuaternion(box)
    expect(q).toBeInstanceOf(THREE.Quaternion)
    // Quaternion must be unit length
    const len = Math.sqrt(q.x ** 2 + q.y ** 2 + q.z ** 2 + q.w ** 2)
    expect(len).toBeCloseTo(1, 5)
  })

  it('different orientation keys produce distinct quaternions', () => {
    const qLWH = boxOrientationQuaternion(makePlacedBox({ orientationKey: 'LWH' }))
    const qWLH = boxOrientationQuaternion(makePlacedBox({ orientationKey: 'WLH' }))
    // At least one component must differ between the two orientations
    const same = Math.abs(qLWH.x - qWLH.x) < 1e-6
      && Math.abs(qLWH.y - qWLH.y) < 1e-6
      && Math.abs(qLWH.z - qWLH.z) < 1e-6
      && Math.abs(qLWH.w - qWLH.w) < 1e-6
    expect(same).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// boxGeometryForPlaced & sameBoxGeometry
// ---------------------------------------------------------------------------
describe('boxGeometryForPlaced', () => {
  it('geometry width matches box.length * scale', () => {
    const box = makePlacedBox({ length: 1200, width: 800, height: 600 })
    const scale = 0.001
    const geo = boxGeometryForPlaced(box, scale)
    expect(geo).toBeInstanceOf(THREE.BoxGeometry)
    expect(geo.parameters.width).toBeCloseTo(box.length * scale, 6)
    expect(geo.parameters.height).toBeCloseTo(box.height * scale, 6)
    expect(geo.parameters.depth).toBeCloseTo(box.width * scale, 6)
  })
})

describe('sameBoxGeometry', () => {
  it('returns true when geometry matches box dimensions and scale', () => {
    const box = makePlacedBox({ length: 1000, width: 800, height: 600 })
    const scale = 0.001
    const geo = boxGeometryForPlaced(box, scale)
    expect(sameBoxGeometry(box, geo, scale)).toBe(true)
  })

  it('returns false when length differs', () => {
    const box = makePlacedBox({ length: 1000, width: 800, height: 600 })
    const other = makePlacedBox({ length: 1200, width: 800, height: 600 })
    const scale = 0.001
    const geo = boxGeometryForPlaced(other, scale)
    expect(sameBoxGeometry(box, geo, scale)).toBe(false)
  })

  it('returns false for non-BoxGeometry', () => {
    const box = makePlacedBox()
    expect(sameBoxGeometry(box, new THREE.SphereGeometry(1), 0.001)).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// isOutOfBounds
// ---------------------------------------------------------------------------
describe('isOutOfBounds', () => {
  const container = { length: 6000, width: 2400 }

  it('returns false for a box fully inside', () => {
    expect(isOutOfBounds(100, 100, 500, 400, container)).toBe(false)
  })

  it('returns false for a box that exactly fills the container', () => {
    expect(isOutOfBounds(0, 0, 6000, 2400, container)).toBe(false)
  })

  it('returns true when x is negative beyond epsilon', () => {
    expect(isOutOfBounds(-1, 0, 500, 400, container)).toBe(true)
  })

  it('returns true when box extends beyond container.length', () => {
    expect(isOutOfBounds(5600, 0, 500, 400, container)).toBe(true) // 5600+500 > 6000
  })

  it('returns false for a very small negative value within default epsilon', () => {
    expect(isOutOfBounds(-0.005, 0, 500, 400, container)).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// rectsOverlap
// ---------------------------------------------------------------------------
describe('rectsOverlap', () => {
  it('returns false when rects do not touch', () => {
    // A: [0..100] x [0..100], B: [200..300] x [200..300]
    expect(rectsOverlap(0, 0, 100, 100, 200, 200, 100, 100)).toBe(false)
  })

  it('returns false when rects share only an edge (within epsilon)', () => {
    // A right edge at x=100, B left edge at x=100 → gap=0 ≤ epsilon(0.01)
    expect(rectsOverlap(0, 0, 100, 100, 100, 0, 100, 100)).toBe(false)
  })

  it('returns true when rects clearly overlap', () => {
    // A: [0..100] x [0..100], B: [50..150] x [50..150]
    expect(rectsOverlap(0, 0, 100, 100, 50, 50, 100, 100)).toBe(true)
  })

  it('returns true for identical rects', () => {
    expect(rectsOverlap(10, 20, 80, 60, 10, 20, 80, 60)).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// overlapAreaXY
// ---------------------------------------------------------------------------
describe('overlapAreaXY', () => {
  it('returns 0 for non-overlapping rects', () => {
    expect(overlapAreaXY(0, 0, 100, 100, 200, 200, 100, 100)).toBe(0)
  })

  it('returns full area of smaller rect when one contains the other', () => {
    // B [10..50]x[10..50] fully inside A [0..100]x[0..100]
    const area = overlapAreaXY(0, 0, 100, 100, 10, 10, 40, 40)
    expect(area).toBeCloseTo(40 * 40, 6)
  })

  it('returns correct partial overlap', () => {
    // A [0..100]x[0..100], B [50..150]x[50..150] → overlap [50..100]x[50..100] = 50*50
    const area = overlapAreaXY(0, 0, 100, 100, 50, 50, 100, 100)
    expect(area).toBeCloseTo(50 * 50, 6)
  })

  it('returns 0 for touching edges', () => {
    // A right=100, B left=100
    expect(overlapAreaXY(0, 0, 100, 100, 100, 0, 100, 100)).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// cameraPositionForMode
// ---------------------------------------------------------------------------
describe('cameraPositionForMode', () => {
  const L = 6; const W = 2.4; const H = 2.6

  it('iso mode returns a position with non-zero x, y, z', () => {
    const v = cameraPositionForMode('iso', L, W, H)
    expect(v.x).toBeGreaterThan(0)
    expect(v.y).toBeGreaterThan(0)
    expect(v.z).toBeGreaterThan(0)
  })

  it('top mode has z ≈ 0.01 (near-zero) to avoid gimbal lock', () => {
    const v = cameraPositionForMode('top', L, W, H)
    expect(Math.abs(v.z)).toBeCloseTo(0.01, 3)
    expect(v.y).toBeGreaterThan(0)
  })

  it('front mode has positive z, near-zero x', () => {
    const v = cameraPositionForMode('front', L, W, H)
    expect(v.z).toBeGreaterThan(0)
    expect(v.x).toBe(0)
  })

  it('side mode has positive x, near-zero z', () => {
    const v = cameraPositionForMode('side', L, W, H)
    expect(v.x).toBeGreaterThan(0)
    expect(v.z).toBe(0)
  })

  it('all four modes return distinct positions', () => {
    const positions = (['iso', 'top', 'front', 'side'] as const).map(m =>
      cameraPositionForMode(m, L, W, H)
    )
    for (let i = 0; i < positions.length; i++) {
      for (let j = i + 1; j < positions.length; j++) {
        const same = positions[i].distanceTo(positions[j]) < 0.001
        expect(same).toBe(false)
      }
    }
  })
})
