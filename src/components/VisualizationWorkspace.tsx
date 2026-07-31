import type { DragEvent as ReactDragEvent } from 'react'
import { ContainerScene } from './ContainerScene'
import type { SceneViewMode } from './ContainerScene'
import { ContainerPlan2D } from './ContainerPlan2D'
import type { PlanViewMode } from './ContainerPlan2D'
import { ManualPlacement2D } from './ManualPlacement2D'
import type { ContainerSpec, Locale, PackingResult, PlacedBox } from '../types'
import type { ValidationIssue, PoolEntry, OrientationKey, ManualDraft, ManualRotationDirection } from '../lib/manualPlacement'
import type { ManualOperationNotice } from '../lib/manualFeedback'
import type { PlacementSettings } from '../lib/placementSettings'
import type { ClearanceAnnotation } from '../lib/measurement'
import type { CogOverlay } from '../lib/cogVisual'

type WorkspaceView = '3d' | '2d'
type PlacementMode = 'auto' | 'manual'

type HoverInfo = {
  id: string
  label: string
  length: number
  width: number
  height: number
  orientationKey: OrientationKey
  x: number
  y: number
  z: number
  clientX: number
  clientY: number
}

type PoolDragInfo = {
  cargoId: string
  length: number
  width: number
  height: number
  color: string
}

type TranslationKeys = {
  loaded: string
  weight: string
  weightUse: string
  volumeUse: string
  autoMode: string
  manualMode: string
  continueManually: string
  view2d: string
  view3d: string
  topView: string
  frontView: string
  sideView: string
  isoView: string
  resetView: string
  clearanceTitle: string
  exportView: string
  dismissNotice: string
  manualIssues: string
  placementPool: string
  poolEmpty: string
  poolRemaining: string
  quickPlace: string
  restoreManual: string
  maximizeManual: string
  manualKeyboardHelp: string
  manualKeyboardHelpItems: string[]
  autoKeyboardHelp: string
  autoKeyboardHelpItems: string[]
  load: string
  hoverTooltipLabel: string
  hoverTooltipSize: string
  hoverTooltipOrientation: string
  hoverTooltipPosition: string
  manualIssueBoundary: string
  manualIssueOverlap: string
  manualIssueFloating: string
  manualIssueRotationDisabled: string
  manualIssueStacking: string
  manualIssueMaxStackLayers: string
}

export type VisualizationWorkspaceProps = {
  workspaceMaximized: boolean
  setWorkspaceMaximized: (fn: (current: boolean) => boolean) => void
  activeResult: PackingResult
  formatCubicMeters: (volume: number) => string
  t: TranslationKeys
  placementMode: PlacementMode
  manualKeyboardEnabled: boolean
  setPlacementMode: (mode: PlacementMode) => void
  hasCalculated: boolean
  handleContinueManually: () => void
  workspaceView: WorkspaceView
  setWorkspaceView: (view: WorkspaceView) => void
  planViewMode: PlanViewMode
  setPlanViewMode: (mode: PlanViewMode) => void
  sceneViewMode: SceneViewMode
  selectSceneView: (mode: SceneViewMode) => void
  resetSceneView: () => void
  clearanceEnabled: boolean
  setClearanceEnabled: (fn: (enabled: boolean) => boolean) => void
  exportCurrentView: () => void
  exportCurrentViewDisabled: boolean
  exportCurrentViewDisabledReason?: string | null
  containerChangeNotice: string
  customContainerLoadFailed: boolean
  locale: Locale
  manualNotice: ManualOperationNotice | null
  setManualNotice: (notice: ManualOperationNotice | null) => void
  rotationNotice: string
  setRotationNotice: (notice: string) => void
  manualIssues: ValidationIssue[]
  localizeManualIssue: (issue: ValidationIssue) => string
  manualPool: PoolEntry[]
  handleManualPoolDragStart: (event: ReactDragEvent<HTMLDivElement>, cargoId: string) => void
  handleManualPoolDragEnd: () => void
  handleQuickPlaceCargo: (cargoId: string) => void
  manualHelpOpen: boolean
  setManualHelpOpen: (fn: (current: boolean) => boolean) => void
  visibleManualBoxes: PlacedBox[]
  renderingContainer: ContainerSpec
  gridSnap: boolean
  edgeSnap: boolean
  placementSettings: PlacementSettings
  manualInvalidBoxIds: Set<string>
  poolDragInfo: PoolDragInfo | null
  loadingStepsActive: boolean
  activeLoadingGroupBoxIds: Set<string> | undefined
  resetViewTick: number
  manualSelectedId: string | null
  selectManualBox: (id: string | null) => void
  setHoverInfo: (info: HoverInfo | null) => void
  handleManualDeleteBox: (boxId: string) => void
  handleManualDropFromPool: (cargoId: string, x: number, y: number, z?: number) => void
  handleManualMoveBox: (boxId: string, x: number, y: number, z?: number) => void
  notifyManualRejected: (
    operation: 'move' | 'drop' | 'rotate' | 'delete',
    boxId?: string,
    cargoId?: string,
    issues?: ValidationIssue[],
    reasonCode?: ManualOperationNotice['reasonCode']
  ) => void
  handleManualRotateBox: (boxId: string, direction?: ManualRotationDirection) => void
  clearanceAnnotations: ClearanceAnnotation[]
  manualDraft: ManualDraft
  autoHelpOpen: boolean
  setAutoHelpOpen: (fn: (current: boolean) => boolean) => void
  visibleAutoBoxes: PlacedBox[]
  activeLabelId: string
  activeLayerId: string
  cogViewState: { boxOpacity: number | null; showOverlay: boolean }
  cogOverlay: CogOverlay | null
  selectedBoxId: string | null
  setSelectedBoxId: (id: string | null) => void
  calculateAndShowPlacement: () => void
  hoverInfo: HoverInfo | null
}
export function VisualizationWorkspace({
  workspaceMaximized,
  setWorkspaceMaximized,
  activeResult,
  formatCubicMeters,
  t,
  placementMode,
  manualKeyboardEnabled,
  setPlacementMode,
  hasCalculated,
  handleContinueManually,
  workspaceView,
  setWorkspaceView,
  planViewMode,
  setPlanViewMode,
  sceneViewMode,
  selectSceneView,
  resetSceneView,
  clearanceEnabled,
  setClearanceEnabled,
  exportCurrentView,
  exportCurrentViewDisabled,
  exportCurrentViewDisabledReason,
  containerChangeNotice,
  customContainerLoadFailed,
  locale,
  manualNotice,
  setManualNotice,
  rotationNotice,
  setRotationNotice,
  manualIssues,
  localizeManualIssue,
  manualPool,
  handleManualPoolDragStart,
  handleManualPoolDragEnd,
  handleQuickPlaceCargo,
  manualHelpOpen,
  setManualHelpOpen,
  visibleManualBoxes,
  renderingContainer,
  gridSnap,
  edgeSnap,
  placementSettings,
  manualInvalidBoxIds,
  poolDragInfo,
  loadingStepsActive,
  activeLoadingGroupBoxIds,
  resetViewTick,
  manualSelectedId,
  selectManualBox,
  setHoverInfo,
  handleManualDeleteBox,
  handleManualDropFromPool,
  handleManualMoveBox,
  notifyManualRejected,
  handleManualRotateBox,
  clearanceAnnotations,
  manualDraft,
  autoHelpOpen,
  setAutoHelpOpen,
  visibleAutoBoxes,
  activeLabelId,
  activeLayerId,
  cogViewState,
  cogOverlay,
  selectedBoxId,
  setSelectedBoxId,
  calculateAndShowPlacement,
  hoverInfo,
}: VisualizationWorkspaceProps) {
  return (
    <>
      <div className={`grid grid-cols-5 gap-3 max-xl:grid-cols-2 ${workspaceMaximized ? 'hidden' : ''}`} data-testid="archive-stat-grid">
        <div className="archive-stat"><div className="archive-stat-value">{activeResult.placedCount}</div><div className="archive-stat-key">{t.loaded}</div></div>
        <div className="archive-stat"><div className="archive-stat-value">{Math.round(activeResult.usedWeight)}</div><div className="archive-stat-key">{t.weight}</div></div>
        <div className="archive-stat"><div className="archive-stat-value">{activeResult.weightUtilization.toFixed(1)}%</div><div className="archive-stat-key">{t.weightUse}</div></div>
        <div className="archive-stat"><div className="archive-stat-value">{activeResult.volumeUtilization.toFixed(1)}%</div><div className="archive-stat-key">{t.volumeUse}</div><div className="text-xs text-[#64748b]">{formatCubicMeters(activeResult.usedVolume)}{' / '}{formatCubicMeters(activeResult.containerVolume)}</div></div>
      </div>

      <section
        className="archive-card overflow-hidden"
        data-testid="visual-workspace"
        data-workspace-maximized={workspaceMaximized ? 'true' : 'false'}
      >
        <div className="flex flex-wrap gap-2 border-b border-[#e5e7eb] p-[18px]">
          <button
            className={`archive-tab ${placementMode === 'auto' ? 'active' : ''}`}
            type="button"
            data-testid="placement-mode-auto"
            onClick={() => setPlacementMode('auto')}
          >
            {t.autoMode}
          </button>
          <button
            className={`archive-tab ${placementMode === 'manual' ? 'active' : ''}`}
            type="button"
            data-testid="placement-mode-manual"
            onClick={() => setPlacementMode('manual')}
          >
            {t.manualMode}
          </button>
          {placementMode === 'auto' && hasCalculated && (
            <button
              className="archive-tab"
              type="button"
              data-testid="continue-manually"
              onClick={handleContinueManually}
            >
              {t.continueManually}
            </button>
          )}
          <span className="mx-2 self-center text-[#cbd5e1]">|</span>
          <button className={`archive-tab ${workspaceView === '2d' ? 'active' : ''}`} type="button" onClick={() => setWorkspaceView('2d')}>
            {t.view2d}
          </button>
          <button className={`archive-tab ${workspaceView === '3d' ? 'active' : ''}`} type="button" onClick={() => setWorkspaceView('3d')}>
            {t.view3d}
          </button>
          {workspaceView === '2d' && (
            <>
              {[
                { id: 'top' as const, label: t.topView },
                { id: 'front' as const, label: t.frontView },
                { id: 'side' as const, label: t.sideView },
              ].map((view) => (
                <button className={`archive-tab ${planViewMode === view.id ? 'active' : ''}`} key={view.id} type="button" onClick={() => setPlanViewMode(view.id)}>
                  {view.label}
                </button>
              ))}
            </>
          )}
          {workspaceView === '3d' && (
            <>
              {[
                { id: 'iso' as const, label: t.isoView },
                { id: 'top' as const, label: t.topView },
                { id: 'front' as const, label: t.frontView },
                { id: 'side' as const, label: t.sideView },
              ].map((view) => (
                <button className={`archive-tab ${sceneViewMode === view.id ? 'active' : ''}`} key={view.id} type="button" onClick={() => selectSceneView(view.id)}>
                  {view.label}
                </button>
              ))}
              <button
                className="archive-tab inline-flex items-center gap-2"
                type="button"
                aria-label={t.resetView}
                data-testid="reset-view"
                onClick={resetSceneView}
              >
                <svg aria-hidden="true" className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2">
                  <path d="M3 12a9 9 0 0 1 15.3-6.4L21 8" />
                  <path d="M21 3v5h-5" />
                  <path d="M21 12a9 9 0 0 1-15.3 6.4L3 16" />
                  <path d="M3 21v-5h5" />
                </svg>
                {t.resetView}
              </button>
            </>
          )}
          <button
            className={`archive-tab inline-flex items-center gap-2 ${clearanceEnabled ? 'active' : ''}`}
            type="button"
            aria-pressed={clearanceEnabled}
            data-testid="toggle-clearance"
            onClick={() => setClearanceEnabled((enabled) => !enabled)}
          >
            <svg aria-hidden="true" className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2">
              <path d="M4 17 17 4l3 3L7 20z" />
              <path d="m14 7 3 3" />
              <path d="m11 10 2 2" />
              <path d="m8 13 3 3" />
            </svg>
            {t.clearanceTitle}
          </button>
          {exportCurrentViewDisabled && exportCurrentViewDisabledReason && (
            <span id="visual-export-disabled-reason" className="self-center text-xs text-red-700">{exportCurrentViewDisabledReason}</span>
          )}
          <button className="archive-button success" type="button" onClick={exportCurrentView} aria-describedby={exportCurrentViewDisabled && exportCurrentViewDisabledReason ? 'visual-export-disabled-reason' : undefined} disabled={exportCurrentViewDisabled}>
            {t.exportView}
          </button>
        </div>
        <div
          className={`relative w-full bg-gradient-to-b from-[#eef6ff] to-[#f8fafc] ${
            workspaceView === '3d'
              ? 'min-h-[480px] xl:min-h-[640px] 2xl:min-h-[760px] h-[70vh] xl:h-[78vh]'
              : 'aspect-[16/9] min-h-[420px] max-h-[85vh] xl:min-h-[560px]'
          }`}
          data-testid="visual-workspace-canvas"
        >
          {(containerChangeNotice || customContainerLoadFailed) && (
            <div className="absolute left-6 top-6 z-10 rounded-xl border border-[#facc15] bg-[#fefce8] px-4 py-3 text-sm font-semibold text-[#854d0e]" data-testid="container-change-notice">
              {customContainerLoadFailed
                ? (locale === 'zh' ? '柜型加载失败' : 'Container load failed')
                : containerChangeNotice}
            </div>
          )}
          {placementMode === 'manual' ? (
            <div className="flex h-full w-full flex-col gap-3 p-4" data-testid="manual-workspace" data-workspace-maximized={workspaceMaximized ? 'true' : 'false'}>
              {manualNotice && (
                <div
                  className="rounded-xl border border-[#fbbf24] bg-[#fffbeb] p-3 text-xs font-semibold text-[#92400e]"
                  data-testid="manual-operation-notice"
                >
                  <button
                    className="float-right text-base font-bold leading-none"
                    type="button"
                    aria-label={t.dismissNotice}
                    onClick={() => setManualNotice(null)}
                  >×</button>
                  {manualNotice.message}
                </div>
              )}
              {rotationNotice && (
                <div
                  className="rounded-xl border border-[#fbbf24] bg-[#fffbeb] p-3 text-xs font-semibold text-[#92400e]"
                  data-testid="rotation-notice"
                >
                  <button
                    className="float-right text-base font-bold leading-none"
                    type="button"
                    aria-label={t.dismissNotice}
                    onClick={() => setRotationNotice('')}
                  >×</button>
                  {rotationNotice}
                </div>
              )}
              {manualIssues.length > 0 && (
                <div
                  className="rounded-xl border border-[#fecaca] bg-[#fef2f2] p-3 text-xs text-[#991b1b]"
                  data-testid="manual-issues"
                >
                  <div className="mb-1 font-semibold">{t.manualIssues} ({manualIssues.length})</div>
                  <ul className="list-inside list-disc space-y-0.5">
                    {manualIssues.slice(0, 10).map((issue, index) => (
                      <li key={`${issue.boxId}-${issue.type}-${index}`}>{localizeManualIssue(issue)}</li>
                    ))}
                  </ul>
                </div>
              )}
              <div className="flex flex-1 gap-3 overflow-hidden">
                <aside
                  className="flex w-56 shrink-0 flex-col gap-2 overflow-auto rounded-xl border border-[#e5e7eb] bg-white p-3"
                  data-testid="manual-pool"
                >
                  <h3 className="text-sm font-bold">{t.placementPool}</h3>
                  {manualPool.every((entry) => entry.remaining === 0) ? (
                    <p className="text-xs text-[#64748b]">{t.poolEmpty}</p>
                  ) : (
                    manualPool.map((entry) => (
                      <div
                        key={entry.cargoId}
                        draggable={entry.remaining > 0}
                        data-testid="manual-pool-item"
                        data-cargo-id={entry.cargoId}
                        data-remaining={entry.remaining}
                        onDragStart={(event) => handleManualPoolDragStart(event, entry.cargoId)}
                        onDragEnd={handleManualPoolDragEnd}
                        className={`flex flex-col gap-1 rounded-lg border p-2 text-xs ${
                          entry.remaining > 0
                            ? 'cursor-grab border-[#c9c9c9] bg-white'
                            : 'cursor-not-allowed border-[#e5e7eb] bg-[#f1f5f9] opacity-60'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <span className="grid h-5 w-5 shrink-0 place-items-center rounded bg-[#222] text-[10px] text-white">{entry.label}</span>
                          <span className="h-3 w-3 shrink-0" style={{ backgroundColor: entry.color }} />
                          <span className="ml-auto font-semibold">{t.poolRemaining}: {entry.remaining}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="min-w-0 flex-1 text-[#64748b]">{entry.length} x {entry.width} x {entry.height} mm</span>
                          <button
                            className="inline-grid h-7 w-7 shrink-0 place-items-center rounded border border-[#cbd5e1] bg-[#f8fafc] text-sm font-bold text-[#0f172a] hover:bg-[#e0f2fe] disabled:cursor-not-allowed disabled:opacity-40"
                            type="button"
                            aria-label={t.quickPlace}
                            title={t.quickPlace}
                            data-testid={`pool-quick-place-${entry.cargoId}`}
                            disabled={entry.remaining <= 0}
                            onClick={(event) => {
                              event.stopPropagation()
                              handleQuickPlaceCargo(entry.cargoId)
                            }}
                          >
                            →
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </aside>
                <div className="relative flex-1 overflow-hidden rounded-xl border border-[#e5e7eb] bg-white" data-testid="manual-view-container">
                  <button
                    className={`archive-tab absolute right-3 top-3 z-30 inline-flex items-center gap-2 bg-white/95 shadow-lg ${workspaceMaximized ? 'active' : ''}`}
                    type="button"
                    data-testid="maximize-workspace"
                    aria-pressed={workspaceMaximized}
                    onClick={() => setWorkspaceMaximized((current) => !current)}
                  >
                    {workspaceMaximized ? t.restoreManual : t.maximizeManual}
                  </button>
                  <div className="absolute left-3 top-3 z-30">
                    <button
                      className="archive-tab bg-white/95 shadow-lg"
                      type="button"
                      aria-expanded={manualHelpOpen}
                      data-testid="manual-keyboard-help"
                      onClick={() => setManualHelpOpen((current) => !current)}
                    >
                      {t.manualKeyboardHelp}
                    </button>
                    {manualHelpOpen && (
                      <div
                        className="mt-2 w-72 rounded-lg border border-[#cbd5e1] bg-white p-3 text-xs text-[#334155] shadow-xl"
                        data-testid="manual-keyboard-help-popover"
                      >
                        <ul className="list-inside list-disc space-y-1">
                          {t.manualKeyboardHelpItems.map((item) => (
                            <li key={item}>{item}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                  {workspaceView === '3d' ? (
                    <ContainerScene
                      activeLabelId={'all'}
                      activeLayerId={'all'}
                      boxes={visibleManualBoxes}
                      container={renderingContainer}
                      gridSnap={gridSnap}
                      edgeSnap={edgeSnap}
                      placementSettings={placementSettings}
                      invalidBoxIds={manualInvalidBoxIds}
                      manualEditable
                      manualKeyboardEnabled={manualKeyboardEnabled}
                      poolDragInfo={poolDragInfo}
                      highlightBoxIds={loadingStepsActive ? activeLoadingGroupBoxIds : undefined}
                      resetViewTick={resetViewTick}
                      selectedBoxId={manualSelectedId}
                      selectedManualBoxId={manualSelectedId}
                      viewMode={sceneViewMode}
                      onClearSelection={() => selectManualBox(null)}
                      onHoverBox={setHoverInfo}
                      onManualDelete={handleManualDeleteBox}
                      onManualDropFromPool={handleManualDropFromPool}
                      onManualMove={handleManualMoveBox}
                      onManualOperationRejected={(operation, boxId, cargoId) => notifyManualRejected(operation, boxId, cargoId)}
                      onManualRotate={handleManualRotateBox}
                      clearanceEnabled={clearanceEnabled}
                      clearanceAnnotations={clearanceAnnotations}
                      onSelectBox={selectManualBox}
                    />
                  ) : (
                    <ManualPlacement2D
                      container={renderingContainer}
                      draft={manualDraft}
                      selectedBoxId={manualSelectedId}
                      issues={manualIssues}
                      viewMode={planViewMode}
                      placementSettings={placementSettings}
                      onSelectBox={selectManualBox}
                      onMoveBox={handleManualMoveBox}
                      onDropFromPool={handleManualDropFromPool}
                    />
                  )}
                </div>
              </div>
            </div>
          ) : workspaceView === '3d' ? (
            <>
              <div className="relative h-full w-full" data-testid="auto-view-container">
                <div className="absolute left-3 top-3 z-30">
                  <button
                    className="archive-tab bg-white/95 shadow-lg"
                    type="button"
                    aria-expanded={autoHelpOpen}
                    data-testid="auto-keyboard-help"
                    onClick={() => setAutoHelpOpen((current) => !current)}
                  >
                    {t.autoKeyboardHelp}
                  </button>
                  {autoHelpOpen && (
                    <div
                      className="mt-2 w-64 rounded-lg border border-[#cbd5e1] bg-white p-3 text-xs text-[#334155] shadow-xl"
                      data-testid="auto-keyboard-help-popover"
                    >
                      <ul className="list-inside list-disc space-y-1">
                        {t.autoKeyboardHelpItems.map((item) => (
                          <li key={item}>{item}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
                <button
                  className={`archive-tab absolute right-3 top-3 z-30 inline-flex items-center gap-2 bg-white/95 shadow-lg ${workspaceMaximized ? 'active' : ''}`}
                  type="button"
                  data-testid="maximize-workspace"
                  aria-pressed={workspaceMaximized}
                  onClick={() => setWorkspaceMaximized((current) => !current)}
                >
                  {workspaceMaximized ? t.restoreManual : t.maximizeManual}
                </button>
                <ContainerScene activeLabelId={activeLabelId} activeLayerId={activeLayerId} boxes={visibleAutoBoxes} boxOpacityOverride={cogViewState.boxOpacity} clearanceAnnotations={clearanceAnnotations} clearanceEnabled={clearanceEnabled} cogOverlay={cogOverlay} container={renderingContainer} edgeSnap={edgeSnap} gridSnap={gridSnap} highlightBoxIds={loadingStepsActive ? activeLoadingGroupBoxIds : undefined} placementSettings={placementSettings} resetViewTick={resetViewTick} selectedBoxId={selectedBoxId} viewMode={sceneViewMode} onHoverBox={setHoverInfo} onSelectBox={setSelectedBoxId} />
              </div>
            </>
          ) : (
            <>
              <div className="relative h-full w-full" data-testid="auto-view-container">
                <button
                  className={`archive-tab absolute right-3 top-3 z-30 inline-flex items-center gap-2 bg-white/95 shadow-lg ${workspaceMaximized ? 'active' : ''}`}
                  type="button"
                  data-testid="maximize-workspace"
                  aria-pressed={workspaceMaximized}
                  onClick={() => setWorkspaceMaximized((current) => !current)}
                >
                  {workspaceMaximized ? t.restoreManual : t.maximizeManual}
                </button>
                <ContainerPlan2D activeLabelId={activeLabelId} activeLayerId={activeLayerId} boxes={visibleAutoBoxes} container={renderingContainer} highlightBoxIds={loadingStepsActive ? activeLoadingGroupBoxIds : undefined} mode={planViewMode} selectedBoxId={selectedBoxId} onSelectBox={setSelectedBoxId} />
              </div>
            </>
          )}
          <button
            className="archive-button success absolute bottom-6 right-6"
            type="button"
            onClick={calculateAndShowPlacement}
          >
            {t.load}
          </button>
          {hoverInfo && (
            <div
              className="pointer-events-none fixed z-50 rounded-lg border border-[#1e293b] bg-[#0f172a] px-3 py-2 text-xs text-white shadow-xl"
              style={{ left: hoverInfo.clientX + 12, top: hoverInfo.clientY + 12 }}
              data-testid="hover-tooltip"
            >
              <div className="font-bold">{t.hoverTooltipLabel}: {hoverInfo.label}</div>
              <div>{t.hoverTooltipSize}: {hoverInfo.length} × {hoverInfo.width} × {hoverInfo.height} mm</div>
              <div>{t.hoverTooltipOrientation}: {hoverInfo.orientationKey}</div>
              <div>{t.hoverTooltipPosition}: ({Math.round(hoverInfo.x)}, {Math.round(hoverInfo.y)}, {Math.round(hoverInfo.z)})</div>
            </div>
          )}
        </div>
      </section>
    </>
  )
}

