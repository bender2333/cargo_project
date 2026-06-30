import { describe, expect, it } from 'vitest'
import { parseCustomCargoPayload, serializeCustomCargo } from '../server/customCargo.mjs'

describe('custom cargo helpers', () => {
  it('normalizes valid custom cargo payloads for persistence', () => {
    expect(parseCustomCargoPayload({
      name: '  Heavy crate  ',
      label: ' hc ',
      length: '1200',
      width: 800,
      height: 600,
      weight: 42,
      color: '#f97316',
      canRotate: false,
      stackable: true,
      maxStackLayers: '3',
    })).toEqual({
      name: 'Heavy crate',
      label: 'HC',
      length: 1200,
      width: 800,
      height: 600,
      weight: 42,
      color: '#f97316',
      canRotate: false,
      stackable: true,
      maxStackLayers: 3,
      groundOnly: false,
      loadingPriority: 'normal',
    })
  })

  it('rejects missing or non-positive required cargo fields', () => {
    expect(parseCustomCargoPayload({ name: '', length: 100, width: 100, height: 100, weight: 1 })).toBeNull()
    expect(parseCustomCargoPayload({ name: 'Bad', length: 0, width: 100, height: 100, weight: 1 })).toBeNull()
    expect(parseCustomCargoPayload({ name: 'Bad', length: 100, width: 100, height: 100, weight: -1 })).toBeNull()
  })

  it('serializes database rows into CargoItem-compatible objects', () => {
    expect(serializeCustomCargo({
      id: 'row-1',
      name: 'Heavy crate',
      label: 'HC',
      length: 1200,
      width: 800,
      height: 600,
      weight: 42,
      color: '#f97316',
      can_rotate: 0,
      stackable: 1,
      max_stack_layers: 3,
      ground_only: 1,
      loading_priority: 'first',
      created_at: '2026-06-06T00:00:00.000Z',
    })).toEqual({
      id: 'row-1',
      name: 'Heavy crate',
      label: 'HC',
      length: 1200,
      width: 800,
      height: 600,
      weight: 42,
      quantity: 1,
      color: '#f97316',
      canRotate: false,
      stackable: true,
      maxStackLayers: 3,
      groundOnly: true,
      loadingPriority: 'first',
      createdAt: '2026-06-06T00:00:00.000Z',
    })
  })
})
