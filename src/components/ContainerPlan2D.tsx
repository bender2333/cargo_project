import type { ContainerSpec, PlacedBox } from '../types'
import { buildBoxLabelModes } from '../lib/labelDeconfliction'
import { faceLabelRotation, orientationAxesOf } from '../lib/orientationTransform'

export type PlanViewMode = 'top' | 'front' | 'side'

type ContainerPlan2DProps = {
  container: ContainerSpec
  boxes: PlacedBox[]
  activeLayerId: string
  activeLabelId: string
  mode: PlanViewMode
  selectedBoxId?: string | null
  highlightBoxIds?: Set<string>
  onSelectBox?: (boxId: string) => void
}

type Projection = {
  x: number
  y: number
  width: number
  height: number
}

const padding = 28

function projectBox(box: PlacedBox, mode: PlanViewMode): Projection {
  if (mode === 'front') {
    return { x: box.x, y: box.z, width: box.length, height: box.height }
  }
  if (mode === 'side') {
    return { x: box.y, y: box.z, width: box.width, height: box.height }
  }
  return { x: box.x, y: box.y, width: box.length, height: box.width }
}

function viewSize(container: ContainerSpec, mode: PlanViewMode) {
  if (mode === 'front') {
    return { width: container.length, height: container.height }
  }
  if (mode === 'side') {
    return { width: container.width, height: container.height }
  }
  return { width: container.length, height: container.width }
}

export function ContainerPlan2D({ container, boxes, activeLayerId, activeLabelId, mode, selectedBoxId, highlightBoxIds, onSelectBox }: ContainerPlan2DProps) {
  const size = viewSize(container, mode)
  const viewBox = `0 0 ${size.width + padding * 2} ${size.height + padding * 2}`
  const labelModes = buildBoxLabelModes({
    boxes,
    projectionMode: mode,
    activeLayerId,
    activeLabelId,
    selectedBoxId,
    highlightBoxIds,
  })

  return (
    <svg className="h-full min-h-[420px] w-full bg-[#d8d8d8]" data-testid="container-plan-2d" role="img" viewBox={viewBox}>
      <rect
        fill="#f5f5f0"
        height={size.height}
        stroke="#555"
        strokeWidth={8}
        width={size.width}
        x={padding}
        y={padding}
      />
      {boxes.map((box) => {
        const projected = projectBox(box, mode)
        const isCurrentLayer = activeLayerId === 'all' || String(box.physicalLayer) === activeLayerId
        const isCurrentLabel = activeLabelId === 'all' || box.label === activeLabelId
        const isHighlighted = highlightBoxIds?.has(box.id) ?? false
        const isSelected = box.id === selectedBoxId
        const opacity = highlightBoxIds
          ? isHighlighted ? 0.94 : 0.16
          : isCurrentLayer && isCurrentLabel ? 0.88 : 0.18
        const textX = padding + projected.x + projected.width / 2
        const textY = padding + size.height - projected.y - projected.height / 2
        const rotation = faceLabelRotation(orientationAxesOf(box), mode)
        const orientationLabel = box.orientationLabel ?? box.orientationKey
        const labelMode = labelModes.get(box.id) ?? 'full'
        const markerWidth = Math.max(110, Math.min(Math.max(110, projected.width - 40), Math.max(280, projected.width * 0.38)))
        const markerHeight = Math.max(70, projected.height * 0.18)
        const markerX = padding + projected.x + 20
        const markerY = padding + size.height - projected.y - projected.height + 20
        const compactLabelX = padding + projected.x + Math.min(92, projected.width * 0.24)
        const compactLabelY = padding + size.height - projected.y - projected.height + Math.min(82, projected.height * 0.22)

        return (
          <g
            data-box-id={box.id}
            data-label-mode={labelMode}
            data-orientation={box.orientationKey}
            data-label-rotation={rotation}
            data-face-label-rotation={rotation}
            data-yaw-quarter-turn={box.yawQuarterTurn ?? 0}
            data-pitch-quarter-turn={box.pitchQuarterTurn ?? 0}
            key={box.id}
            opacity={opacity}
          >
            <rect
              aria-label={`${box.label} ${box.name} ${mode} layer ${box.physicalLayer}`}
              fill={box.color}
              height={projected.height}
              onClick={() => onSelectBox?.(box.id)}
              role="button"
              stroke={isSelected || isHighlighted ? '#f3b21a' : '#222222'}
              strokeWidth={isSelected || isHighlighted ? 14 : 5}
              tabIndex={0}
              width={projected.width}
              x={padding + projected.x}
              y={padding + size.height - projected.y - projected.height}
            />
            {labelMode === 'full' ? (
              <text
                dominantBaseline="middle"
                fill="#111"
                fontSize={Math.max(80, Math.min(projected.width, projected.height) * 0.38)}
                fontWeight="700"
                pointerEvents="none"
                textAnchor="middle"
                transform={`rotate(${rotation} ${textX} ${textY})`}
                x={textX}
                y={textY}
              >
                {box.label}
              </text>
            ) : (
              <g data-testid="plan-compact-label" pointerEvents="none">
                <rect
                  fill="#ffffff"
                  height={58}
                  opacity={0.9}
                  rx={8}
                  stroke="#0f172a"
                  strokeWidth={3}
                  width={58}
                  x={compactLabelX - 29}
                  y={compactLabelY - 29}
                />
                <text
                  dominantBaseline="middle"
                  fill="#0f172a"
                  fontSize={34}
                  fontWeight="800"
                  textAnchor="middle"
                  x={compactLabelX}
                  y={compactLabelY}
                >
                  {box.label}
                </text>
              </g>
            )}
            <g pointerEvents="none" data-testid="plan-orientation-marker" data-orientation={box.orientationKey}>
              <rect
                fill="#0f172a"
                height={markerHeight}
                opacity={0.9}
                rx={14}
                width={markerWidth}
                x={markerX}
                y={markerY}
              />
              <text
                dominantBaseline="middle"
                fill="#fff"
                fontSize={Math.max(28, Math.min(42, markerWidth / 8.8))}
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
