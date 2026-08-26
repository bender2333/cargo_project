import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { solvePackingOracle } from './packingOracle'

describe('packing oracle entry', () => {
  it('is not on the default production path and does not silently solve', () => {
    const packingSource = readFileSync(resolve('src/lib/packing.ts'), 'utf8')
    expect(packingSource).not.toMatch(/packingOracle/)
    expect(packingSource).not.toMatch(/solvePackingOracle/)
    expect(() => solvePackingOracle()).toThrow(/offline research entry/)
  })
})
