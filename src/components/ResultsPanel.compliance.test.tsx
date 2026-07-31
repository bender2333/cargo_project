import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ResultsPanelProps } from './ResultsPanel'
import { ResultsPanel } from './ResultsPanel'
import type { ActivePlanCompliance } from '../lib/planCompliance'
import type { PackingResult, PlacedBox } from '../types'

const box: PlacedBox = {
  id: 'box-1', cargoId: 'cargo-1', name: 'Box', label: 'A', index: 1,
  x: 0, y: 0, z: 0, length: 100, width: 100, height: 100,
  orientationKey: 'LWH', labelRotationDeg: 0, weight: 10, color: '#fff',
  canRotate: true, stackable: true, physicalLayer: 1, depthLayer: 1, workStep: 1,
  supportType: 'floor', supportedBy: [],
}

const result: PackingResult = {
  placed: [box], unplaced: [], layers: [{ id: 'layer-1', physicalLayer: 1, minZ: 0, maxZ: 100, count: 1, weight: 10, volume: 1_000_000, labels: [{ label: 'A', color: '#fff', count: 1 }], supportedBy: [] }],
  workSteps: [{ step: 1, boxId: box.id, cargoId: box.cargoId, label: box.label, physicalLayer: 1, supportType: 'floor' }],
  labelStats: [], diagnostics: [], totalCargoCount: 1, placedCount: 1,
  usedVolume: 1_000_000, containerVolume: 1_000_000_000, volumeUtilization: 0.1,
  usedWeight: 10, weightUtilization: 1,
}

const okCompliance: ActivePlanCompliance = { mode: 'auto', ok: true, blockers: [] }
const blockedCompliance: ActivePlanCompliance = {
  mode: 'manual',
  ok: false,
  blockers: [{ id: 'manual:overlap:box-1:box-2', source: 'manual', severity: 'error', message: 'Boxes overlap.' }],
}

const t = new Proxy({}, { get: (_target, key) => String(key) }) as ResultsPanelProps['t']
const fn = vi.fn()

function props(planCompliance: ActivePlanCompliance, locale: ResultsPanelProps['locale'] = 'en'): ResultsPanelProps {
  return {
    reportRef: { current: null }, workspaceMaximized: false, locale, t,
    activeResultTab: 'layers', setActiveResultTab: fn, activeResult: result,
    selectedContainer: { id: 'c', label: 'C', description: '', length: 1000, width: 1000, height: 1000, maxWeight: 1000, doorGap: 0, topGap: 0, sideGap: 0 },
    activeLayerId: 'all', setActiveLayerId: fn, activeLabelId: 'all', setActiveLabelId: fn,
    labelOptions: [], activeLayer: undefined, visibleBoxes: [box], activeSelectedBoxId: null,
    detailRows: [], importMessages: [], exportTemplates: [], exportTemplateLoadFailed: false,
    selectedExportTemplateId: '', setSelectedExportTemplateId: fn, fetchExportTemplates: fn,
    playbackAvailable: true,
    playback: { cursor: 0, playing: false, speed: 'normal', setCursor: fn, setSpeed: fn, togglePlay: fn, reset: fn, finish: fn },
    playbackSequence: { total: 1, steps: [{ step: 1, box, loadingStep: result.workSteps[0] }] },
    loadingStepsAvailable: true,
    loadingTaskGroups: [{ id: 'g1', sequence: 1, stepStart: 1, stepEnd: 1, depthLayer: 1, labels: [{ label: 'A', color: '#fff', count: 1 }], boxIds: [box.id], bounds: { xMin: 0, xMax: 100, yMin: 0, yMax: 100, zMin: 0, zMax: 100 }, supportTypes: ['floor'], supportedBy: [], summary: 'A' }],
    activeLoadingGroupIndex: 0, loadingGroupsPlaying: false, setActiveLoadingGroupIndex: fn, setLoadingGroupsPlaying: fn,
    cogResult: { cog: { x: 0, y: 0, z: 0 }, center: { x: 0, y: 0, z: 0 }, offset: { x: 0, y: 0, z: 0 }, totalWeight: 0, warning: false, balanced: true },
    showCogOverlay: false, vehicleProfile: 'container-only', toggleCogOverlay: fn, setVehicleProfile: fn,
    compareCandidates: [], compareRows: [], compareSelection: [], setCompareSelection: fn, selectContainerById: fn,
    hasCalculated: true, fillSuggestions: [], handleAddFillCargo: fn, handleAddAllFillCargo: fn,
    reviewChecklist: { items: [], summary: { total: 0, errorCount: 0, warningCount: 0 } },
    exportReviewChecklistJson: fn, exportReviewChecklistExcel: fn, selectLayerByOffset: fn, selectStepBox: fn,
    importExcel: fn, downloadImportTemplate: fn, exportExcel: fn, saveCurrentPlan: fn,
    exportPlaybackInstructions: fn, exportLoadingSheet: fn, displayCargoItemsCount: 1,
    placementMode: 'auto', planCompliance, selectManualBox: fn, setSelectedBoxId: fn,
  }
}

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('ResultsPanel compliance controls', () => {
  it('disables every save/export control and associates the visible blocker reason', () => {
    const view = render(<ResultsPanel {...props(blockedCompliance)} />)
    const summary = view.getByTestId('plan-compliance-blockers')
    expect(summary.textContent).toContain('Boxes overlap.')

    for (const name of ['exportExcel', 'savePlan']) {
      const button = view.getByRole('button', { name }) as HTMLButtonElement
      expect(button.disabled).toBe(true)
      expect(button.getAttribute('aria-describedby')).toBe(summary.id)
    }

    view.rerender(<ResultsPanel {...props(blockedCompliance)} activeResultTab="playback" />)
    expect((view.getByTestId('playback-export') as HTMLButtonElement).disabled).toBe(true)
    expect(view.getByTestId('playback-export').getAttribute('aria-describedby')).toBe('playback-export-disabled-reason')
    expect(view.getByTestId('playback-export-disabled-reason').textContent).toContain('Boxes overlap.')

    view.rerender(<ResultsPanel {...props(blockedCompliance)} activeResultTab="loadingSteps" />)
    expect((view.getByTestId('export-loading-sheet-pdf') as HTMLButtonElement).disabled).toBe(true)
    expect(view.getByTestId('export-loading-sheet-pdf').getAttribute('aria-describedby')).toBe('loading-export-disabled-reason')
    expect(view.getByTestId('loading-export-disabled-reason').textContent).toContain('Boxes overlap.')

    view.rerender(<ResultsPanel {...props(blockedCompliance)} activeResultTab="reviewChecklist" />)
    expect((view.getByTestId('export-review-json') as HTMLButtonElement).disabled).toBe(true)
    expect((view.getByTestId('export-review-excel') as HTMLButtonElement).disabled).toBe(true)
    expect(view.getByTestId('export-review-json').getAttribute('aria-describedby')).toBe('plan-compliance-blockers')
    expect(view.getByTestId('export-review-excel').getAttribute('aria-describedby')).toBe('plan-compliance-blockers')
  })

  it('localizes visible blocker reasons in Chinese', () => {
    const compliance: ActivePlanCompliance = {
      mode: 'auto',
      ok: false,
      blockers: [{ id: 'diagnostic:weight-check', source: 'diagnostic', severity: 'error', message: 'Weight check failed' }],
    }
    const view = render(<ResultsPanel {...props(compliance, 'zh')} />)

    const summary = view.getByTestId('plan-compliance-blockers')
    expect(summary.textContent).toContain('载重检查失败')
    expect(summary.textContent).not.toContain('Weight check failed')
  })

  it('enables every save/export control for a compliant active plan', () => {
    const view = render(<ResultsPanel {...props(okCompliance)} />)
    expect(view.queryByTestId('plan-compliance-blockers')).toBeNull()
    expect((view.getByRole('button', { name: 'exportExcel' }) as HTMLButtonElement).disabled).toBe(false)
    expect((view.getByRole('button', { name: 'savePlan' }) as HTMLButtonElement).disabled).toBe(false)

    view.rerender(<ResultsPanel {...props(okCompliance)} activeResultTab="playback" />)
    expect((view.getByTestId('playback-export') as HTMLButtonElement).disabled).toBe(false)
    view.rerender(<ResultsPanel {...props(okCompliance)} activeResultTab="loadingSteps" />)
    expect((view.getByTestId('export-loading-sheet-pdf') as HTMLButtonElement).disabled).toBe(false)
    view.rerender(<ResultsPanel {...props(okCompliance)} activeResultTab="reviewChecklist" />)
    expect((view.getByTestId('export-review-json') as HTMLButtonElement).disabled).toBe(false)
    expect((view.getByTestId('export-review-excel') as HTMLButtonElement).disabled).toBe(false)
  })
})
