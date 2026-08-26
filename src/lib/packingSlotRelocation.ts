import { initEMS, splitEMS } from './emsSpace'
import { generateBlockCandidates, selectBlockCandidate } from './packingCandidates'
import { canStageBlock } from './packingFeasibility'
import { comparePackingQuality, packingQualityOf, type PackingObjective } from './packingObjective'
import type { PackingSearchHooks } from './packingSearch'
import { clonePackingSearchState, type PackingSearchState } from './packingSearchState'

const VOXEL = 50
const EPSILON = 0.001

export type SlotRelocationBudget = {
  seed: number
  maxRounds: number
  maxMs: number
}

export type SlotRelocationResult = {
  state: PackingSearchState
  improved: boolean
  rounds: number
  budgetExceeded: boolean
}

function rebuildEms(state: PackingSearchState) {
  let emsList = initEMS(state.container)
  for (const box of state.placed) {
    emsList = splitEMS(emsList, {
      x: box.x,
      y: box.y,
      z: box.z,
      length: box.length,
      width: box.width,
      height: box.height,
    })
  }
  return emsList
}

function largestInterCargoGap(state: PackingSearchState) {
  const { container, placed } = state
  if (placed.length === 0) return undefined

  const nx = Math.ceil(container.length / VOXEL)
  const ny = Math.ceil(container.width / VOXEL)
  const nz = Math.ceil(container.height / VOXEL)
  const occupied = new Uint8Array(nx * ny * nz)
  const index = (x: number, y: number, z: number) => (x * ny + y) * nz + z

  for (const box of placed) {
    const x0 = Math.max(0, Math.floor(box.x / VOXEL))
    const x1 = Math.min(nx, Math.ceil((box.x + box.length) / VOXEL))
    const y0 = Math.max(0, Math.floor(box.y / VOXEL))
    const y1 = Math.min(ny, Math.ceil((box.y + box.width) / VOXEL))
    const z0 = Math.max(0, Math.floor(box.z / VOXEL))
    const z1 = Math.min(nz, Math.ceil((box.z + box.height) / VOXEL))
    for (let x = x0; x < x1; x += 1) {
      for (let y = y0; y < y1; y += 1) {
        for (let z = z0; z < z1; z += 1) occupied[index(x, y, z)] = 1
      }
    }
  }

  let best: { mm: number; axis: 'x' | 'y'; x0: number; x1: number; y0: number; y1: number; z: number } | undefined
  const note = (mm: number, axis: 'x' | 'y', x0: number, x1: number, y0: number, y1: number, z: number) => {
    if (best && mm <= best.mm) return
    best = { mm, axis, x0, x1, y0, y1, z }
  }

  for (let z = 0; z < Math.max(0, nz - 1); z += 1) {
    for (let x = 0; x < nx; x += 1) {
      let y = 0
      while (y < ny) {
        if (occupied[index(x, y, z)]) {
          y += 1
          continue
        }
        const start = y
        while (y < ny && !occupied[index(x, y, z)]) y += 1
        if (start > 0 && y < ny && occupied[index(x, start - 1, z)] && occupied[index(x, y, z)]) {
          note((y - start) * VOXEL, 'y', x, x + 1, start, y, z)
        }
      }
    }
    for (let y = 0; y < ny; y += 1) {
      let x = 0
      while (x < nx) {
        if (occupied[index(x, y, z)]) {
          x += 1
          continue
        }
        const start = x
        while (x < nx && !occupied[index(x, y, z)]) x += 1
        if (start > 0 && x < nx && occupied[index(start - 1, y, z)] && occupied[index(x, y, z)]) {
          note((x - start) * VOXEL, 'x', start, x, y, y + 1, z)
        }
      }
    }
  }
  if (!best) return undefined

  const minX = best.x0 * VOXEL
  const maxX = best.x1 * VOXEL
  const minY = best.y0 * VOXEL
  const maxY = best.y1 * VOXEL
  const minZ = best.z * VOXEL
  const maxZ = (best.z + 1) * VOXEL
  const touchesBoundary = minX <= EPSILON
    || minY <= EPSILON
    || minZ <= EPSILON
    || maxX >= container.length - EPSILON
    || maxY >= container.width - EPSILON
    || maxZ >= container.height - EPSILON
  return { ...best, minX, maxX, minY, maxY, minZ, maxZ, touchesBoundary }
}

function restoreRemoved(state: PackingSearchState, removedIds: Set<string>) {
  const next = clonePackingSearchState(state)
  const removed = next.placed.filter((box) => removedIds.has(box.id))
  next.placed = next.placed.filter((box) => !removedIds.has(box.id))
  next.placedById = new Map(next.placed.map((box) => [box.id, box]))
  for (const box of removed) {
    const cargo = next.cargoStates.find((entry) => entry.item.id === box.cargoId)
    if (!cargo) continue
    cargo.remaining += 1
    next.usedWeight = Math.max(0, next.usedWeight - box.weight)
  }
  next.emsList = rebuildEms(next)
  return next
}

function refill(state: PackingSearchState, hooks: PackingSearchHooks, objective: PackingObjective, deadline: number) {
  let current = clonePackingSearchState(state)
  const rejected = new Set<string>()
  while (current.cargoStates.some((cargo) => cargo.remaining > 0)) {
    if (Date.now() >= deadline) return { state: current, budgetExceeded: true }
    const generated = generateBlockCandidates(current, objective)
      .filter((choice) => !rejected.has([
        choice.cargoId,
        choice.block.orientationKey,
        choice.block.nx,
        choice.block.ny,
        choice.block.nz,
        choice.point.x,
        choice.point.y,
        choice.point.z,
      ].join(':')))
    const choice = selectBlockCandidate(generated, objective, current)
    if (!choice) break
    const key = [
      choice.cargoId,
      choice.block.orientationKey,
      choice.block.nx,
      choice.block.ny,
      choice.block.nz,
      choice.point.x,
      choice.point.y,
      choice.point.z,
    ].join(':')
    if (!canStageBlock(current, choice)) {
      rejected.add(key)
      if (rejected.size > 64) break
      continue
    }
    current = hooks.commit(clonePackingSearchState(current), choice)
    rejected.clear()
  }
  return { state: hooks.complete(clonePackingSearchState(current)), budgetExceeded: Date.now() >= deadline }
}

/**
 * Bounded local re-placement around the largest inter-cargo gap.
 * Not called from calculatePacking. Quantity must not drop.
 */
export function relocateLargestBoundarySlot(
  complete: PackingSearchState,
  hooks: PackingSearchHooks,
  objective: PackingObjective,
  budget: SlotRelocationBudget = { seed: 1, maxRounds: 1, maxMs: 250 },
): SlotRelocationResult {
  const startedAt = Date.now()
  let current = clonePackingSearchState(complete)
  let improved = false
  let rounds = 0
  let budgetExceeded = false
  const maxRounds = Math.max(0, budget.maxRounds)

  while (rounds < maxRounds) {
    if (Date.now() - startedAt >= budget.maxMs) {
      budgetExceeded = true
      break
    }
    rounds += 1
    const gap = largestInterCargoGap(current)
    if (!gap || !gap.touchesBoundary) break

    const doorSide = current.placed.filter((box) => {
      if (gap.axis === 'x') return box.x + box.length > gap.maxX - EPSILON && box.z < gap.maxZ + EPSILON && box.z + box.height > gap.minZ - EPSILON
      return box.y + box.width > gap.maxY - EPSILON && box.z < gap.maxZ + EPSILON && box.z + box.height > gap.minZ - EPSILON
    })
    if (doorSide.length === 0) break

    const opened = restoreRemoved(current, new Set(doorSide.map((box) => box.id)))
    const filled = refill(opened, hooks, objective, startedAt + budget.maxMs)
    budgetExceeded = budgetExceeded || filled.budgetExceeded
    const before = packingQualityOf(current)
    const after = packingQualityOf(filled.state)
    if (objective === 'quantity' && after.placedCount < before.placedCount) continue
    if (comparePackingQuality(after, before, objective) < 0) {
      current = filled.state
      improved = true
    }
  }

  return { state: current, improved, rounds, budgetExceeded }
}
