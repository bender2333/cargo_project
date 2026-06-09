import { describe, expect, it } from 'vitest'
import { IMPORT_CODES, parseCargoRows, parseCargoRowsWithMapping, parseCargoRowsWithTemplate } from './importCargo'
import type { ImportTemplateConfig } from './importCargo'

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
          最大堆叠层数: 4,
        },
      ],
      { createId: () => 'import-1' },
    )

    expect(result.items).toEqual([
      {
        id: 'import-1',
        label: 'p1',
        name: '整托货物',
        length: 900,
        width: 700,
        height: 500,
        weight: 33,
        quantity: 2,
        color: '#123456',
        canRotate: true,
        stackable: false,
        maxStackLayers: 4,
      },
    ])
    expect(result.errors).toEqual([])
    expect(result.warnings).toHaveLength(1)
    expect(result.warnings[0]).toMatchObject({
      row: 2,
      code: IMPORT_CODES.CM_CONVERTED,
      params: { row: 2 },
    })
    expect(typeof result.warnings[0].message).toBe('string')
    expect(result.summary).toEqual({
      importedRows: 1,
      mappedFields: ['canRotate', 'color', 'height', 'label', 'name', 'quantity', 'stackable', 'maxStackLayers', 'weight', 'width', 'length'].sort(),
      convertedCentimeterRows: 1,
      skippedRows: 0,
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
    expect(result.errors).toHaveLength(1)
    expect(result.errors[0]).toMatchObject({ row: 3, code: IMPORT_CODES.INVALID_DIMENSIONS, params: { row: 3 } })
    expect(result.warnings.some((issue) => issue.row === 4 && issue.code === IMPORT_CODES.QUANTITY_DEFAULTED)).toBe(true)
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
    expect(result.warnings.some((issue) => issue.row === 2 && issue.code === IMPORT_CODES.QUANTITY_DEFAULTED)).toBe(true)
  })

  it('emits structured codes with English fallback message for downstream localization', () => {
    const result = parseCargoRows(
      [
        { Label: 'A', Length: 0, Width: 0, Height: 0, Quantity: 1 },
        { Label: 'B', Length: 1000, Width: 1000, Height: 1000, Quantity: 0 },
      ],
      { createId: () => 'codes-id' },
    )

    expect(result.errors).toHaveLength(2)
    for (const issue of result.errors) {
      expect(typeof issue.code).toBe('string')
      expect(issue.code.length).toBeGreaterThan(0)
      expect(typeof issue.message).toBe('string')
      expect(issue.message.length).toBeGreaterThan(0)
    }
    expect(result.errors[0].code).toBe(IMPORT_CODES.INVALID_DIMENSIONS)
    expect(result.errors[1].code).toBe(IMPORT_CODES.INVALID_QUANTITY)
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
        maxStackLayers: undefined,
      },
    ])
  })

  it('uses saved template unit settings even when source column names have no unit hint', () => {
    const result = parseCargoRowsWithTemplate(
      [
        {
          Item: 'Template crate',
          Code: 'T1',
          L: 80,
          W: 60,
          H: 40,
          Qty: 2,
        },
      ],
      {
        mapping: {
          name: 'Item',
          label: 'Code',
          length: 'L',
          width: 'W',
          height: 'H',
          quantity: 'Qty',
        },
        units: { length: 'cm', width: 'cm', height: 'cm' },
      },
      { createId: () => 'template-1' },
    )

    expect(result.items[0]).toMatchObject({
      id: 'template-1',
      name: 'Template crate',
      label: 'T1',
      length: 800,
      width: 600,
      height: 400,
      quantity: 2,
    })
    expect(result.summary.convertedCentimeterRows).toBe(1)
  })

  it('applies complete template metadata: start row, defaults, and units', () => {
    const result = parseCargoRowsWithTemplate(
      [
        { Item: 'ignored intro', Code: 'SKIP', L: 1, W: 1, H: 1 },
        { Item: 'Template crate', Code: '', L: 80, W: 60, H: 40 },
      ],
      {
        mapping: {
          name: 'Item',
          label: 'Code',
          length: 'L',
          width: 'W',
          height: 'H',
        },
        units: { length: 'cm', width: 'cm', height: 'cm' },
        headerRow: 1,
        startRow: 3,
        defaultValues: {
          label: 'TPL',
          quantity: 2,
          color: '#123456',
          canRotate: false,
          stackable: false,
          maxStackLayers: 4,
        },
      },
      { createId: () => 'template-meta-1' },
    )

    expect(result.items).toEqual([
      expect.objectContaining({
        id: 'template-meta-1',
        label: 'TPL',
        name: 'Template crate',
        length: 800,
        width: 600,
        height: 400,
        quantity: 2,
        color: '#123456',
        canRotate: false,
        stackable: false,
        maxStackLayers: 4,
      }),
    ])
  })

  it('applies default quantity when no quantity column is mapped', () => {
    const result = parseCargoRowsWithTemplate(
      [{ Item: 'Template crate', L: 80, W: 60, H: 40 }],
      {
        mapping: {
          name: 'Item',
          length: 'L',
          width: 'W',
          height: 'H',
        },
        units: { length: 'cm', width: 'cm', height: 'cm' },
        defaultValues: { label: 'TP', quantity: 3 },
      },
      { createId: () => 'template-default-quantity' },
    )

    expect(result.errors).toHaveLength(0)
    expect(result.items).toEqual([
      expect.objectContaining({
        id: 'template-default-quantity',
        label: 'TP',
        name: 'Template crate',
        length: 800,
        width: 600,
        height: 400,
        quantity: 3,
      }),
    ])
  })

  it('uses template headerRow on raw worksheet matrices and preserves full SKU labels', () => {
    const rows = [
      ['越南第十一批海运', null, null, null, null, null],
      ['物料名称', '物料代码SKU', '预计发货数量', '箱数', '外箱尺寸（mm）', '毛重kg'],
      ['EV charging cable', 'TB-C10-EV_v1.1', 7056, 126, '530*305*310', 12.5],
      ['汇总', '', 7056, 126, '', ''],
    ]

    const result = parseCargoRowsWithTemplate(
      rows,
      {
        headerRow: 2,
        startRow: 3,
        mapping: {
          name: '物料名称',
          label: '物料代码SKU',
          quantity: '箱数',
          dimensions: '外箱尺寸（mm）',
          weight: '毛重kg',
        },
        units: { length: 'mm', width: 'mm', height: 'mm' },
        dimensionMode: 'combined',
        combinedColumn: '外箱尺寸（mm）',
        dimensionOrder: ['length', 'width', 'height'],
      },
      { createId: () => 'vietnam-1' },
    )

    expect(result.errors).toEqual([])
    expect(result.items).toEqual([
      expect.objectContaining({
        id: 'vietnam-1',
        name: 'EV charging cable',
        label: 'TB-C10-EV_v1.1',
        length: 530,
        width: 305,
        height: 310,
        quantity: 126,
        weight: 12.5,
      }),
    ])
    expect(result.items[0].label).not.toBe('TB')
    expect(result.summary.skippedRows).toBe(1)
  })

  it('splits combined dimensions across common separators and converts cm units', () => {
    const baseTemplate = {
      headerRow: 1,
      startRow: 2,
      mapping: {
        name: 'Name',
        label: 'SKU',
        quantity: 'Cartons',
        dimensions: 'Size',
      },
      units: { length: 'cm', width: 'cm', height: 'cm' },
      dimensionMode: 'combined' as const,
      combinedColumn: 'Size',
      dimensionOrder: ['length', 'width', 'height'],
    } satisfies ImportTemplateConfig

    const result = parseCargoRowsWithTemplate(
      [
        ['Name', 'SKU', 'Cartons', 'Size'],
        ['star', 'SKU-STAR', 1, '53＊30.5＊31'],
        ['cross', 'SKU-CROSS', 2, '530×305×310'],
        ['space', 'SKU-SPACE', 3, '530 305 310'],
      ],
      baseTemplate,
      { createId: () => 'dimension-id' },
    )

    expect(result.errors).toEqual([])
    expect(result.items.map((item) => [item.label, item.length, item.width, item.height, item.quantity])).toEqual([
      ['SKU-STAR', 530, 305, 310, 1],
      ['SKU-CROSS', 5300, 3050, 3100, 2],
      ['SKU-SPACE', 5300, 3050, 3100, 3],
    ])
  })

  it('prefers carton count over planned quantity unless an explicit mapping says otherwise', () => {
    const row = {
      物料名称: 'Cable',
      物料代码SKU: 'TB-C10-EV_v1.1',
      预计发货数量: 7056,
      箱数: 126,
      Length: 530,
      Width: 305,
      Height: 310,
    }

    const inferred = parseCargoRows([row], { createId: () => 'carton-inferred' })
    const explicit = parseCargoRowsWithMapping(
      [row],
      {
        name: '物料名称',
        label: '物料代码SKU',
        quantity: '预计发货数量',
        length: 'Length',
        width: 'Width',
        height: 'Height',
      },
      { createId: () => 'carton-explicit' },
    )

    expect(inferred.items[0]?.quantity).toBe(126)
    expect(explicit.items[0]?.quantity).toBe(7056)
  })
})
