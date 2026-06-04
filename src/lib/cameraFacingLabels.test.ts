import { describe, expect, it } from 'vitest'
import { cameraFacingLabelFaces, cameraDirectionForViewMode } from './cameraFacingLabels'

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
})
