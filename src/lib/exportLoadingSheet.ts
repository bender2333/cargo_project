import { jsPDF } from 'jspdf'
import type { ContainerSpec, Locale, PlacedBox } from '../types'
import type { LoadingSheetModel, LoadingSheetStep } from './loadingSheet'
import { renderIsoSnapshot } from './offscreenIsoRenderer'

type ExportLoadingSheetPdfInput = {
  model: LoadingSheetModel
  boxes: PlacedBox[]
  container: ContainerSpec
  locale: Locale
  title?: string
}

const pageWidth = 297
const pageHeight = 210
const margin = 10
const cardGap = 6
const cardColumns = 2
const cardRows = 3
const cardWidth = (pageWidth - margin * 2 - cardGap) / cardColumns
const cardHeight = (pageHeight - margin * 2 - cardGap * 2) / cardRows

const copy = {
  en: {
    title: 'Loading work sheet',
    legend: 'Material legend',
    summary: 'Summary',
    placed: 'Placed',
    total: 'Total',
    weight: 'Weight',
    volumeUse: 'Volume use',
    loadedLength: 'Loaded length',
    dimensions: 'Dimensions',
    step: 'Step',
    newCargo: 'New cargo',
    noSteps: 'No loading steps',
  },
  zh: {
    title: '装柜作业分解图',
    legend: '物料清单图例',
    summary: '整柜汇总',
    placed: '已装',
    total: '总数',
    weight: '重量',
    volumeUse: '容积利用率',
    loadedLength: '装载长度',
    dimensions: '尺寸',
    step: '步骤',
    newCargo: '本步装入',
    noSteps: '暂无装柜步骤',
  },
} satisfies Record<Locale, Record<string, string>>

type PdfImageOverlay = {
  imageData: string
  x: number
  y: number
  width: number
  height: number
}

type RenderedPage = {
  canvas: HTMLCanvasElement
  overlays: PdfImageOverlay[]
}

function drawText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, options: { size?: number; bold?: boolean; color?: string; align?: CanvasTextAlign } = {}) {
  ctx.fillStyle = options.color ?? '#0f172a'
  ctx.font = `${options.bold ? '700' : '500'} ${options.size ?? 22}px Arial, sans-serif`
  ctx.textAlign = options.align ?? 'left'
  ctx.textBaseline = 'middle'
  ctx.fillText(text, x, y)
}

function makeCanvas(width: number, height: number) {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas context is not available')
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, width, height)
  return { canvas, ctx }
}

function pdfImageFromCanvas(canvas: HTMLCanvasElement) {
  return canvas.toDataURL('image/png')
}

function drawBoxPlan(ctx: CanvasRenderingContext2D, input: {
  boxes: PlacedBox[]
  newBoxIds: Set<string>
  container: ContainerSpec
  x: number
  y: number
  width: number
  height: number
}) {
  const scale = Math.min(input.width / input.container.length, input.height / input.container.width)
  const planWidth = input.container.length * scale
  const planHeight = input.container.width * scale
  const ox = input.x + (input.width - planWidth) / 2
  const oy = input.y + (input.height - planHeight) / 2

  ctx.fillStyle = '#f8fafc'
  ctx.fillRect(ox, oy, planWidth, planHeight)
  ctx.strokeStyle = '#334155'
  ctx.lineWidth = 3
  ctx.strokeRect(ox, oy, planWidth, planHeight)

  for (const box of input.boxes) {
    const highlighted = input.newBoxIds.has(box.id)
    ctx.globalAlpha = highlighted ? 0.95 : 0.25
    ctx.fillStyle = highlighted ? box.color : '#334155'
    const x = ox + box.x * scale
    const y = oy + planHeight - (box.y + box.width) * scale
    const width = Math.max(2, box.length * scale)
    const height = Math.max(2, box.width * scale)
    ctx.fillRect(x, y, width, height)
    ctx.globalAlpha = 1
    ctx.strokeStyle = highlighted ? '#f59e0b' : '#64748b'
    ctx.lineWidth = highlighted ? 3 : 1
    ctx.strokeRect(x, y, width, height)
    if (highlighted && width > 20 && height > 16) {
      drawText(ctx, box.label, x + width / 2, y + height / 2, { size: Math.min(28, Math.max(14, Math.min(width, height) * 0.55)), bold: true, align: 'center' })
    }
  }
}

function addCanvasPage(pdf: jsPDF, canvas: HTMLCanvasElement, firstPage: boolean, overlays: PdfImageOverlay[] = []) {
  if (!firstPage) pdf.addPage()
  pdf.addImage(pdfImageFromCanvas(canvas), 'PNG', 0, 0, pageWidth, pageHeight)
  for (const overlay of overlays) {
    pdf.addImage(overlay.imageData, 'PNG', overlay.x, overlay.y, overlay.width, overlay.height)
  }
}

function renderLegendPage(input: ExportLoadingSheetPdfInput) {
  const t = copy[input.locale]
  const { canvas, ctx } = makeCanvas(1800, 1273)
  drawText(ctx, input.title || t.title, 70, 72, { size: 38, bold: true })
  drawText(ctx, `${t.summary}: ${t.placed} ${input.model.legend.summary.placedCount}/${input.model.legend.summary.totalCargoCount} | ${t.weight} ${input.model.legend.summary.totalWeight.toFixed(1)} kg | ${t.volumeUse} ${input.model.legend.summary.volumeUtilization.toFixed(1)}% | ${t.loadedLength} ${Math.round(input.model.legend.summary.loadedLength)} mm`, 70, 130, { size: 23, color: '#334155' })
  drawText(ctx, t.legend, 70, 205, { size: 30, bold: true })

  const columns = [90, 210, 620, 880, 1080, 1320]
  const headerY = 270
  drawText(ctx, 'Label', columns[0], headerY, { size: 20, bold: true })
  drawText(ctx, 'Name', columns[1], headerY, { size: 20, bold: true })
  drawText(ctx, t.total, columns[2], headerY, { size: 20, bold: true })
  drawText(ctx, t.dimensions, columns[3], headerY, { size: 20, bold: true })
  drawText(ctx, t.weight, columns[4], headerY, { size: 20, bold: true })
  drawText(ctx, 'Color', columns[5], headerY, { size: 20, bold: true })

  input.model.legend.rows.forEach((row, index) => {
    const y = headerY + 48 + index * 48
    ctx.fillStyle = index % 2 === 0 ? '#f8fafc' : '#ffffff'
    ctx.fillRect(70, y - 24, 1540, 42)
    ctx.fillStyle = row.color
    ctx.fillRect(columns[5], y - 15, 44, 30)
    drawText(ctx, row.label, columns[0], y, { size: 22, bold: true })
    drawText(ctx, row.name, columns[1], y, { size: 20 })
    drawText(ctx, String(row.count), columns[2], y, { size: 20 })
    drawText(ctx, `${row.length} x ${row.width} x ${row.height} mm`, columns[3], y, { size: 20 })
    drawText(ctx, `${row.weight} kg`, columns[4], y, { size: 20 })
  })
  return canvas
}

function stepSummary(step: LoadingSheetStep) {
  return step.labelSummary.map((item) => `${item.label} x${item.count}`).join(', ')
}

function renderStepsPage(input: ExportLoadingSheetPdfInput, steps: LoadingSheetStep[]): RenderedPage {
  const t = copy[input.locale]
  const { canvas, ctx } = makeCanvas(1800, 1273)
  const px = (value: number) => value * (canvas.width / pageWidth)
  const py = (value: number) => value * (canvas.height / pageHeight)
  const boxesById = new Map(input.boxes.map((box) => [box.id, box]))
  const overlays: PdfImageOverlay[] = []

  steps.forEach((step, index) => {
    const col = index % cardColumns
    const row = Math.floor(index / cardColumns)
    const cardX = margin + col * (cardWidth + cardGap)
    const cardY = margin + row * (cardHeight + cardGap)
    const imageX = cardX + 4
    const imageY = cardY + 9.5
    const imageWidth = cardWidth - 8
    const imageHeight = cardHeight - 18.5
    const x = px(cardX)
    const y = py(cardY)
    const w = px(cardWidth)
    const h = py(cardHeight)
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(x, y, w, h)
    ctx.strokeStyle = '#cbd5e1'
    ctx.lineWidth = 3
    ctx.strokeRect(x, y, w, h)
    drawText(ctx, `${t.step} ${step.sequence}`, x + 24, y + 34, { size: 25, bold: true })
    drawText(ctx, `${t.newCargo}: ${stepSummary(step)}`, x + 24, y + h - 32, { size: 19, color: '#334155' })
    const currentBoxes = step.cumulativeBoxIds.map((id) => boxesById.get(id)).filter((box): box is PlacedBox => !!box)
    const newBoxIds = new Set(step.newBoxIds)
    try {
      ctx.fillStyle = '#f8fafc'
      ctx.fillRect(px(imageX), py(imageY), px(imageWidth), py(imageHeight))
      ctx.strokeStyle = '#e2e8f0'
      ctx.lineWidth = 2
      ctx.strokeRect(px(imageX), py(imageY), px(imageWidth), py(imageHeight))
      overlays.push({
        imageData: renderIsoSnapshot({
          boxes: currentBoxes,
          highlightIds: newBoxIds,
          container: input.container,
          width: Math.round(px(imageWidth)),
          height: Math.round(py(imageHeight)),
        }),
        x: imageX,
        y: imageY,
        width: imageWidth,
        height: imageHeight,
      })
    } catch {
      drawBoxPlan(ctx, {
        boxes: currentBoxes,
        newBoxIds,
        container: input.container,
        x: px(imageX),
        y: py(imageY),
        width: px(imageWidth),
        height: py(imageHeight),
      })
    }
  })

  if (steps.length === 0) {
    drawText(ctx, t.noSteps, canvas.width / 2, canvas.height / 2, { size: 34, bold: true, align: 'center' })
  }
  return { canvas, overlays }
}

export function exportLoadingSheetPdf(input: ExportLoadingSheetPdfInput): Blob {
  const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })
  addCanvasPage(pdf, renderLegendPage(input), true)
  for (let i = 0; i < input.model.steps.length; i += cardColumns * cardRows) {
    const page = renderStepsPage(input, input.model.steps.slice(i, i + cardColumns * cardRows))
    addCanvasPage(pdf, page.canvas, false, page.overlays)
  }
  return pdf.output('blob')
}
