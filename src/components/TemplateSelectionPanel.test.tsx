import { fireEvent, render } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { workbenchCopy } from '../data/workbenchCopy'
import type { ImportTemplate } from '../types'
import { TemplateSelectionPanel, type TemplateSelectionPanelLabels } from './TemplateSelectionPanel'

function makeTemplate(overrides: Partial<ImportTemplate> = {}): ImportTemplate {
  return {
    id: 't1',
    name: 'Vietnam layout',
    mapping: { label: 'Label', name: 'Name', length: 'L', width: 'W', height: 'H', quantity: 'Qty' },
    units: { length: 'mm', width: 'mm', height: 'mm' },
    headerRow: 1,
    startRow: 2,
    mergeRows: 'none',
    dimensionMode: 'separate',
    combinedColumn: '',
    dimensionOrder: ['length', 'width', 'height'],
    defaultValues: { quantity: 1, canRotate: true, stackable: true },
    createdAt: '2026-07-01T00:00:00.000Z',
    updatedAt: '2026-07-01T00:00:00.000Z',
    ...overrides,
  }
}

function panelLabels(locale: 'en' | 'zh'): TemplateSelectionPanelLabels {
  const copy = workbenchCopy[locale]
  return {
    templateSelectionTitle: copy.templateSelectionTitle,
    templateSelectionEmpty: copy.templateSelectionEmpty,
    templateUseWithout: copy.templateUseWithout,
    importTemplateLoadFailed: copy.importTemplateLoadFailed,
    importTemplateRetry: copy.importTemplateRetry,
  }
}

describe('TemplateSelectionPanel copy and actions', () => {
  it('renders English title, templates, and use-without without holding remote state', () => {
    const onSelectNone = vi.fn()
    const onSelectTemplate = vi.fn()
    const onRetry = vi.fn()
    const view = render(
      <TemplateSelectionPanel
        templates={[makeTemplate()]}
        loadFailed={false}
        labels={panelLabels('en')}
        onSelectNone={onSelectNone}
        onSelectTemplate={onSelectTemplate}
        onRetry={onRetry}
      />,
    )

    expect(view.getByTestId('template-selection-panel')).toBeTruthy()
    expect(view.getByText('Choose an import template')).toBeTruthy()
    expect(view.getByTestId('use-without-template').textContent).toBe('Continue without a template')
    expect(view.queryByText('Failed to load import templates')).toBeNull()
    expect(view.queryByRole('button', { name: 'Retry' })).toBeNull()

    fireEvent.click(view.getByTestId('use-without-template'))
    expect(onSelectNone).toHaveBeenCalledOnce()
    expect(onRetry).not.toHaveBeenCalled()

    fireEvent.click(view.getByTestId('template-selection-item-t1'))
    expect(onSelectTemplate).toHaveBeenCalledWith('t1')
  })

  it('renders Chinese selection copy', () => {
    const view = render(
      <TemplateSelectionPanel
        templates={[makeTemplate({ name: '越南模板' })]}
        loadFailed={false}
        labels={panelLabels('zh')}
        onSelectNone={vi.fn()}
        onSelectTemplate={vi.fn()}
        onRetry={vi.fn()}
      />,
    )

    expect(view.getByText('选择导入模板')).toBeTruthy()
    expect(view.getByTestId('use-without-template').textContent).toBe('不使用模板')
    expect(view.getByRole('button', { name: '越南模板' })).toBeTruthy()
  })

  it('shows empty catalog copy and still offers use-without', () => {
    const onSelectNone = vi.fn()
    const view = render(
      <TemplateSelectionPanel
        templates={[]}
        loadFailed={false}
        labels={panelLabels('en')}
        onSelectNone={onSelectNone}
        onSelectTemplate={vi.fn()}
        onRetry={vi.fn()}
      />,
    )

    expect(view.getByText('No import templates yet')).toBeTruthy()
    expect(view.queryByTestId('template-selection-item-t1')).toBeNull()
    fireEvent.click(view.getByTestId('use-without-template'))
    expect(onSelectNone).toHaveBeenCalledOnce()
  })

  it('shows Chinese empty catalog copy', () => {
    const view = render(
      <TemplateSelectionPanel
        templates={[]}
        loadFailed={false}
        labels={panelLabels('zh')}
        onSelectNone={vi.fn()}
        onSelectTemplate={vi.fn()}
        onRetry={vi.fn()}
      />,
    )

    expect(view.getByText('暂无导入模板')).toBeTruthy()
    expect(view.getByTestId('use-without-template')).toBeTruthy()
  })

  it('shows load failure, retry, and use-without so manual import is not blocked', () => {
    const onRetry = vi.fn()
    const onSelectNone = vi.fn()
    const onSelectTemplate = vi.fn()
    const view = render(
      <TemplateSelectionPanel
        templates={[]}
        loadFailed
        labels={panelLabels('en')}
        onSelectNone={onSelectNone}
        onSelectTemplate={onSelectTemplate}
        onRetry={onRetry}
      />,
    )

    expect(view.getByText('Failed to load import templates')).toBeTruthy()
    expect(view.queryByText('No import templates yet')).toBeNull()
    fireEvent.click(view.getByRole('button', { name: 'Retry' }))
    expect(onRetry).toHaveBeenCalledOnce()
    fireEvent.click(view.getByTestId('use-without-template'))
    expect(onSelectNone).toHaveBeenCalledOnce()
    expect(onSelectTemplate).not.toHaveBeenCalled()
  })

  it('shows Chinese load-failure copy and still offers use-without', () => {
    const view = render(
      <TemplateSelectionPanel
        templates={[]}
        loadFailed
        labels={panelLabels('zh')}
        onSelectNone={vi.fn()}
        onSelectTemplate={vi.fn()}
        onRetry={vi.fn()}
      />,
    )

    expect(view.getByText('导入模板加载失败')).toBeTruthy()
    expect(view.getByRole('button', { name: '重试' })).toBeTruthy()
    expect(view.getByTestId('use-without-template').textContent).toBe('不使用模板')
  })
})
