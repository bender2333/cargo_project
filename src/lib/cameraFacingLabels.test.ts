import { describe, expect, it } from 'vitest'
import { cameraFacingLabelFaces, cameraDirectionForViewMode, dominantAxisFace, fixedLabelFacesForViewMode } from './cameraFacingLabels'

describe('camera-facing 3D label faces', () => {
  it('selects only the local box faces whose outward normals face the camera', () => {
    expect(cameraFacingLabelFaces({ x: 1, y: 0, z: 0 })).toEqual(['+X'])
    expect(cameraFacingLabelFaces({ x: -1, y: 0, z: 0 })).toEqual(['-X'])
    expect(cameraFacingLabelFaces({ x: 0, y: 0, z: 1 })).toEqual(['+Z'])
  })

  it('keeps iso labels on the two strongest side faces and avoids the top face', () => {
    const faces = cameraFacingLabelFaces(cameraDirectionForViewMode('iso'))

    expect(faces).toHaveLength(2)
    expect(faces).toEqual(expect.arrayContaining(['+X', '+Z']))
    expect(faces).not.toContain('+Y')
  })

  it('uses fixed visible faces for orthographic camera modes', () => {
    expect(fixedLabelFacesForViewMode('top')).toEqual(['+Y'])
    expect(fixedLabelFacesForViewMode('front')).toEqual(['+Z'])
    expect(fixedLabelFacesForViewMode('side')).toEqual(['+X'])
    expect(fixedLabelFacesForViewMode('iso')).toBeNull()
  })

  it('locks near-axis iso camera directions to one stable face', () => {
    expect(dominantAxisFace({ x: 0.1, y: 0.95, z: 0.1 })).toBe('+Y')
    expect(dominantAxisFace({ x: 0, y: 0.1, z: 0.95 })).toBe('+Z')
    expect(dominantAxisFace({ x: 0.95, y: 0.1, z: 0.1 })).toBe('+X')
    expect(dominantAxisFace({ x: 0.72, y: 0.48, z: 0.82 })).toBeNull()
  })
})
