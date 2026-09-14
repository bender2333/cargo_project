export type SpatialAabb = {
  minX: number
  minY: number
  minZ: number
  maxX: number
  maxY: number
  maxZ: number
}

type SpatialEntry<T> = {
  id: string
  aabb: SpatialAabb
  payload: T
}

const EPSILON = 0.001

/** Uniform spatial index used only to narrow placed-box candidate queries. */
export class SpatialGrid<T> {
  #cells = new Map<string, SpatialEntry<T>[]>()
  #count = 0
  #bounds: SpatialAabb
  #cellSize: number

  constructor(bounds: SpatialAabb, cellSize: number) {
    this.#bounds = bounds
    this.#cellSize = cellSize
  }

  insert(id: string, aabb: SpatialAabb, payload: T): void {
    this.#count += 1
    const entry = { id, aabb, payload }
    for (const key of this.#cellKeys(aabb)) {
      const entries = this.#cells.get(key)
      if (entries) entries.push(entry)
      else this.#cells.set(key, [entry])
    }
  }

  query(aabb: SpatialAabb): T[] {
    const expanded = expand(aabb)
    const seen = new Set<string>()
    const result: T[] = []
    for (const key of this.#cellKeys(expanded)) {
      for (const entry of this.#cells.get(key) ?? []) {
        if (seen.has(entry.id) || !intersects(expanded, entry.aabb)) continue
        seen.add(entry.id)
        result.push(entry.payload)
      }
    }
    return result
  }

  #cellKeys(aabb: SpatialAabb): string[] {
    const minX = this.#cell(aabb.minX, this.#bounds.minX)
    const minY = this.#cell(aabb.minY, this.#bounds.minY)
    const minZ = this.#cell(aabb.minZ, this.#bounds.minZ)
    const maxX = this.#cell(aabb.maxX, this.#bounds.minX)
    const maxY = this.#cell(aabb.maxY, this.#bounds.minY)
    const maxZ = this.#cell(aabb.maxZ, this.#bounds.minZ)
    const keys: string[] = []
    for (let x = minX; x <= maxX; x += 1) {
      for (let y = minY; y <= maxY; y += 1) {
        for (let z = minZ; z <= maxZ; z += 1) keys.push(`${x}:${y}:${z}`)
      }
    }
    return keys
  }

  #cell(value: number, origin: number) {
    return Math.floor((value - origin) / this.#cellSize)
  }

  get count() {
    return this.#count
  }
}

function expand(aabb: SpatialAabb): SpatialAabb {
  return {
    minX: aabb.minX - EPSILON,
    minY: aabb.minY - EPSILON,
    minZ: aabb.minZ - EPSILON,
    maxX: aabb.maxX + EPSILON,
    maxY: aabb.maxY + EPSILON,
    maxZ: aabb.maxZ + EPSILON,
  }
}

function intersects(a: SpatialAabb, b: SpatialAabb) {
  return !(
    a.maxX < b.minX || b.maxX < a.minX ||
    a.maxY < b.minY || b.maxY < a.minY ||
    a.maxZ < b.minZ || b.maxZ < a.minZ
  )
}
