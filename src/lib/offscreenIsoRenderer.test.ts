import { describe, expect, it } from 'vitest'
import { renderIsoSnapshot } from './offscreenIsoRenderer'

describe('renderIsoSnapshot', () => {
  it('exports a callable browser iso snapshot renderer', () => {
    expect(typeof renderIsoSnapshot).toBe('function')
  })
})
