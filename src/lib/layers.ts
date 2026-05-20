import type { PackingLayer, PlacedBox } from '../types'

export function assignDepthLayers(placed: PlacedBox[]): PlacedBox[] {
  const EPSILON = 0.001
  // 按照 x 坐标升序排序（从里到外）
  const sorted = [...placed].sort((a, b) => a.x - b.x)
  
  sorted.forEach((box) => {
    if (box.x <= EPSILON) {
      box.physicalLayer = 1
      box.supportedBy = []
      box.supportType = 'floor'
    } else {
      // 寻找在 X 轴方向紧贴在 box 后方（更靠里）的箱子
      // 也就是候选 candidate 的 x + length 大致等于 box.x
      // 且在 Y 轴和 Z 轴上有投影重叠
      const pushers = sorted.filter((candidate) => {
        if (candidate.id === box.id) return false
        const touchX = Math.abs(candidate.x + candidate.length - box.x) <= 10.0 // 允许 10mm 装载缝隙
        if (!touchX) return false
        
        // 判断 Y 轴重叠
        const overlapY = Math.max(
          0,
          Math.min(box.y + box.width, candidate.y + candidate.width) - Math.max(box.y, candidate.y)
        )
        // 判断 Z 轴重叠
        const overlapZ = Math.max(
          0,
          Math.min(box.z + box.height, candidate.z + candidate.height) - Math.max(box.z, candidate.z)
        )
        
        return overlapY > EPSILON && overlapZ > EPSILON
      })
      
      if (pushers.length > 0) {
        box.physicalLayer = Math.max(...pushers.map((p) => p.physicalLayer), 0) + 1
        box.supportedBy = pushers.map((p) => p.id)
        box.supportType = 'fully-supported'
      } else {
        // 如果没有直接接触的推靠箱子，寻找更后方投影重叠且 x+length 最大的作为虚拟推靠源
        const backboxes = sorted.filter((candidate) => {
          if (candidate.id === box.id) return false
          if (candidate.x + candidate.length > box.x) return false
          
          const overlapY = Math.max(
            0,
            Math.min(box.y + box.width, candidate.y + candidate.width) - Math.max(box.y, candidate.y)
          )
          const overlapZ = Math.max(
            0,
            Math.min(box.z + box.height, candidate.z + candidate.height) - Math.max(box.z, candidate.z)
          )
          return overlapY > EPSILON && overlapZ > EPSILON
        })
        
        if (backboxes.length > 0) {
          backboxes.sort((a, b) => (b.x + b.length) - (a.x + a.length))
          const primaryPusher = backboxes[0]
          box.physicalLayer = primaryPusher.physicalLayer + 1
          box.supportedBy = [primaryPusher.id]
          box.supportType = 'partially-supported'
        } else {
          box.physicalLayer = 1
          box.supportedBy = []
          box.supportType = 'floor'
        }
      }
    }
  })
  
  return placed
}

export function buildPackingLayers(placed: PlacedBox[]): PackingLayer[] {
  const groups = new Map<number, PlacedBox[]>()
  placed.forEach((box) => {
    groups.set(box.physicalLayer, [...(groups.get(box.physicalLayer) ?? []), box])
  })

  return [...groups.entries()]
    .sort(([a], [b]) => a - b)
    .map(([physicalLayer, boxes]) => {
      const labelCounts = new Map<string, { label: string; color: string; count: number }>()
      boxes.forEach((box) => {
        const current = labelCounts.get(box.label)
        labelCounts.set(box.label, {
          label: box.label,
          color: box.color,
          count: (current?.count ?? 0) + 1,
        })
      })

      return {
        id: String(physicalLayer),
        physicalLayer,
        minZ: Math.min(...boxes.map((box) => box.z)),
        maxZ: Math.max(...boxes.map((box) => box.z + box.height)),
        count: boxes.length,
        weight: boxes.reduce((sum, box) => sum + box.weight, 0),
        volume: boxes.reduce((sum, box) => sum + box.length * box.width * box.height, 0),
        labels: [...labelCounts.values()].sort((a, b) => a.label.localeCompare(b.label)),
        supportedBy: [...new Set(boxes.flatMap((box) => box.supportedBy))].sort(),
      }
    })
}

