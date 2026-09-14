/**
 * Offline exact-solver entry. calculatePacking must not import this file.
 * Default production packing is heuristic search only.
 */
export function solvePackingOracle(): never {
  throw new Error('packing oracle is an offline research entry and is not on the default production path')
}
