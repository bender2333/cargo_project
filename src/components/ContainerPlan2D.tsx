import type { ContainerSpec, PlacedBox } from '../types'

export type PlanViewMode = 'top' | 'front' | 'side'

type ContainerPlan2DProps = {
  container: ContainerSpec
  boxes: PlacedBox[]
  activeLayerId: string
  mode: PlanViewMode
  selectedBoxId?: string | null
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

export function ContainerPlan2D({ container, boxes, activeLayerId, mode, selectedBoxId, onSelectBox }: ContainerPlan2DProps) {
  const size = viewSize(container, mode)
  const viewBox = `0 0 ${size.width + padding * 2} ${size.height + padding * 2}`

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
        const isSelected = box.id === selectedBoxId
        const opacity = isCurrentLayer ? 0.88 : 0.22

        return (
          <g key={box.id} opacity={opacity}>
            <rect
              aria-label={`${box.label} ${box.name} ${mode} layer ${box.physicalLayer}`}
              fill={box.color}
              height={projected.height}
              onClick={() => onSelectBox?.(box.id)}
              role="button"
              stroke={isSelected ? '#f3b21a' : '#222222'}
              strokeWidth={isSelected ? 14 : 5}
              tabIndex={0}
              width={projected.width}
              x={padding + projected.x}
              y={padding + size.height - projected.y - projected.height}
            />
            <text
              dominantBaseline="middle"
              fill="#111"
              fontSize={Math.max(80, Math.min(projected.width, projected.height) * 0.38)}
              fontWeight="700"
              pointerEvents="none"
              textAnchor="middle"
              x={padding + projected.x + projected.width / 2}
              y={padding + size.height - projected.y - projected.height / 2}
            >
              {box.label}
            </text>
          </g>
        )
      })}
    </svg>
  )
}
