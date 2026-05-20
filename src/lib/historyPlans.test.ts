import { describe, expect, it } from 'vitest'
import type { CargoItem, ContainerSpec, PackingResult } from '../types'
import { calculatePacking } from './packing'
import { createHistoryPlan, readHistoryPlans, saveHistoryPlan } from './historyPlans'

function storage(initial?: string) {
  let value = initial ?? ''
  return {
    getItem: () => value || null,
    setItem: (_key: string, next: string) => {
      value = next
    },
  }
}

const cargoItem: CargoItem = {
  id: 'cargo-1',
  name: 'History crate',
  label: 'H',
  length: 1000,
  width: 800,
  height: 600,
  weight: 42,
  quantity: 2,
  color: '#0ea5e9',
  canRotate: true,
  stackable: true,
}

const container: ContainerSpec = {
  id: 'container',
  label: 'Container',
  description: 'Test',
  length: 3000,
  width: 2000,
  height: 2000,
  maxWeight: 5000,
  doorGap: 100,
  topGap: 50,
  sideGap: 25,
}

function result(): PackingResult {
  return calculatePacking(container, [cargoItem])
}

describe('history plans', () => {
  it('creates a restorable snapshot with cargo labels and result summary', () => {
    const plan = createHistoryPlan(container, [cargoItem], result(), {
      createId: () => 'plan-1',
      now: () => new Date('2026-05-20T00:00:00.000Z'),
      shipmentName: 'Review shipment',
      projectName: 'Test Project',
      loadingMode: 'weight',
    })

    expect(plan).toMatchObject({
      id: 'plan-1',
      createdAt: '2026-05-20T00:00:00.000Z',
      projectName: 'Test Project',
      shipmentName: 'Review shipment',
      containerId: 'container',
      container,
      placedCount: 2,
      totalCargoCount: 2,
      layerCount: 1,
      labelSummary: 'H:2/2',
      loadingMode: 'weight',
    })
    expect(plan.cargoItems[0]).toMatchObject({ label: 'H', name: 'History crate' })
  })

  it('migrates old stored plans without a shipment name to a visible fallback', () => {
    const oldPlan = createHistoryPlan(container, [cargoItem], result(), { createId: () => 'old' })
    const storedPlan = { ...oldPlan, shipmentName: undefined }
    const store = storage(JSON.stringify([storedPlan]))

    expect(readHistoryPlans(store)[0].shipmentName).toBe('Untitled shipment')
  })

  it('stores newest plans first and ignores invalid stored data', () => {
    const store = storage('not-json')
    expect(readHistoryPlans(store)).toEqual([])

    const first = createHistoryPlan(container, [cargoItem], result(), { createId: () => 'first' })
    const second = createHistoryPlan(container, [cargoItem], result(), { createId: () => 'second' })

    saveHistoryPlan(store, first)
    expect(saveHistoryPlan(store, second).map((plan) => plan.id)).toEqual(['second', 'first'])
    expect(readHistoryPlans(store).map((plan) => plan.id)).toEqual(['second', 'first'])
  })
})
