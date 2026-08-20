import { fireEvent, render, type RenderResult } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ImportMappingForm, type ImportMappingFormLabels, type ImportMappingValue } from './ImportMappingForm'

const labels: ImportMappingFormLabels = {
  templateHeaderRow: 'Header row',
  templateStartRow: 'Start row',
  templateHelpHeaderRow: 'Header row help',
  templateHelpStartRow: 'Start row help',
  templateDefaultLabel: 'Default label',
  templateDefaultQuantity: 'Default quantity',
  templateDefaultColor: 'Default color',
  templateDefaultRotate: 'Default rotate',
  templateDefaultStackable: 'Default stackable',
  templateDefaultMaxStackLayers: 'Default max stack layers',
  templateDefaultGroundOnly: 'Default ground only',
  templateDimensionMode: 'Dimension mode',
  templateHelpDimensionMode: 'Dimension mode help',
  templateDimensionSeparate: 'Separate',
  templateDimensionCombined: 'Combined',
  templateCombinedColumn: 'Combined column',
  templateHelpCombinedColumn: 'Combined column help',
  templateDimensionOrder: 'Dimension order',
  templateDimensionOrderLWH: 'LWH',
  templateDimensionOrderLHW: 'LHW',
  templateDimensionOrderWLH: 'WLH',
  templateDimensionOrderWHL: 'WHL',
  templateDimensionOrderHLW: 'HLW',
  templateDimensionOrderHWL: 'HWL',
  templateHelpLabelColumn: 'Label help',
  mappingSelectColumn: 'Select column',
  mappingFieldLabel: 'Label',
  mappingFieldName: 'Name',
  mappingFieldLength: 'Length',
  mappingFieldWidth: 'Width',
  mappingFieldHeight: 'Height',
  mappingFieldWeight: 'Weight',
  mappingFieldQuantity: 'Quantity',
  mappingFieldGroundOnly: 'Ground only',
  color: 'Color',
  rotate: 'Rotate',
  stackable: 'Stackable',
  groundOnly: 'Ground only',
  maxStackLayers: 'Max stack layers',
  mappingUnit: 'Unit',
  mappingAutoUnit: 'Auto',
  mappingConvertHint: 'Convert cm to mm',
  mappingRequiredMarkerHint: '* marks fields required to complete the current configuration',
  mappingRequiredField: 'Required',
}

const zhLabels: ImportMappingFormLabels = {
  ...labels,
  mappingRequiredMarkerHint: '* 表示完成当前配置所必需的项目',
  mappingRequiredField: '必填',
  mappingFieldLength: '长度',
  mappingFieldWidth: '宽度',
  mappingFieldHeight: '高度',
  templateCombinedColumn: '组合尺寸列',
  templateDimensionOrder: '尺寸顺序',
}

function fieldLabel(ui: RenderResult, testId: string) {
  return ui.getByTestId(testId).closest('label')
}

function hasRequiredMarker(label: HTMLElement | null, requiredText: string) {
  if (!label) return false
  const visualStar = [...label.querySelectorAll('span[aria-hidden="true"]')].some((node) => node.textContent === '*')
  const accessible = [...label.querySelectorAll('.sr-only')].some((node) => node.textContent === requiredText)
  return visualStar && accessible
}


const baseValue: ImportMappingValue = {
  mapping: {
    label: 'Code',
    name: 'Goods',
    length: 'Missing length',
    width: 'W',
    height: 'H',
    quantity: 'Qty',
    dimensions: '',
  },
  units: { length: 'mm', width: 'mm', height: 'mm' },
  headerRow: 1,
  startRow: 2,
  dimensionMode: 'separate',
  combinedColumn: '',
  dimensionOrder: ['length', 'width', 'height'],
  defaults: { quantity: 1, canRotate: true, stackable: true },
}

describe('ImportMappingForm missing column feedback', () => {
  it('marks only mapped columns that a selected template cannot find in the file', () => {
    const { getByTestId, getByText } = render(
      <ImportMappingForm
        value={baseValue}
        onChange={vi.fn()}
        availableColumns={['Code', 'Goods', 'W', 'H', 'Qty']}
        labels={labels}
        missingColumns={['Missing length']}
      />,
    )

    expect(getByTestId('map-select-length').getAttribute('data-invalid')).toBe('true')
    expect(getByText(/Column not found in file/)).toBeTruthy()
    expect(getByTestId('map-select-width').hasAttribute('data-invalid')).toBe(false)
  })

  it('keeps manual mapping inputs normal when no template missing list is supplied', () => {
    const { getByTestId, queryByText } = render(
      <ImportMappingForm
        value={baseValue}
        onChange={vi.fn()}
        availableColumns={['Code', 'Goods', 'W', 'H', 'Qty']}
        labels={labels}
      />,
    )

    expect(getByTestId('map-select-length').hasAttribute('data-invalid')).toBe(false)
    expect(queryByText(/Column not found in file/)).toBeNull()
  })

  it('marks the combined dimension column when a selected template points at a missing size header', () => {
    const { getByTestId } = render(
      <ImportMappingForm
        value={{
          ...baseValue,
          mapping: { ...baseValue.mapping, dimensions: 'Missing size' },
          dimensionMode: 'combined',
          combinedColumn: 'Missing size',
        }}
        onChange={vi.fn()}
        availableColumns={['Code', 'Goods', 'Qty']}
        labels={labels}
        missingColumns={['Missing size']}
      />,
    )

    expect(getByTestId('template-combined-column').getAttribute('data-invalid')).toBe('true')
  })

  it('updates ground-only and loading-priority defaults', () => {
    const onChange = vi.fn()
    const { getByTestId } = render(
      <ImportMappingForm
        value={baseValue}
        onChange={onChange}
        availableColumns={['Code', 'Goods', 'W', 'H', 'Qty']}
        labels={labels}
      />,
    )

    fireEvent.click(getByTestId('template-default-ground-only'))
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({
      defaults: expect.objectContaining({ groundOnly: true }),
    }))
  })

  it('does not render a default weight input', () => {
    const { queryByTestId } = render(
      <ImportMappingForm
        value={baseValue}
        onChange={vi.fn()}
        availableColumns={['Code', 'Goods', 'W', 'H', 'Qty']}
        labels={labels}
      />,
    )

    expect(queryByTestId('template-default-weight')).toBeNull()
  })
})

describe('ImportMappingForm required field markers', () => {
  it('marks only length, width, and height in separate mode', () => {
    const ui = render(
      <ImportMappingForm
        value={baseValue}
        onChange={vi.fn()}
        availableColumns={['Code', 'Goods', 'W', 'H', 'Qty']}
        labels={labels}
      />,
    )

    expect(ui.getByText(labels.mappingRequiredMarkerHint)).toBeTruthy()
    expect(hasRequiredMarker(fieldLabel(ui, 'map-select-length'), labels.mappingRequiredField)).toBe(true)
    expect(hasRequiredMarker(fieldLabel(ui, 'map-select-width'), labels.mappingRequiredField)).toBe(true)
    expect(hasRequiredMarker(fieldLabel(ui, 'map-select-height'), labels.mappingRequiredField)).toBe(true)

    for (const testId of [
      'map-select-label',
      'map-select-name',
      'map-select-weight',
      'map-select-quantity',
      'map-select-color',
      'map-select-canRotate',
      'map-select-stackable',
      'map-select-maxStackLayers',
      'map-select-groundOnly',
    ]) {
      expect(hasRequiredMarker(fieldLabel(ui, testId), labels.mappingRequiredField)).toBe(false)
    }
  })

  it('marks only the combined size column and dimension order in combined mode', () => {
    const ui = render(
      <ImportMappingForm
        value={{
          ...baseValue,
          dimensionMode: 'combined',
          combinedColumn: 'Size',
          mapping: { ...baseValue.mapping, dimensions: 'Size' },
        }}
        onChange={vi.fn()}
        availableColumns={['Code', 'Goods', 'Size', 'Qty']}
        labels={labels}
      />,
    )

    expect(ui.getByText(labels.mappingRequiredMarkerHint)).toBeTruthy()
    expect(hasRequiredMarker(fieldLabel(ui, 'template-combined-column'), labels.mappingRequiredField)).toBe(true)
    expect(hasRequiredMarker(fieldLabel(ui, 'template-dimension-order'), labels.mappingRequiredField)).toBe(true)
    expect(ui.queryByTestId('map-select-length')).toBeNull()
    expect(ui.queryByTestId('map-select-width')).toBeNull()
    expect(ui.queryByTestId('map-select-height')).toBeNull()

    for (const testId of [
      'map-select-label',
      'map-select-name',
      'map-select-weight',
      'map-select-quantity',
      'map-select-color',
    ]) {
      expect(hasRequiredMarker(fieldLabel(ui, testId), labels.mappingRequiredField)).toBe(false)
    }
  })

  it('renders Chinese and English required-marker copy from labels', () => {
    const zh = render(
      <ImportMappingForm
        value={baseValue}
        onChange={vi.fn()}
        availableColumns={['Code', 'Goods', 'W', 'H', 'Qty']}
        labels={zhLabels}
      />,
    )
    expect(zh.getByText(zhLabels.mappingRequiredMarkerHint)).toBeTruthy()
    expect(hasRequiredMarker(fieldLabel(zh, 'map-select-length'), zhLabels.mappingRequiredField)).toBe(true)
    zh.unmount()

    const en = render(
      <ImportMappingForm
        value={baseValue}
        onChange={vi.fn()}
        availableColumns={['Code', 'Goods', 'W', 'H', 'Qty']}
        labels={labels}
      />,
    )
    expect(en.getByText(labels.mappingRequiredMarkerHint)).toBeTruthy()
    expect(hasRequiredMarker(fieldLabel(en, 'map-select-length'), labels.mappingRequiredField)).toBe(true)
  })
})
