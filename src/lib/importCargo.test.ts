import { describe, expect, it } from 'vitest'
import { parseCargoRows } from './importCargo'

describe('parseCargoRows', () => {
  it('maps Chinese headers and converts centimeter dimensions to millimeters', () => {
    const result = parseCargoRows(
      [
        {
          托盘: 'p1',
          货物名称: '整托货物',
          长cm: 90,
          宽cm: 70,
          高cm: 50,
          整托重量kg: 33,
          数量: 2,
          颜色: '#123456',
          允许旋转: '是',
          允许堆叠: '否',
        },
      ],
      { createId: () => 'import-1' },
    )

    expect(result.items).toEqual([
      {
        id: 'import-1',
        label: 'P1',
        name: '整托货物',
        length: 900,
        width: 700,
        height: 500,
        weight: 33,
        quantity: 2,
        color: '#123456',
        canRotate: true,
        stackable: false,
      },
    ])
    expect(result.errors).toEqual([])
    expect(result.warnings).toEqual([
      { row: 2, message: 'Centimeter dimensions were converted to millimeters.' },
    ])
  })

  it('keeps valid rows and reports invalid required fields without silent failure', () => {
    const result = parseCargoRows(
      [
        { Label: 'A', Name: 'Valid', Length: 1000, Width: 800, Height: 600, Quantity: 1 },
        { Label: 'B', Name: 'Missing height', Length: 1000, Width: 800, Quantity: 1 },
        { Label: 'C', Name: 'Missing quantity', Length: 1000, Width: 800, Height: 600 },
      ],
      { createId: () => 'fixed-id' },
    )

    expect(result.items).toHaveLength(1)
    expect(result.items[0]).toMatchObject({ label: 'A', name: 'Valid', length: 1000, quantity: 1 })
    expect(result.errors).toEqual([
      { row: 3, message: 'Missing or invalid length, width, or height.' },
      { row: 4, message: 'Missing or invalid quantity.' },
    ])
  })
})
