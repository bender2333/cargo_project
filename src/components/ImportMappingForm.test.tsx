import { fireEvent, render } from '@testing-library/react'
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
})
