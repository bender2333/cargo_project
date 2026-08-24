import { useEffect, useMemo, useRef, useState } from 'react'
import { ContainerScene } from './ContainerScene'
import type { SceneViewMode } from './ContainerScene'
import { ContainerPlan2D } from './ContainerPlan2D'
import type { PlanViewMode } from './ContainerPlan2D'
import { ManualPlacement2D } from './ManualPlacement2D'
import { deriveVisibleWorkspaceBoxes } from '../lib/visibleWorkspaceBoxes'
import { useWorkspaceHotkeys } from '../hooks/useWorkspaceHotkeys'
import type {
  VisualizationWorkspaceProps,
  WorkspaceView,
} from './workspaceProps'

export type { HoverInfo, PlacementMode, VisualizationChrome, VisualizationWorkspaceProps, WorkspaceView } from './workspaceProps'

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}

function filenameSlug(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fff]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

export function VisualizationWorkspace({
  activeResult,
  formatCubicMeters,
  t,
  hasCalculated,
  handleContinueManually,
  exportCurrentViewDisabled,
  exportCurrentViewDisabledReason,
  exportShipmentName,
  onExportView,
  containerChangeNotice,
  customContainerLoadFailed,
  locale,
  calculateAndShowPlacement,
  onChromeChange,
  hotkeysEnabled,
  manual,
  playback,
  render,
  selection,
}: VisualizationWorkspaceProps) {
  const {
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
    automaticPlaced,
    manualPlacedBoxes,
    manualInvalidBoxIds,
    poolDragInfo,
    manualSelectedId,
    selectManualBox,
    setHoverInfo,
    handleManualDeleteBox,
    handleManualDropFromPool,
    handleManualMoveBox,
    notifyManualRejected,
    handleManualRotateBox,
    undoManualPlacement,
    redoManualPlacement,
    clearanceAnnotations,
    manualDraft,
    autoHelpOpen,
    setAutoHelpOpen,
    hoverInfo,
  } = manual
  const {
    playbackActive,
    playbackSequence,
    playbackCursor,
    loadingStepsActive,
    activeLoadingGroupBoxIds,
  } = playback
  const {
    placementMode,
    setPlacementMode,
    renderingContainer,
    gridSnap,
    edgeSnap,
    placementSettings,
  } = render
  const {
    activeLabelId,
    activeLayerId,
    cogViewState,
    cogOverlay,
    selectedBoxId,
    setSelectedBoxId,
  } = selection

  const [workspaceView, setWorkspaceView] = useState<WorkspaceView>('3d')
  const [sceneViewMode, setSceneViewMode] = useState<SceneViewMode>('iso')
  const [planViewMode, setPlanViewMode] = useState<PlanViewMode>('top')
  const [clearanceEnabled, setClearanceEnabled] = useState(false)
  const [workspaceMaximized, setWorkspaceMaximized] = useState(false)
  const [resetViewTick, setResetViewTick] = useState(0)
  const workspaceRef = useRef<HTMLDivElement | null>(null)
  const selectedHotkeyBox = useMemo(() => {
    if (!manualSelectedId) return null
    const box = manualDraft.boxes.find((candidate) => candidate.id === manualSelectedId)
    if (!box) return null
    return { id: box.id, x: box.x, y: box.y, z: box.z }
  }, [manualDraft.boxes, manualSelectedId])

  const { visibleAutoBoxes, visibleManualBoxes } = useMemo(
    () => deriveVisibleWorkspaceBoxes({
      placementMode,
      playbackActive,
      playbackSequence,
      playbackCursor,
      hasCalculated,
      automaticPlaced,
      manualPlacedBoxes,
    }),
    [
      automaticPlaced,
      hasCalculated,
      manualPlacedBoxes,
      placementMode,
      playbackActive,
      playbackCursor,
      playbackSequence,
    ],
  )

  useEffect(() => {
    onChromeChange?.({
      workspaceMaximized,
      workspaceView,
      sceneViewMode,
      planViewMode,
      clearanceEnabled,
    })
  }, [
    clearanceEnabled,
    onChromeChange,
    planViewMode,
    sceneViewMode,
    workspaceMaximized,
    workspaceView,
  ])

  useWorkspaceHotkeys({
    enabled: hotkeysEnabled,
    placementMode,
    workspaceRef,
    selectedBox: selectedHotkeyBox,
    maximized: workspaceMaximized,
    onUndo: undoManualPlacement,
    onRedo: redoManualPlacement,
    onRotate: handleManualRotateBox,
    onDelete: handleManualDeleteBox,
    onMove: handleManualMoveBox,
    onClearSelection: () => selectManualBox(null),
    onToggleClearance: () => setClearanceEnabled((enabled) => !enabled),
    onExitMaximize: () => setWorkspaceMaximized(false),
  })

  const selectSceneView = (view: SceneViewMode) => {
    setSceneViewMode(view)
  }

  const resetSceneView = () => {
    setSceneViewMode('iso')
    setWorkspaceView('3d')
    setResetViewTick((tick) => tick + 1)
  }

  const exportCurrentView = () => onExportView(async () => {
    if (workspaceView === '2d') {
      const selector = placementMode === 'manual'
        ? '[data-testid="manual-placement-2d"]'
        : '[data-testid="container-plan-2d"]'
      const root = document.querySelector('[data-testid="visual-workspace"]')
      const svg = root?.querySelector(selector)
      if (!(svg instanceof SVGSVGElement)) {
        throw new Error('2D plan is not available for export')
      }
      const source = new XMLSerializer().serializeToString(svg)
      const prefix = filenameSlug(exportShipmentName)
      downloadBlob(new Blob([source], { type: 'image/svg+xml;charset=utf-8' }), `${prefix ? `${prefix}-` : ''}packing-plan-${planViewMode}.svg`)
      return
    }

    const root = document.querySelector('[data-testid="visual-workspace"]')
    const canvas = root?.querySelector('canvas')
    if (!(canvas instanceof HTMLCanvasElement)) {
      throw new Error('3D canvas is not available for export')
    }
    await new Promise<void>((resolve, reject) => {
      canvas.toBlob((blob) => {
        if (!blob) {
          reject(new Error('3D canvas export failed'))
          return
        }
        try {
          const prefix = filenameSlug(exportShipmentName)
          downloadBlob(blob, `${prefix ? `${prefix}-` : ''}packing-plan-${sceneViewMode}.png`)
          resolve()
        } catch (error) {
          reject(error)
        }
      }, 'image/png')
    })
  })

  const [hasMounted3d, setHasMounted3d] = useState(workspaceView === '3d')
  useEffect(() => {
    if (workspaceView === '3d') setHasMounted3d(true)
  }, [workspaceView])
  return (
    <div
      ref={workspaceRef}
      tabIndex={hotkeysEnabled ? 0 : undefined}
    >
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
                      poolDragInfo={poolDragInfo}
                      highlightBoxIds={loadingStepsActive ? activeLoadingGroupBoxIds : undefined}
                      resetViewTick={resetViewTick}
                      selectedBoxId={manualSelectedId}
                      selectedManualBoxId={manualSelectedId}
                      viewMode={sceneViewMode}
                      onClearSelection={() => selectManualBox(null)}
                      onHoverBox={setHoverInfo}
                      onManualDropFromPool={handleManualDropFromPool}
                      onManualMove={handleManualMoveBox}
                      onManualOperationRejected={(operation, boxId, cargoId, issues) => notifyManualRejected(operation, boxId, cargoId, issues)}
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
          ) : (
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
              {hasMounted3d && (
                <div className={workspaceView === '3d' ? 'relative h-full w-full' : 'hidden'}>
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
                  <ContainerScene activeLabelId={activeLabelId} activeLayerId={activeLayerId} boxes={visibleAutoBoxes} boxOpacityOverride={cogViewState.boxOpacity} clearanceAnnotations={clearanceAnnotations} clearanceEnabled={clearanceEnabled} cogOverlay={cogOverlay} container={renderingContainer} edgeSnap={edgeSnap} gridSnap={gridSnap} highlightBoxIds={loadingStepsActive ? activeLoadingGroupBoxIds : undefined} placementSettings={placementSettings} renderEnabled={workspaceView === '3d'} resetViewTick={resetViewTick} selectedBoxId={selectedBoxId} viewMode={sceneViewMode} onHoverBox={setHoverInfo} onSelectBox={setSelectedBoxId} />
                </div>
              )}
              <div className={workspaceView === '2d' ? 'relative h-full w-full' : 'hidden'}>
                <ContainerPlan2D activeLabelId={activeLabelId} activeLayerId={activeLayerId} boxes={visibleAutoBoxes} container={renderingContainer} highlightBoxIds={loadingStepsActive ? activeLoadingGroupBoxIds : undefined} mode={planViewMode} selectedBoxId={selectedBoxId} onSelectBox={setSelectedBoxId} />
              </div>
            </div>
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
    </div>
  )
}

