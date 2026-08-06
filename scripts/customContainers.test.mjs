import { describe, expect, it } from 'vitest'
import { parseCustomContainerPayload } from '../server/customContainers.mjs'

const valid = {
  name: '  40HC  ',
  length: 12000,
  width: 2350,
  height: 2690,
  maxWeight: 28000,
  doorGap: 0,
  topGap: 50,
  sideGap: 20,
}

describe('custom container helpers', () => {
  it('normalizes valid custom container payloads for persistence', () => {
    expect(parseCustomContainerPayload(valid)).toEqual({
      name: '40HC',
      length: 12000,
      width: 2350,
      height: 2690,
      maxWeight: 28000,
      doorGap: 0,
      topGap: 50,
      sideGap: 20,
    })
  })

  it('rejects non-positive and non-finite required dimensions', () => {
    expect(parseCustomContainerPayload({ ...valid, length: -5000 })).toBeNull()
    expect(parseCustomContainerPayload({ ...valid, length: '1e400' })).toBeNull()
    expect(parseCustomContainerPayload({ ...valid, length: 0 })).toBeNull()
    expect(parseCustomContainerPayload({ ...valid, maxWeight: 0 })).toBeNull()
  })

  it('truncates oversized names and rejects empty names', () => {
    const longName = 'N'.repeat(200)
    expect(parseCustomContainerPayload({ ...valid, name: longName })).toEqual(
      expect.objectContaining({ name: 'N'.repeat(120) }),
    )
    expect(parseCustomContainerPayload({ ...valid, name: '   ' })).toBeNull()
  })

  it('rejects non-finite gap values', () => {
    expect(parseCustomContainerPayload({ ...valid, doorGap: '1e400' })).toBeNull()
    expect(parseCustomContainerPayload({ ...valid, topGap: -1 })).toBeNull()
  })
})
