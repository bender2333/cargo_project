import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { VisualizationWorkspaceProps } from './VisualizationWorkspace'
import { VisualizationWorkspace } from './VisualizationWorkspace'
import type { PackingResult } from '../types'

const t = new Proxy({}, { get: (_target, key) => String(key) }) as VisualizationWorkspaceProps['t']
const container = {
  id: 'c', label: 'Container', description: '', length: 1000, width: 1000, height: 1000,
  maxWeight: 1000, doorGap: 0, topGap: 0, sideGap: 0,
}
const result: PackingResult = {
  placed: [], unplaced: [], layers: [], workSteps: [], labelStats: [], diagnostics: [],
  totalCargoCount: 0, placedCount: 0, usedVolume: 0, containerVolume: 1_000_000_000,
  volumeUtilization: 0, usedWeight: 0, weightUtilization: 0,
}

function props(overrides: Partial<VisualizationWorkspaceProps> = {}): VisualizationWorkspaceProps {
  return {
    workspaceMaximized: false,
    setWorkspaceMaximized: vi.fn(),
    activeResult: result,
    formatCubicMeters: (value) => String(value),
    t,
    placementMode: 'auto',
    manualKeyboardEnabled: false,
    setPlacementMode: vi.fn(),
    hasCalculated: true,
    handleContinueManually: vi.fn(),
    workspaceView: '2d',
    setWorkspaceView: vi.fn(),
    planViewMode: 'top',
    setPlanViewMode: vi.fn(),
    sceneViewMode: 'iso',
    selectSceneView: vi.fn(),
    resetSceneView: vi.fn(),
    clearanceEnabled: false,
    setClearanceEnabled: vi.fn(),
    exportCurrentView: vi.fn(),
    exportCurrentViewDisabled: false,
    exportCurrentViewDisabledReason: null,
    containerChangeNotice: '',
    customContainerLoadFailed: false,
    locale: 'en',
    manualNotice: null,
    setManualNotice: vi.fn(),
    rotationNotice: '',
    setRotationNotice: vi.fn(),
    manualIssues: [],
    localizeManualIssue: (issue) => issue.message,
    manualPool: [],
    handleManualPoolDragStart: vi.fn(),
    handleManualPoolDragEnd: vi.fn(),
    handleQuickPlaceCargo: vi.fn(),
    manualHelpOpen: false,
    setManualHelpOpen: vi.fn(),
    visibleManualBoxes: [],
    renderingContainer: container,
    gridSnap: true,
    edgeSnap: true,
    placementSettings: {} as VisualizationWorkspaceProps['placementSettings'],
    manualInvalidBoxIds: new Set(),
    poolDragInfo: null,
    loadingStepsActive: false,
    activeLoadingGroupBoxIds: undefined,
    resetViewTick: 0,
    manualSelectedId: null,
    selectManualBox: vi.fn(),
    setHoverInfo: vi.fn(),
    handleManualDeleteBox: vi.fn(),
    handleManualDropFromPool: vi.fn(),
    handleManualMoveBox: vi.fn(),
    notifyManualRejected: vi.fn(),
    handleManualRotateBox: vi.fn(),
    clearanceAnnotations: [],
    manualDraft: { boxes: [] },
    autoHelpOpen: false,
    setAutoHelpOpen: vi.fn(),
    visibleAutoBoxes: [],
    activeLabelId: 'all',
    activeLayerId: 'all',
    cogViewState: { boxOpacity: null, showOverlay: false },
    cogOverlay: null,
    selectedBoxId: null,
    setSelectedBoxId: vi.fn(),
    calculateAndShowPlacement: vi.fn(),
    hoverInfo: null,
    ...overrides,
  }
}

afterEach(() => cleanup())

describe('VisualizationWorkspace compliance control', () => {
  it('disables current-view export with a visible linked reason', () => {
    const view = render(<VisualizationWorkspace {...props({
      exportCurrentViewDisabled: true,
      exportCurrentViewDisabledReason: 'Resolve the plan blocker before exporting.',
    })} />)
    const button = view.getByRole('button', { name: 'exportView' }) as HTMLButtonElement
    expect(button.disabled).toBe(true)
    expect(button.getAttribute('aria-describedby')).toBe('visual-export-disabled-reason')
    expect(view.getByText('Resolve the plan blocker before exporting.')).toBeTruthy()

    view.rerender(<VisualizationWorkspace {...props()} />)
    expect((view.getByRole('button', { name: 'exportView' }) as HTMLButtonElement).disabled).toBe(false)
    expect(view.queryByText('Resolve the plan blocker before exporting.')).toBeNull()
  })
})
