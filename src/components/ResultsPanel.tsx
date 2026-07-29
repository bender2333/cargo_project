import type { Ref } from 'react'
import { PlaybackPanel } from './PlaybackPanel'
import { LoadingStepsPanel } from './LoadingStepsPanel'
import { CenterOfGravityPanel } from './CenterOfGravityPanel'
import { ContainerComparisonPanel } from './ContainerComparisonPanel'
import { FillSuggestionPanel } from './FillSuggestionPanel'
import type { Locale, PackingResult, ContainerSpec, PackingDiagnostic, PackingLayer } from '../types'
import type { PlaybackSpeed } from '../hooks/usePlaybackController'
import type { PlaybackController } from '../hooks/usePlaybackController'
import type { PlaybackSequence } from '../lib/playback'
import type { LoadingTaskGroup } from '../lib/loadingTaskGroups'
import type { ExportPlanRow } from '../lib/exportPlan'
import type { ReviewChecklist } from '../lib/reviewChecklist'
import type { CogResult } from '../lib/centerOfGravity'
import type { ContainerComparisonRow } from '../lib/containerCompare'
import type { FillSuggestion } from '../lib/fillSuggestion'
import type { ExportTemplate } from '../types'
import type { VehicleProfileId } from '../data/vehicleProfiles'
import type { ValidationIssue } from '../lib/manualPlacement'
import { isBlockingManualIssue } from '../lib/manualPlacement'
import { formatCubicMeters, getContainerVolume } from '../data/containers'
import { countDistinctLabels } from '../lib/labels'
import { isGapFillBox } from '../lib/placementSource'

type ResultTab = 'layers' | 'details' | 'diagnostics' | 'importLog' | 'playback' | 'loadingSteps' | 'cog' | 'compare' | 'fill' | 'reviewChecklist'

const unplacedReasonMessages: Record<Locale, Record<string, string>> = {
  zh: {
    'exceeds-dimensions': '超出货柜尺寸',
    'exceeds-payload': '超过最大载重',
    'no-space': '没有剩余装载空间',
    'manual-not-placed': '尚未在手动排布中放置',
  },
  en: {
    'exceeds-dimensions': 'Exceeds container dimensions',
    'exceeds-payload': 'Exceeds maximum payload',
    'no-space': 'No remaining loading space',
    'manual-not-placed': 'Not placed in the manual arrangement',
  },
}

function diagnosticMessage(diagnostic: PackingDiagnostic, locale: Locale) {
  if (diagnostic.id.startsWith('unplaced-') && diagnostic.code) {
    const reason = unplacedReasonMessages[locale]?.[diagnostic.code] ?? diagnostic.code
    const params = diagnostic.params ?? {}
    const label = String(params.label ?? '')
    const name = String(params.name ?? '')
    const quantity = String(params.quantity ?? '')
    if (locale === 'zh') {
      return `${label} ${name}：${quantity} 未装入，原因：${reason}。`
    }
    return `${label} ${name}: ${quantity} unplaced because ${reason}.`
  }

  if (locale === 'en') {
    return diagnostic.message
  }

  const zhMessages: Record<string, string> = {
    'boundary-check': diagnostic.severity === 'error'
      ? '边界检查失败：至少一个已装箱体超出有效货柜。'
      : '边界检查通过：所有已装箱体都在有效货柜内。',
    'weight-check': diagnostic.severity === 'error'
      ? '载重检查失败：已装货物超过最大载重。'
      : '载重检查通过：已装货物未超过最大载重。',
    'overlap-check': diagnostic.severity === 'error'
      ? '重叠检查失败：至少一组已装箱体发生重叠。'
      : '重叠检查通过：已装箱体没有互相重叠。',
    'support-check': diagnostic.severity === 'error'
      ? '支撑检查失败：堆叠货物缺少明确支撑。'
      : diagnostic.severity === 'warning'
        ? '支撑检查提醒：部分箱体只有部分支撑。'
        : '支撑检查通过：堆叠箱体都有明确支撑关系。',
    'stacking-check': diagnostic.severity === 'error'
      ? '堆叠检查失败：货物被放在不可堆叠项目上。'
      : '堆叠检查通过：不可堆叠项目未作为支撑使用。',
    'optimization-suggestion': diagnostic.severity === 'warning'
      ? '优化建议：检查未装入货物、柜型、预留间隙、载重限制或堆叠规则。'
      : '优化建议：当前方案没有明显合规阻塞。',
  }
  return zhMessages[diagnostic.id] ?? diagnostic.message
}

function failureReason(reason: string, locale: Locale, reasonCode?: string) {
  if (reasonCode) {
    const translated = unplacedReasonMessages[locale]?.[reasonCode]
    if (translated) return translated
  }

  if (locale === 'en') {
    return reason
  }

  const mapping: Record<string, string> = {
    'Exceeds container dimensions': '超出货柜尺寸',
    'Exceeds maximum payload': '超过最大载重',
    'No remaining loading space': '没有剩余装载空间',
  }

  return mapping[reason] ?? reason
}

function formatDimensions(length: number | '', width: number | '', height: number | '') {
  return length === '' || width === '' || height === '' ? '-' : `${length} x ${width} x ${height}`
}

function layerName(layer: PackingLayer, locale: Locale) {
  return locale === 'zh' ? `第${layer.physicalLayer}层` : `Layer ${layer.physicalLayer}`
}

type ResultsPanelTranslations = {
  results: string
  importExcel: string
  downloadImportTemplate: string
  exportTemplateLoadFailed: string
  exportTemplateRetry: string
  exportTemplateDefault: string
  exportExcel: string
  savePlan: string
  layers: string
  details: string
  diagnostics: string
  importLog: string
  playbackTab: string
  loadingStepsTab: string
  cogTab: string
  compareTab: string
  fillTab: string
  reviewChecklistTab: string
  allLayers: string
  allLabels: string
  labelFilter: string
  previousLayer: string
  nextLayer: string
  layerStats: string
  qty: string
  mixedPlacementGapFill: string
  placementNote: string
  supportedBy: string
  loadingSteps: string
  label: string
  name: string
  originalSize: string
  actualSize: string
  weight: string
  planned: string
  placed: string
  unplacedCount: string
  workStep: string
  failureReason: string
  noFailure: string
  noImportLog: string
  loaded: string
  cargoTypes: string
  volumeUse: string
  weightUse: string
  containerVolume: string
  showLayer: string
  unloaded: string
  reviewChecklistEmpty: string
  reviewChecklistExportJson: string
  reviewChecklistExportExcel: string
}

export type ResultsPanelProps = {
  reportRef: Ref<HTMLElement>
  workspaceMaximized: boolean
  locale: Locale
  t: ResultsPanelTranslations
  activeResultTab: ResultTab
  setActiveResultTab: (tab: ResultTab) => void
  activeResult: PackingResult
  selectedContainer: ContainerSpec
  activeLayerId: string
  setActiveLayerId: (id: string) => void
  activeLabelId: string
  setActiveLabelId: (id: string) => void
  labelOptions: string[]
  activeLayer: PackingLayer | undefined
  visibleBoxes: ReturnType<PackingResult['placed']['filter']>
  activeSelectedBoxId: string | null
  detailRows: ExportPlanRow[]
  importMessages: string[]
  exportTemplates: ExportTemplate[]
  exportTemplateLoadFailed: boolean
  selectedExportTemplateId: string
  setSelectedExportTemplateId: (id: string) => void
  fetchExportTemplates: () => void
  playbackAvailable: boolean
  playback: PlaybackController
  playbackSequence: PlaybackSequence
  loadingStepsAvailable: boolean
  loadingTaskGroups: LoadingTaskGroup[]
  activeLoadingGroupIndex: number
  loadingGroupsPlaying: boolean
  setActiveLoadingGroupIndex: (index: number) => void
  setLoadingGroupsPlaying: (playing: boolean | ((current: boolean) => boolean)) => void
  cogResult: CogResult
  showCogOverlay: boolean
  vehicleProfile: VehicleProfileId
  toggleCogOverlay: (show: boolean) => void
  setVehicleProfile: (id: VehicleProfileId) => void
  compareCandidates: ContainerSpec[]
  compareRows: ContainerComparisonRow[]
  compareSelection: string[]
  setCompareSelection: (fn: (current: string[]) => string[]) => void
  selectContainerById: (id: string) => void
  hasCalculated: boolean
  fillSuggestions: FillSuggestion[]
  handleAddFillCargo: (presetId: string, quantity: number) => void
  handleAddAllFillCargo: (rows: { preset: { id: string }; maxCount: number }[]) => void
  reviewChecklist: ReviewChecklist
  exportReviewChecklistJson: () => void
  exportReviewChecklistExcel: () => void
  selectLayerByOffset: (offset: -1 | 1) => void
  selectStepBox: (boxId: string, layerId: string) => void
  importExcel: (file: File | null) => void
  downloadImportTemplate: () => void
  exportExcel: () => void
  saveCurrentPlan: () => void
  exportPlaybackInstructions: () => void
  exportLoadingSheet: () => void
  displayCargoItemsCount: number
  placementMode: 'auto' | 'manual'
  manualIssues: ValidationIssue[]
  selectManualBox: (id: string | null) => void
  setSelectedBoxId: (id: string | null) => void
}

export function ResultsPanel({
  reportRef,
  workspaceMaximized,
  locale,
  t,
  activeResultTab,
  setActiveResultTab,
  activeResult,
  selectedContainer,
  activeLayerId,
  setActiveLayerId,
  activeLabelId,
  setActiveLabelId,
  labelOptions,
  activeLayer,
  visibleBoxes,
  activeSelectedBoxId,
  detailRows,
  importMessages,
  exportTemplates,
  exportTemplateLoadFailed,
  selectedExportTemplateId,
  setSelectedExportTemplateId,
  fetchExportTemplates,
  playbackAvailable,
  playback,
  playbackSequence,
  loadingStepsAvailable,
  loadingTaskGroups,
  activeLoadingGroupIndex,
  loadingGroupsPlaying,
  setActiveLoadingGroupIndex,
  setLoadingGroupsPlaying,
  cogResult,
  showCogOverlay,
  vehicleProfile,
  toggleCogOverlay,
  setVehicleProfile,
  compareCandidates,
  compareRows,
  compareSelection,
  setCompareSelection,
  selectContainerById,
  hasCalculated,
  fillSuggestions,
  handleAddFillCargo,
  handleAddAllFillCargo,
  reviewChecklist,
  exportReviewChecklistJson,
  exportReviewChecklistExcel,
  selectLayerByOffset,
  selectStepBox,
  importExcel,
  downloadImportTemplate,
  exportExcel,
  saveCurrentPlan,
  exportPlaybackInstructions,
  exportLoadingSheet,
  displayCargoItemsCount,
  placementMode,
  manualIssues,
  selectManualBox,
  setSelectedBoxId,
}: ResultsPanelProps) {
  const layerHasGapFill = (physicalLayer: number) => activeResult.placed.some((box) => box.physicalLayer === physicalLayer && isGapFillBox(box))
  const hasBlockingManualIssues = placementMode === 'manual' && manualIssues.some(isBlockingManualIssue)

  return (
    <section className={`archive-card overflow-hidden ${workspaceMaximized ? 'hidden' : ''}`} ref={reportRef} data-testid="report-panel">
      <div className="border-b border-[#e5e7eb] p-[18px]">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3" data-testid="import-export-toolbar">
          <h2 className="text-lg font-bold">{t.results}</h2>
          <div className="flex flex-wrap gap-2 text-xs">
            <label className="cursor-pointer border border-[#b8b8b8] bg-white px-3 py-2 font-semibold">{t.importExcel}<input className="hidden" accept=".xlsx,.xls,.csv" type="file" onChange={(event) => {
              const file = event.target.files?.[0] ?? null
              event.currentTarget.value = ''
              void importExcel(file)
            }} /></label>
            <button className="border border-[#b8b8b8] bg-white px-3 py-2 font-semibold" data-testid="download-import-template" type="button" onClick={downloadImportTemplate}>{t.downloadImportTemplate}</button>
            {exportTemplateLoadFailed && (
              <div className="flex items-center gap-2 border border-red-300 bg-red-50 px-3 py-2 font-semibold text-red-700" data-testid="export-template-toolbar-load-error">
                <span>{t.exportTemplateLoadFailed}</span>
                <button className="archive-button secondary px-2 py-1 text-xs" type="button" onClick={() => void fetchExportTemplates()}>
                  {t.exportTemplateRetry}
                </button>
              </div>
            )}
            <select
              className="border border-[#b8b8b8] bg-white px-3 py-2 font-semibold"
              value={selectedExportTemplateId}
              data-testid="export-template-select"
              disabled={exportTemplateLoadFailed}
              onChange={(event) => setSelectedExportTemplateId(event.target.value)}
            >
              <option value="">{t.exportTemplateDefault}</option>
              {exportTemplates.map((template) => (
                <option key={template.id} value={template.id}>{template.name}</option>
              ))}
            </select>
            <button className="border border-[#b8b8b8] bg-white px-3 py-2 font-semibold" data-testid="export-excel" type="button" onClick={exportExcel} disabled={hasBlockingManualIssues}>{t.exportExcel}</button>
            <button className="border border-[#9b9b9b] bg-white px-3 py-2 font-semibold" type="button" onClick={saveCurrentPlan} disabled={hasBlockingManualIssues}>{t.savePlan}</button>
          </div>
        </div>
        <div className="flex flex-wrap gap-2 text-sm font-bold">
          {[
            { id: 'layers' as const, label: t.layers },
            { id: 'details' as const, label: t.details },
            { id: 'diagnostics' as const, label: t.diagnostics },
            { id: 'importLog' as const, label: t.importLog },
            { id: 'playback' as const, label: t.playbackTab },
            { id: 'loadingSteps' as const, label: t.loadingStepsTab },
            { id: 'cog' as const, label: t.cogTab },
            { id: 'compare' as const, label: t.compareTab },
            { id: 'fill' as const, label: t.fillTab },
            { id: 'reviewChecklist' as const, label: t.reviewChecklistTab },
          ].map((tab) => (
            <button className={`archive-tab ${activeResultTab === tab.id ? 'active' : ''}`} key={tab.id} type="button" onClick={() => setActiveResultTab(tab.id)}>
              {tab.label}
            </button>
          ))}
        </div>

        {activeResultTab === 'layers' && (
          <div className="mt-3">
            <div className="flex gap-2">
              <select className="w-full border border-[#aaa] bg-white p-2" value={activeLayerId} onChange={(event) => setActiveLayerId(event.target.value)}>
                <option value="all">{t.allLayers}</option>
                {activeResult.layers.map((layer) => <option key={layer.id} value={layer.id}>{layerName(layer, locale)}: {layer.count}</option>)}
              </select>
              <button className="border border-[#b8b8b8] bg-white px-3 py-2 text-xs" type="button" onClick={() => selectLayerByOffset(-1)}>
                {t.previousLayer}
              </button>
              <button className="border border-[#b8b8b8] bg-white px-3 py-2 text-xs" type="button" onClick={() => selectLayerByOffset(1)}>
                {t.nextLayer}
              </button>
            </div>
            <label className="field-label mt-2">{t.labelFilter}
              <select aria-label={t.labelFilter} className="field-input mt-1" value={activeLabelId} onChange={(event) => setActiveLabelId(event.target.value)}>
                <option value="all">{t.allLabels}</option>
                {labelOptions.map((label) => <option key={label} value={label}>{label}</option>)}
              </select>
            </label>
            <div className="mt-2 grid grid-cols-2 gap-2">
              {activeResult.layers.map((layer) => (
                <button className={`border px-2 py-1 text-left text-xs ${activeLayerId === layer.id ? 'border-[#f3b21a] bg-white' : 'border-[#bbb] bg-[#eee]'}`} key={layer.id} type="button" onClick={() => setActiveLayerId(layer.id)}>
                  {layerName(layer, locale)}<br />{Math.round(layer.minZ)}-{Math.round(layer.maxZ)} mm<br />
                  {layer.labels.map((entry) => `${entry.label} x${entry.count}`).join(', ')}
                  {layerHasGapFill(layer.physicalLayer) && <><br />{t.mixedPlacementGapFill}</>}
                </button>
              ))}
            </div>
            {activeLayer && (
              <div className="mt-3 border-t border-[#bebebe] pt-2 text-xs">
                <strong>{t.layerStats}</strong>
                <p>{activeLayer.count} {t.qty}, {activeLayer.weight.toLocaleString()} kg, {formatCubicMeters(activeLayer.volume)}</p>
                <p>{activeLayer.labels.map((entry) => `${entry.label} x${entry.count}`).join(', ')}</p>
                {layerHasGapFill(activeLayer.physicalLayer) && <p>{t.placementNote}: {t.mixedPlacementGapFill}</p>}
                {activeLayer.supportedBy.length > 0 && <p>{t.supportedBy}: {activeLayer.supportedBy.join(', ')}</p>}
              </div>
            )}
            <div className="mt-3 border-t border-[#bebebe] pt-2 text-xs">
              <strong>{t.loadingSteps}</strong>
              <div className="mt-2 max-h-[180px] space-y-1 overflow-auto">
                {activeResult.workSteps.map((step) => {
                  const isSelected = step.boxId === activeSelectedBoxId
                  const box = activeResult.placed.find((entry) => entry.id === step.boxId)
                  return (
                    <button
                      className={`block w-full border px-2 py-1 text-left ${isSelected ? 'border-[#f3b21a] bg-white' : 'border-[#bbb] bg-[#eee]'}`}
                      key={step.boxId}
                      type="button"
                      onClick={() => selectStepBox(step.boxId, String(step.physicalLayer))}
                    >
                      <strong>{step.step}</strong> {step.label} · {step.supportType}
                      {box && <div>{box.name} · {layerName(activeResult.layers.find((layer) => layer.physicalLayer === box.physicalLayer) ?? activeResult.layers[0], locale)}{isGapFillBox(box) ? ` · ${t.mixedPlacementGapFill}` : ''}</div>}
                    </button>
                  )
                })}
              </div>
            </div>
          </div>
        )}

        {activeResultTab === 'details' && (
          <div className="mt-3 max-h-[240px] overflow-auto border border-[#c6c6c6] bg-white">
            <table className="min-w-[760px] text-left text-xs">
              <thead className="sticky top-0 bg-[#eeeeee]">
                <tr>
                  <th className="p-2">{t.label}</th>
                  <th className="p-2">{t.name}</th>
                  <th className="p-2">{t.originalSize}</th>
                  <th className="p-2">{t.actualSize}</th>
                  <th className="p-2">{t.weight}</th>
                  <th className="p-2">{t.planned}</th>
                  <th className="p-2">{t.placed}</th>
                  <th className="p-2">{t.unplacedCount}</th>
                  <th className="p-2">{t.layers}</th>
                  <th className="p-2">{t.workStep}</th>
                  <th className="p-2">{t.placementNote}</th>
                  <th className="p-2">{t.failureReason}</th>
                </tr>
              </thead>
              <tbody>
                {detailRows.map((item) => (
                  <tr className="border-t border-[#dddddd]" key={`${item.label}-${item.name}`}>
                    <td className="p-2 font-bold">{item.label}</td>
                    <td className="p-2">{item.name}</td>
                    <td className="p-2">{formatDimensions(item.originalLength, item.originalWidth, item.originalHeight)}</td>
                    <td className="p-2">{formatDimensions(item.actualLength, item.actualWidth, item.actualHeight)}</td>
                    <td className="p-2">{item.weight}</td>
                    <td className="p-2">{item.plannedQuantity}</td>
                    <td className="p-2">{item.placedQuantity}</td>
                    <td className="p-2">{item.unplacedQuantity}</td>
                    <td className="p-2">{item.layer || '-'}</td>
                    <td className="p-2">{item.workStep || '-'}</td>
                    <td className="p-2">{item.placementNote ? t.mixedPlacementGapFill : '-'}</td>
                    <td className="p-2">{item.failureReason ? failureReason(item.failureReason, locale, item.failureReasonCode) : t.noFailure}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {activeResultTab === 'diagnostics' && (
          <div className="mt-3 space-y-2 text-xs">
            {activeResult.diagnostics.map((diagnostic) => (
              <div className="border border-[#c6c6c6] bg-white p-2" key={diagnostic.id}>
                <strong className="uppercase">{diagnostic.severity}</strong>
                <p>{diagnosticMessage(diagnostic, locale)}</p>
              </div>
            ))}
            {activeResult.unplaced.map((item) => (
              <div className="border border-[#d7b7b7] bg-white p-2" key={item.cargoId}>
                <strong>{item.label} {item.name}</strong>
                <p>{t.failureReason}: {failureReason(item.reason || t.noFailure, locale, item.reasonCode)}</p>
              </div>
            ))}
          </div>
        )}

        {activeResultTab === 'importLog' && (
          <div className="mt-3 space-y-2 text-xs" data-testid="import-log-panel">
            {importMessages.length === 0 ? (
              <p className="border border-[#c6c6c6] bg-white p-2">{t.noImportLog}</p>
            ) : (
              importMessages.map((message) => <p className="border border-[#c6c6c6] bg-white p-2" key={message}>{message}</p>)
            )}
          </div>
        )}

        {activeResultTab === 'playback' && (
          <div className="mt-3" data-testid="playback-tab-panel">
            <PlaybackPanel
              available={playbackAvailable}
              cursor={playback.cursor}
              locale={locale}
              playing={playback.playing}
              sequence={playbackSequence}
              speed={playback.speed}
              onCursorChange={playback.setCursor}
              onFinish={playback.finish}
              onReset={playback.reset}
              onSpeedChange={(next: PlaybackSpeed) => playback.setSpeed(next)}
              onTogglePlay={playback.togglePlay}
              onExport={exportPlaybackInstructions}
            />
          </div>
        )}

        {activeResultTab === 'loadingSteps' && (
          <div className="mt-3" data-testid="loading-steps-tab-panel">
            <LoadingStepsPanel
              activeIndex={activeLoadingGroupIndex}
              available={loadingStepsAvailable}
              exportDisabled={!loadingStepsAvailable}
              groups={loadingTaskGroups}
              locale={locale}
              playing={loadingGroupsPlaying}
              onExportPdf={exportLoadingSheet}
              onSelectGroup={(index) => {
                const nextIndex = Math.max(0, Math.min(index, loadingTaskGroups.length - 1))
                const group = loadingTaskGroups[nextIndex]
                setActiveLoadingGroupIndex(nextIndex)
                setLoadingGroupsPlaying(false)
                if (group) {
                  // A stage is a loading wave, but the layer filter is by vertical level,
                  // so take it from the stage's own boxes.
                  const firstBox = activeResult.placed.find((box) => box.id === group.boxIds[0])
                  setActiveLayerId(String(firstBox?.physicalLayer ?? 1))
                  if (placementMode === 'manual') {
                    selectManualBox(group.boxIds[0] ?? null)
                  } else {
                    setSelectedBoxId(group.boxIds[0] ?? null)
                  }
                }
              }}
              onTogglePlay={() => setLoadingGroupsPlaying((current) => !current)}
            />
          </div>
        )}

        {activeResultTab === 'cog' && (
          <div className="mt-3" data-testid="cog-tab-panel">
            <CenterOfGravityPanel
              container={{ length: selectedContainer.length, width: selectedContainer.width, height: selectedContainer.height }}
              locale={locale}
              result={cogResult}
              show3d={showCogOverlay}
              vehicleProfile={vehicleProfile}
              onToggle3d={toggleCogOverlay}
              onVehicleProfileChange={setVehicleProfile}
            />
          </div>
        )}

        {activeResultTab === 'compare' && (
          <div className="mt-3" data-testid="compare-tab-panel">
            <ContainerComparisonPanel
              candidates={compareCandidates}
              hasCargo={displayCargoItemsCount > 0}
              locale={locale}
              rows={compareRows}
              selectedIds={compareSelection}
              onApplyRecommended={selectContainerById}
              onToggleCandidate={(id) => {
                setCompareSelection((current) =>
                  current.includes(id)
                    ? current.filter((entry) => entry !== id)
                    : [...current, id],
                )
              }}
            />
          </div>
        )}

        {activeResultTab === 'fill' && (
          <div className="mt-3" data-testid="fill-tab-panel">
            <FillSuggestionPanel
              available={hasCalculated}
              locale={locale}
              suggestions={fillSuggestions}
              onAdd={handleAddFillCargo}
              onAddAll={handleAddAllFillCargo}
            />
          </div>
        )}

        {activeResultTab === 'reviewChecklist' && (
          <div className="mt-3 space-y-3 text-xs" data-testid="review-checklist-panel">
            <div className="flex flex-wrap items-center gap-2">
              <strong>{t.reviewChecklistTab}: {reviewChecklist.summary.total}</strong>
              <span className="text-[#991b1b]">errors {reviewChecklist.summary.errorCount}</span>
              <span className="text-[#92400e]">warnings {reviewChecklist.summary.warningCount}</span>
              <button className="archive-button ml-auto" type="button" data-testid="export-review-json" onClick={exportReviewChecklistJson}>
                {t.reviewChecklistExportJson}
              </button>
              <button className="archive-button" type="button" data-testid="export-review-excel" onClick={exportReviewChecklistExcel}>
                {t.reviewChecklistExportExcel}
              </button>
            </div>
            {reviewChecklist.items.length === 0 ? (
              <p className="border border-[#c6c6c6] bg-white p-2">{t.reviewChecklistEmpty}</p>
            ) : (
              reviewChecklist.items.map((item) => (
                <div
                  className={`border bg-white p-2 ${item.severity === 'error' ? 'border-[#fecaca]' : item.severity === 'warning' ? 'border-[#fde68a]' : 'border-[#c6c6c6]'}`}
                  key={item.id}
                  data-testid="review-checklist-item"
                  data-source={item.source}
                  data-severity={item.severity}
                >
                  <strong className="uppercase">{item.source} · {item.severity}</strong>
                  <p className="font-semibold">{item.title}</p>
                  <p>{item.detail}</p>
                </div>
              ))
            )}
          </div>
        )}
      </div>
      <div className="m-3 border border-[#c9c9c9] bg-white p-3 text-sm">
        <h2 className="font-bold">{t.results}</h2>
        <p>{t.loaded}: {activeResult.placedCount} / {activeResult.totalCargoCount}</p>
        <p>{t.cargoTypes}: {countDistinctLabels(activeResult.labelStats)}</p>
        <p>{t.volumeUse}: {activeResult.volumeUtilization.toFixed(1)}%</p>
        <p>{t.weightUse}: {activeResult.weightUtilization.toFixed(1)}%</p>
        <p>{t.containerVolume}: {formatCubicMeters(getContainerVolume(selectedContainer))}</p>
        <div className="mt-3 border-t pt-2">
          <strong>{t.showLayer}</strong>
          {visibleBoxes.slice(0, 10).map((box) => (
            <button className={`mt-1 block w-full rounded px-2 py-1 text-left text-xs ${activeSelectedBoxId === box.id ? 'bg-[#fff0bd]' : 'bg-[#f6f6f6]'}`} key={box.id} type="button" onClick={() => selectStepBox(box.id, String(box.physicalLayer))}>
              <b>{box.label}</b> {box.name} #{box.index} x:{Math.round(box.x)} y:{Math.round(box.y)} z:{Math.round(box.z)}
              <br />{layerName(activeResult.layers.find((layer) => layer.physicalLayer === box.physicalLayer) ?? activeResult.layers[0], locale)} · {box.supportType}
            </button>
          ))}
        </div>
        {activeResult.unplaced.length > 0 && (
          <div className="mt-3 border-t pt-2">
            <strong>{t.unloaded}</strong>
            {activeResult.unplaced.map((item) => <p className="text-xs" key={item.cargoId}>{item.name} x {item.quantity}: {failureReason(item.reason, locale, item.reasonCode)}</p>)}
          </div>
        )}
      </div>
    </section>
  )
}
