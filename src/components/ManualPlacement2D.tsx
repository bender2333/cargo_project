import { useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent, DragEvent as ReactDragEvent } from 'react'
import type { ContainerSpec } from '../types'
import type { ManualDraft, ValidationIssue } from '../lib/manualPlacement'

type ManualPlacement2DProps = {
  container: ContainerSpec
  draft: ManualDraft
  selectedBoxId: string | null
  issues: ValidationIssue[]
  onSelectBox: (id: string | null) => void
  onMoveBox: (id: string, x: number, y: number) => void
  onDropFromPool: (cargoId: string, x: number, y: number) => void
}

const padding = 28

type DragState = {
  boxId: string
  offsetX: number
  offsetY: number
}

function svgPointToMm(
  svg: SVGSVGElement,
  clientX: number,
  clientY: number,
  containerLength: number,
  containerWidth: number,
) {
  const point = svg.createSVGPoint()
  point.x = clientX
  point.y = clientY
  const ctm = svg.getScreenCTM()
  if (!ctm) return { x: 0, y: 0 }
  const transformed = point.matrixTransform(ctm.inverse())

  const xMm = transformed.x - padding
  const yMm = containerWidth - (transformed.y - padding)

  void containerLength
  return { x: xMm, y: yMm }
}

export function ManualPlacement2D({
  container,
  draft,
  selectedBoxId,
  issues,
  onSelectBox,
  onMoveBox,
  onDropFromPool,
}: ManualPlacement2DProps) {
  const svgRef = useRef<SVGSVGElement | null>(null)
  const [dragState, setDragState] = useState<DragState | null>(null)
  const viewBox = `0 0 ${container.length + padding * 2} ${container.width + padding * 2}`

  const issuesByBoxId = new Map<string, ValidationIssue[]>()
  for (const issue of issues) {
    const existing = issuesByBoxId.get(issue.boxId) ?? []
    existing.push(issue)
    issuesByBoxId.set(issue.boxId, existing)
  }

  const handleBackgroundClick = () => {
    onSelectBox(null)
  }

  const handlePointerDown = (event: ReactPointerEvent<SVGGElement>, boxId: string) => {
    event.stopPropagation()
    onSelectBox(boxId)
    const svg = svgRef.current
    if (!svg) return
    const box = draft.boxes.find((b) => b.id === boxId)
    if (!box) return
    const point = svgPointToMm(svg, event.clientX, event.clientY, container.length, container.width)
    setDragState({ boxId, offsetX: point.x - box.x, offsetY: point.y - box.y })
    ;(event.target as Element).setPointerCapture?.(event.pointerId)
  }

  const handlePointerMove = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (!dragState) return
    const svg = svgRef.current
    if (!svg) return
    const point = svgPointToMm(svg, event.clientX, event.clientY, container.length, container.width)
    onMoveBox(dragState.boxId, point.x - dragState.offsetX, point.y - dragState.offsetY)
  }

  const handlePointerUp = () => {
    setDragState(null)
  }

  const handleDragOver = (event: ReactDragEvent<SVGSVGElement>) => {
    event.preventDefault()
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = 'copy'
    }
  }

  const handleDrop = (event: ReactDragEvent<SVGSVGElement>) => {
    event.preventDefault()
    const svg = svgRef.current
    if (!svg) return
    const cargoId = event.dataTransfer?.getData('application/x-cargo-id') ?? event.dataTransfer?.getData('text/plain')
    if (!cargoId) return
    const point = svgPointToMm(svg, event.clientX, event.clientY, container.length, container.width)
    onDropFromPool(cargoId, point.x, point.y)
  }

  return (
    <svg
      ref={svgRef}
      className="h-full min-h-[420px] w-full bg-[#d8d8d8] touch-none"
      data-testid="manual-placement-2d"
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
        height={container.width}
        stroke="#555"
        strokeWidth={8}
        width={container.length}
        x={padding}
        y={padding}
      />
      {draft.boxes.map((box) => {
        const boxIssues = issuesByBoxId.get(box.id) ?? []
        const hasIssue = boxIssues.length > 0
        const isSelected = box.id === selectedBoxId
        const stroke = hasIssue ? '#dc2626' : isSelected ? '#f3b21a' : '#222222'
        const strokeWidth = hasIssue || isSelected ? 14 : 5
        const textX = padding + box.x + box.length / 2
        const textY = padding + container.width - box.y - box.width / 2
        const rotation = box.labelRotationDeg

        return (
          <g
            key={box.id}
            data-box-id={box.id}
            data-has-issue={hasIssue ? 'true' : 'false'}
            onPointerDown={(event) => handlePointerDown(event, box.id)}
            style={{ cursor: 'grab' }}
          >
            <rect
              aria-label={`${box.label} manual placement`}
              fill={box.color}
              opacity={hasIssue ? 0.5 : 0.88}
              height={box.width}
              stroke={stroke}
              strokeWidth={strokeWidth}
              tabIndex={0}
              width={box.length}
              x={padding + box.x}
              y={padding + container.width - box.y - box.width}
            />
            <text
              dominantBaseline="middle"
              fill="#111"
              fontSize={Math.max(80, Math.min(box.length, box.width) * 0.38)}
              fontWeight="700"
              pointerEvents="none"
              textAnchor="middle"
              transform={`rotate(${rotation} ${textX} ${textY})`}
              x={textX}
              y={textY}
            >
              {box.label}
            </text>
          </g>
        )
      })}
    </svg>
  )
}
