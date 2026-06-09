import { useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent, DragEvent as ReactDragEvent } from 'react'
import type { ContainerSpec } from '../types'
import type { ManualDraft, ManualPlacedBox, ValidationIssue } from '../lib/manualPlacement'
import { applyManualPlacementSnap } from '../lib/manualPlacementSnap'
import { faceLabelRotation, orientationAxesOf } from '../lib/orientationTransform'
import { DEFAULT_PLACEMENT_SETTINGS, type PlacementSettings } from '../lib/placementSettings'

export type ManualViewMode = 'top' | 'front' | 'side'

type ManualPlacement2DProps = {
  container: ContainerSpec
  draft: ManualDraft
  selectedBoxId: string | null
  issues: ValidationIssue[]
  onSelectBox: (id: string | null) => void
  onMoveBox: (id: string, x: number, y: number) => void
  onDropFromPool: (cargoId: string, x: number, y: number) => void
  viewMode?: ManualViewMode
  placementSettings?: PlacementSettings
}

const padding = 28

type DragState = {
  boxId: string
  offsetX: number
  offsetY: number
}

type Projection = {
  horizontalSpan: number
  verticalSpan: number
  rectX: (box: ManualPlacedBox) => number
  rectY: (box: ManualPlacedBox) => number
  rectWidth: (box: ManualPlacedBox) => number
  rectHeight: (box: ManualPlacedBox) => number
  toMm: (svgX: number, svgY: number) => { x: number; y: number }
  editable: boolean
}

function buildProjection(container: ContainerSpec, viewMode: ManualViewMode): Projection {
  if (viewMode === 'front') {
    return {
      horizontalSpan: container.length,
      verticalSpan: container.height,
      rectX: (box) => padding + box.x,
      rectY: (box) => padding + container.height - box.z - box.height,
      rectWidth: (box) => box.length,
      rectHeight: (box) => box.height,
      toMm: (svgX, svgY) => ({ x: svgX - padding, y: container.height - (svgY - padding) }),
      editable: false,
    }
  }
  if (viewMode === 'side') {
    return {
      horizontalSpan: container.width,
      verticalSpan: container.height,
      rectX: (box) => padding + box.y,
      rectY: (box) => padding + container.height - box.z - box.height,
      rectWidth: (box) => box.width,
      rectHeight: (box) => box.height,
      toMm: (svgX, svgY) => ({ x: svgX - padding, y: container.height - (svgY - padding) }),
      editable: false,
    }
  }
  return {
    horizontalSpan: container.length,
    verticalSpan: container.width,
    rectX: (box) => padding + box.x,
    rectY: (box) => padding + container.width - box.y - box.width,
    rectWidth: (box) => box.length,
    rectHeight: (box) => box.width,
    toMm: (svgX, svgY) => ({ x: svgX - padding, y: container.width - (svgY - padding) }),
    editable: true,
  }
}

function svgPoint(svg: SVGSVGElement, clientX: number, clientY: number) {
  const point = svg.createSVGPoint()
  point.x = clientX
  point.y = clientY
  const ctm = svg.getScreenCTM()
  if (!ctm) return { x: 0, y: 0 }
  const transformed = point.matrixTransform(ctm.inverse())
  return { x: transformed.x, y: transformed.y }
}

export function ManualPlacement2D({
  container,
  draft,
  selectedBoxId,
  issues,
  onSelectBox,
  onMoveBox,
  onDropFromPool,
  viewMode = 'top',
  placementSettings = DEFAULT_PLACEMENT_SETTINGS,
}: ManualPlacement2DProps) {
  const svgRef = useRef<SVGSVGElement | null>(null)
  const [dragState, setDragState] = useState<DragState | null>(null)
  const projection = buildProjection(container, viewMode)
  const viewBox = `0 0 ${projection.horizontalSpan + padding * 2} ${projection.verticalSpan + padding * 2}`
  const labelFace = viewMode === 'side' ? 'side' : viewMode === 'front' ? 'front' : 'top'

  const issuesByBoxId = new Map<string, ValidationIssue[]>()
  for (const issue of issues) {
    const existing = issuesByBoxId.get(issue.boxId) ?? []
    existing.push(issue)
    issuesByBoxId.set(issue.boxId, existing)
  }

  const snapTopViewPoint = (x: number, y: number, box: Pick<ManualPlacedBox, 'id' | 'length' | 'width'>) => {
    if (viewMode !== 'top') return { x, y }
    return applyManualPlacementSnap({
      x,
      y,
      boxSize: { length: box.length, width: box.width },
      others: draft.boxes.filter((other) => other.id !== box.id),
      container,
      settings: placementSettings,
    })
  }

  const handleBackgroundClick = () => {
    onSelectBox(null)
  }

  const handlePointerDown = (event: ReactPointerEvent<SVGGElement>, boxId: string) => {
    event.stopPropagation()
    onSelectBox(boxId)
    if (!projection.editable) return
    const svg = svgRef.current
    if (!svg) return
    const box = draft.boxes.find((b) => b.id === boxId)
    if (!box) return
    const raw = svgPoint(svg, event.clientX, event.clientY)
    const point = projection.toMm(raw.x, raw.y)
    setDragState({ boxId, offsetX: point.x - box.x, offsetY: point.y - box.y })
    ;(event.target as Element).setPointerCapture?.(event.pointerId)
  }

  const handlePointerMove = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (!dragState) return
    if (!projection.editable) return
    const svg = svgRef.current
    if (!svg) return
    const raw = svgPoint(svg, event.clientX, event.clientY)
    const point = projection.toMm(raw.x, raw.y)
    const box = draft.boxes.find((b) => b.id === dragState.boxId)
    if (!box) return
    const snapped = snapTopViewPoint(point.x - dragState.offsetX, point.y - dragState.offsetY, box)
    onMoveBox(dragState.boxId, snapped.x, snapped.y)
  }

  const handlePointerUp = () => {
    setDragState(null)
  }

  const handleDragOver = (event: ReactDragEvent<SVGSVGElement>) => {
    if (!projection.editable) return
    event.preventDefault()
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = 'copy'
    }
  }

  const handleDrop = (event: ReactDragEvent<SVGSVGElement>) => {
    if (!projection.editable) return
    event.preventDefault()
    const svg = svgRef.current
    if (!svg) return
    const cargoId = event.dataTransfer?.getData('application/x-cargo-id') ?? event.dataTransfer?.getData('text/plain')
    if (!cargoId) return
    const raw = svgPoint(svg, event.clientX, event.clientY)
    const point = projection.toMm(raw.x, raw.y)
    const poolSize = JSON.parse(event.dataTransfer?.getData('application/x-cargo-size') || 'null') as { length?: number; width?: number } | null
    if (poolSize?.length && poolSize?.width) {
      const topLeftX = point.x - poolSize.length / 2
      const topLeftY = point.y - poolSize.width / 2
      const snapped = snapTopViewPoint(topLeftX, topLeftY, { id: '__pool__', length: poolSize.length, width: poolSize.width })
      onDropFromPool(cargoId, snapped.x + poolSize.length / 2, snapped.y + poolSize.width / 2)
      return
    }
    onDropFromPool(cargoId, point.x, point.y)
  }

  return (
    <svg
      ref={svgRef}
      className="h-full min-h-[420px] w-full bg-[#d8d8d8] touch-none"
      data-testid="manual-placement-2d"
      data-view-mode={viewMode}
      role="img"
      viewBox={viewBox}
      onClick={handleBackgroundClick}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerLeave={handlePointerUp}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      <rect
        fill="#f5f5f0"
        height={projection.verticalSpan}
        stroke="#555"
        strokeWidth={8}
        width={projection.horizontalSpan}
        x={padding}
        y={padding}
      />
      {draft.boxes.map((box) => {
        const boxIssues = issuesByBoxId.get(box.id) ?? []
        const hasIssue = boxIssues.length > 0
        const isSelected = box.id === selectedBoxId
        const stroke = hasIssue ? '#dc2626' : isSelected ? '#f3b21a' : '#222222'
        const strokeWidth = hasIssue || isSelected ? 14 : 5
        const rectX = projection.rectX(box)
        const rectY = projection.rectY(box)
        const rectWidth = projection.rectWidth(box)
        const rectHeight = projection.rectHeight(box)
        const textX = rectX + rectWidth / 2
        const textY = rectY + rectHeight / 2
        const rotation = faceLabelRotation(orientationAxesOf(box), labelFace)
        const orientationLabel = box.orientationLabel ?? box.orientationKey
        const markerWidth = Math.max(130, Math.min(Math.max(130, rectWidth - 48), Math.max(300, rectWidth * 0.42)))
        const markerHeight = Math.max(90, rectHeight * 0.2)
        const markerX = rectX + 24
        const markerY = rectY + 24

        return (
          <g
            key={box.id}
            data-box-id={box.id}
            data-has-issue={hasIssue ? 'true' : 'false'}
            data-orientation={box.orientationKey}
            data-label-rotation={box.labelRotationDeg}
            data-face-label-rotation={rotation}
            data-yaw-quarter-turn={box.yawQuarterTurn ?? 0}
            data-pitch-quarter-turn={box.pitchQuarterTurn ?? 0}
            onPointerDown={(event) => handlePointerDown(event, box.id)}
            style={{ cursor: projection.editable ? 'grab' : 'pointer' }}
          >
            <rect
              aria-label={`${box.label} manual placement`}
              fill={box.color}
              opacity={hasIssue ? 0.5 : 0.88}
              height={rectHeight}
              stroke={stroke}
              strokeWidth={strokeWidth}
              tabIndex={0}
              width={rectWidth}
              x={rectX}
              y={rectY}
            />
            <text
              dominantBaseline="middle"
              fill="#111"
              fontSize={Math.max(80, Math.min(rectWidth, rectHeight) * 0.38)}
              fontWeight="700"
              pointerEvents="none"
              textAnchor="middle"
              transform={`rotate(${rotation} ${textX} ${textY})`}
              x={textX}
              y={textY}
            >
              {box.label}
            </text>
            <g pointerEvents="none" data-testid="manual-orientation-marker" data-orientation={box.orientationKey}>
              <rect
                fill="#0f172a"
                height={markerHeight}
                opacity={0.9}
                rx={18}
                width={markerWidth}
                x={markerX}
                y={markerY}
              />
              <text
                dominantBaseline="middle"
                fill="#fff"
                fontSize={Math.max(30, Math.min(46, markerWidth / 8.8))}
                fontWeight="800"
                textAnchor="middle"
                x={markerX + markerWidth / 2}
                y={markerY + markerHeight / 2}
              >
                {orientationLabel}
              </text>
            </g>
          </g>
        )
      })}
    </svg>
  )
}
