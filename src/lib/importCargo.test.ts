import { describe, expect, it } from 'vitest'
import { parseCargoRows, parseCargoRowsWithMapping } from './importCargo'

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
    expect(result.summary).toEqual({
      importedRows: 1,
      mappedFields: ['canRotate', 'color', 'height', 'label', 'name', 'quantity', 'stackable', 'weight', 'width', 'length'].sort(),
      convertedCentimeterRows: 1,
    })
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

    expect(result.items).toHaveLength(2)
    expect(result.items[0]).toMatchObject({ label: 'A', name: 'Valid', length: 1000, quantity: 1 })
    expect(result.items[1]).toMatchObject({ label: 'C', name: 'Missing quantity', length: 1000, quantity: 1 })
    expect(result.errors).toEqual([
      { row: 3, message: 'Missing or invalid length, width, or height.' },
    ])
    expect(result.warnings).toContainEqual({ row: 4, message: 'Quantity was missing and defaulted to 1.' })
    expect(result.summary.importedRows).toBe(2)
  })

  it('defaults missing quantity to one for row-per-item business workbooks', () => {
    const result = parseCargoRows(
      [
        {
          托盘: 1,
          货物名称: 'Pallet item',
          长cm: 100,
          宽cm: 80,
          高cm: 60,
          整托重量kg: 40,
        },
      ],
      { createId: () => 'fixed-id' },
    )

    expect(result.items).toEqual([
      expect.objectContaining({ label: '1', name: 'Pallet item', quantity: 1, length: 1000, width: 800, height: 600 }),
    ])
    expect(result.warnings).toContainEqual({ row: 2, message: 'Quantity was missing and defaulted to 1.' })
  })
})

describe('parseCargoRowsWithMapping', () => {
  it('correctly maps custom user columns and converts cm to mm', () => {
    const result = parseCargoRowsWithMapping(
      [
        {
          品名: '箱子',
          代码: 'X1',
          箱长cm: 80,
          箱宽cm: 60,
          箱高: 400,
          毛重: 15,
          装载箱数: 10,
        },
      ],
      {
        name: '品名',
        label: '代码',
        length: '箱长cm',
        width: '箱宽cm',
        height: '箱高',
        weight: '毛重',
        quantity: '装载箱数',
      },
      { createId: () => 'mapping-1' }
    )

    expect(result.items).toEqual([
      {
        id: 'mapping-1',
        label: 'X1',
        name: '箱子',
        length: 800, // converted from cm
        width: 600,  // converted from cm
        height: 400, // kept in mm
        weight: 15,
        quantity: 10,
        color: '#f59e0b',
        canRotate: true,
        stackable: true,
      },
    ])
  })
})
