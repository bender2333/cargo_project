import type { ContainerSpec, Locale, PackingResult } from './types'
import type { ExportPlanRow } from './lib/exportPlan'
import type { ExportTemplate } from './types'
import type { PlaybackSequence } from './lib/playback'
import type { ReviewChecklist } from './lib/reviewChecklist'
import { buildLoadingSheetModel } from './lib/loadingSheet'
import { downloadBlob, filenameSlug } from './workbenchHelpers'

export async function writePackingPlanWorkbook(args: {
  detailRows: ExportPlanRow[]
  exportTemplates: ExportTemplate[]
  selectedExportTemplateId: string
  shipmentName: string
  selectedContainerLabel: string
  loadingMode: string
}) {
  const XLSX = await import('xlsx')
  const { buildExportRowsFromTemplate } = await import('./lib/exportPlan')
  const exportTemplate = args.exportTemplates.find((item) => item.id === args.selectedExportTemplateId)
  const planRows = exportTemplate && exportTemplate.columns.length > 0
    ? buildExportRowsFromTemplate(args.detailRows, exportTemplate.columns)
    : args.detailRows
  const sheet = XLSX.utils.json_to_sheet(planRows)
  const shipmentSheet = XLSX.utils.json_to_sheet([
    {
      shipmentName: args.shipmentName.trim() || 'Untitled shipment',
      container: args.selectedContainerLabel,
      loadingMode: args.loadingMode,
      generatedAt: new Date().toISOString(),
    },
  ])
  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, shipmentSheet, 'Shipment')
  XLSX.utils.book_append_sheet(workbook, sheet, 'Packing Plan')
  const prefix = filenameSlug(args.shipmentName)
  XLSX.writeFile(workbook, `${prefix ? `${prefix}-` : ''}packing-plan.xlsx`)
}

export async function writePlaybackInstructionsWorkbook(args: {
  playbackSequence: PlaybackSequence
  locale: Locale
  shipmentName: string
}) {
  const XLSX = await import('xlsx')
  const rows = args.playbackSequence.steps.map((entry) => {
    const supportLabel = entry.box.supportType === 'floor'
      ? (args.locale === 'zh' ? '地面' : 'floor')
      : entry.box.supportType === 'fully-supported'
        ? (args.locale === 'zh' ? '完全支撑' : 'fully supported')
        : (args.locale === 'zh' ? '部分支撑' : 'partial support')
    return {
      step: entry.step,
      boxId: entry.box.id,
      label: entry.box.label,
      cargoName: entry.box.name,
      x: Math.round(entry.box.x),
      y: Math.round(entry.box.y),
      z: Math.round(entry.box.z),
      length: entry.box.length,
      width: entry.box.width,
      height: entry.box.height,
      orientation: entry.box.orientationKey,
      physicalLayer: entry.box.physicalLayer,
      supportType: supportLabel,
      supportedBy: entry.box.supportedBy.join(','),
    }
  })
  const sheet = XLSX.utils.json_to_sheet(rows)
  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, sheet, 'Loading Steps')
  const prefix = filenameSlug(args.shipmentName)
  XLSX.writeFile(workbook, `${prefix ? `${prefix}-` : ''}loading-instructions.xlsx`)
}

export async function writeLoadingSheetPdf(args: {
  activeResult: PackingResult
  renderingContainer: ContainerSpec
  locale: Locale
  shipmentName: string
  projectName: string
}) {
  const { exportLoadingSheetPdf } = await import('./lib/exportLoadingSheet')
  const model = buildLoadingSheetModel(args.activeResult, args.renderingContainer)
  const prefix = filenameSlug(args.shipmentName)
  const blob = exportLoadingSheetPdf({
    model,
    boxes: args.activeResult.placed,
    container: args.renderingContainer,
    locale: args.locale,
    title: args.shipmentName || args.projectName,
  })
  downloadBlob(blob, `${prefix ? `${prefix}-` : ''}loading-sheet.pdf`)
}

export function writeReviewChecklistJson(args: {
  reviewChecklist: ReviewChecklist
  shipmentName: string
}) {
  const prefix = filenameSlug(args.shipmentName)
  downloadBlob(
    new Blob([JSON.stringify(args.reviewChecklist, null, 2)], { type: 'application/json;charset=utf-8' }),
    `${prefix ? `${prefix}-` : ''}review-checklist.json`,
  )
}

export async function writeReviewChecklistExcel(args: {
  reviewChecklist: ReviewChecklist
  shipmentName: string
}) {
  const XLSX = await import('xlsx')
  const rows = args.reviewChecklist.items.map((item) => ({
    source: item.source,
    severity: item.severity,
    title: item.title,
    detail: item.detail,
    action: item.action ?? '',
    linkedDiagnostics: item.linkedDiagnosticIds?.join(', ') ?? '',
  }))
  const sheet = XLSX.utils.json_to_sheet(rows)
  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, sheet, 'Review Checklist')
  const prefix = filenameSlug(args.shipmentName)
  XLSX.writeFile(workbook, `${prefix ? `${prefix}-` : ''}review-checklist.xlsx`)
}
