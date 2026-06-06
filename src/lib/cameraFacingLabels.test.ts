import { describe, expect, it } from 'vitest'
import { allLabelFaces } from './cameraFacingLabels'

describe('all-direction 3D label faces', () => {
  it('keeps labels on every exposed box face instead of selecting by camera angle', () => {
    expect(allLabelFaces()).toEqual(['+X', '-X', '+Y', '+Z', '-Z'])
  })
})
