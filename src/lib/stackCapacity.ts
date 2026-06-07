import type { CargoItem, PlacedBox } from '../types'

export type StackCapacityCarrier = Pick<CargoItem, 'maxStackLayers' | 'groundOnly'> & { stackable?: boolean }

export type StackChainNode = Pick<PlacedBox, 'id' | 'stackable' | 'maxStackLayers' | 'groundOnly' | 'physicalLayer' | 'supportedBy'>

export type StackChainViolation =
  | {
      type: 'capacity'
      limitedBoxId: string
      stackLayer: number
      stackCapacity: number
    }
  | {
      type: 'ground-only'
      limitedBoxId: string
      stackLayer: number
      stackCapacity?: number
    }

export function stackCapacity(item: Pick<CargoItem, 'maxStackLayers'> & { stackable?: boolean }) {
  if (item.stackable === false) return 1
  return item.maxStackLayers && item.maxStackLayers > 0 ? item.maxStackLayers : Number.POSITIVE_INFINITY
}

export function violatesStackChain(
  box: StackChainNode,
  boxesById: Map<string, StackChainNode>,
): StackChainViolation | null {
  const layerMemo = new Map<string, number>()
  const stackLayerOf = (node: StackChainNode, seen = new Set<string>()): number => {
    if (node.supportedBy.length === 0) return 1
    if (layerMemo.has(node.id)) return layerMemo.get(node.id) ?? 1
    if (seen.has(node.id)) return 1
    seen.add(node.id)
    const supportLayers = node.supportedBy
      .map((supportId) => boxesById.get(supportId))
      .filter((support): support is StackChainNode => Boolean(support))
      .map((support) => stackLayerOf(support, new Set(seen)))
    const layer = supportLayers.length > 0 ? Math.max(...supportLayers) + 1 : 1
    layerMemo.set(node.id, layer)
    return layer
  }

  const boxLayer = stackLayerOf(box)
  const stack: StackChainNode[] = [box]
  const visited = new Set<string>()
  while (stack.length > 0) {
    const current = stack.pop()
    if (!current || visited.has(current.id)) continue
    visited.add(current.id)

    const currentLayer = stackLayerOf(current)
    const distanceFromCurrent = boxLayer - currentLayer + 1
    if (current.groundOnly && currentLayer > 1) {
      return {
        type: 'ground-only',
        limitedBoxId: current.id,
        stackLayer: currentLayer,
        stackCapacity: stackCapacity(current),
      }
    }

    const capacity = stackCapacity(current)
    if (distanceFromCurrent > capacity) {
      return {
        type: 'capacity',
        limitedBoxId: current.id,
        stackLayer: boxLayer,
        stackCapacity: capacity,
      }
    }

    stack.push(
      ...current.supportedBy
        .map((supportId) => boxesById.get(supportId))
        .filter((support): support is StackChainNode => Boolean(support)),
    )
  }

  return null
}
