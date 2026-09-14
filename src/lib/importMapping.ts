import type { ImportTemplateDefaults } from '../types'

export type MappingDimensionUnit = 'auto' | 'mm' | 'cm'
export type MappingDimensionKey = 'length' | 'width' | 'height'

export type ImportMappingValue = {
  mapping: Record<string, string>
  units: Record<MappingDimensionKey, MappingDimensionUnit>
  headerRow: number
  startRow: number
  dimensionMode: 'separate' | 'combined'
  combinedColumn: string
  dimensionOrder: MappingDimensionKey[]
  defaults: ImportTemplateDefaults
}
