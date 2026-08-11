import { describe, expect, it } from 'vitest'
import { SpatialGrid, type SpatialAabb } from './spatialGrid'

function aabb(minX: number, minY: number, minZ: number, maxX: number, maxY: number, maxZ: number): SpatialAabb {
  return { minX, minY, minZ, maxX, maxY, maxZ }
}

describe('SpatialGrid', () => {
  it('空查询返回空数组', () => {
    const grid = new SpatialGrid<string>(aabb(0, 0, 0, 1000, 1000, 1000), 100)
    expect(grid.query(aabb(0, 0, 0, 100, 100, 100))).toEqual([])
    expect(grid.count).toBe(0)
  })

  it('插入后查询命中同一 AABB', () => {
    const grid = new SpatialGrid<string>(aabb(0, 0, 0, 1000, 1000, 1000), 100)
    const box = aabb(100, 200, 300, 400, 500, 600)
    grid.insert('b1', box, 'payload-1')
    expect(grid.count).toBe(1)
    expect(grid.query(box)).toEqual(['payload-1'])
  })

  it('紧邻但不重叠的 AABB 仍被网格返回（精确筛选由下游 overlaps 完成）', () => {
    const grid = new SpatialGrid<string>(aabb(0, 0, 0, 1000, 1000, 1000), 100)
    grid.insert('b1', aabb(0, 0, 0, 100, 100, 100), 'A')
    // EPSILON 扩张使紧邻 AABB 被纳入候选——网格只管召回，精确判定由 overlaps() 负责
    expect(grid.query(aabb(100, 0, 0, 200, 100, 100))).toEqual(['A'])
  })

  it('跨格大箱被查询命中', () => {
    const grid = new SpatialGrid<string>(aabb(0, 0, 0, 1000, 1000, 1000), 50)
    const big = aabb(0, 0, 0, 500, 500, 500)
    grid.insert('big', big, 'B')
    // 查询覆盖大箱的一部分
    expect(grid.query(aabb(200, 200, 200, 300, 300, 300))).toEqual(['B'])
    // 查询完全包含大箱
    expect(grid.query(aabb(0, 0, 0, 600, 600, 600))).toEqual(['B'])
  })

  it('同一格内多箱全部命中', () => {
    const grid = new SpatialGrid<string>(aabb(0, 0, 0, 1000, 1000, 1000), 200)
    grid.insert('a', aabb(10, 10, 10, 50, 50, 50), 'A')
    grid.insert('b', aabb(20, 20, 20, 60, 60, 60), 'B')
    grid.insert('c', aabb(30, 30, 30, 70, 70, 70), 'C')
    const result = grid.query(aabb(0, 0, 0, 100, 100, 100))
    expect(result).toHaveLength(3)
    expect(result).toContain('A')
    expect(result).toContain('B')
    expect(result).toContain('C')
  })

  it('去重：同一 payload 不会因跨多格而重复返回', () => {
    const grid = new SpatialGrid<string>(aabb(0, 0, 0, 1000, 1000, 1000), 20)
    // 一个跨多格的大箱
    grid.insert('x', aabb(0, 0, 0, 500, 500, 500), 'X')
    const result = grid.query(aabb(0, 0, 0, 600, 600, 600))
    expect(result).toEqual(['X'])
  })

  it('网格边界上查询与插入正确', () => {
    const grid = new SpatialGrid<string>(aabb(0, 0, 0, 300, 300, 300), 100)
    grid.insert('edge', aabb(100, 0, 0, 300, 300, 300), 'E')
    // 查询覆盖边界
    expect(grid.query(aabb(50, 50, 50, 150, 150, 150))).toEqual(['E'])
    // 查询在网格外
    expect(grid.query(aabb(-100, -100, -100, -1, -1, -1))).toEqual([])
  })


  it('query equals full AABB filter (including EPSILON expansion) for dense fixture boxes', () => {
    const bounds = aabb(0, 0, 0, 12000, 2400, 2700)
    const grid = new SpatialGrid<{ id: string; box: SpatialAabb }>(bounds, 400)
    const boxes: Array<{ id: string; box: SpatialAabb }> = []
    let id = 0
    for (let x = 0; x < 10000; x += 1000) {
      for (let y = 0; y < 2000; y += 500) {
        for (let z = 0; z < 2000; z += 500) {
          const box = aabb(x, y, z, x + 900, y + 400, z + 400)
          const payload = { id: `b${id++}`, box }
          boxes.push(payload)
          grid.insert(payload.id, box, payload)
        }
      }
    }

    const intersects = (a: SpatialAabb, b: SpatialAabb) => !(
      a.maxX + 0.001 < b.minX || b.maxX + 0.001 < a.minX ||
      a.maxY + 0.001 < b.minY || b.maxY + 0.001 < a.minY ||
      a.maxZ + 0.001 < b.minZ || b.maxZ + 0.001 < a.minZ
    )

    const queries = [
      aabb(0, 0, 0, 1000, 1000, 1000),
      aabb(2500, 100, 100, 3500, 900, 900),
      aabb(8000, 0, 1500, 9500, 2000, 2500),
      aabb(100, 100, 100, 200, 200, 200),
    ]
    for (const q of queries) {
      const fromGrid = grid.query(q).map((p) => p.id).sort()
      const expanded = {
        minX: q.minX - 0.001, minY: q.minY - 0.001, minZ: q.minZ - 0.001,
        maxX: q.maxX + 0.001, maxY: q.maxY + 0.001, maxZ: q.maxZ + 0.001,
      }
      const full = boxes.filter((b) => intersects(expanded, b.box)).map((b) => b.id).sort()
      expect(fromGrid).toEqual(full)
    }
  })

  it('count 正确追踪插入数', () => {
    const grid = new SpatialGrid<string>(aabb(0, 0, 0, 1000, 1000, 1000), 100)
    expect(grid.count).toBe(0)
    grid.insert('1', aabb(0, 0, 0, 10, 10, 10), 'a')
    expect(grid.count).toBe(1)
    grid.insert('2', aabb(20, 0, 0, 30, 10, 10), 'b')
    expect(grid.count).toBe(2)
  })
})
