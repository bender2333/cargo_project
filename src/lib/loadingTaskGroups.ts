import type { PackingResult, PlacedBox } from '../types'

export type LoadingTaskGroupLabel = {
  label: string
  color: string
  count: number
}

export type LoadingTaskGroup = {
  id: string
  sequence: number
  stepStart: number
  stepEnd: number
  /** Loading wave this stage belongs to (depth from the far wall), not a vertical level. */
  depthLayer: number
  labels: LoadingTaskGroupLabel[]
  boxIds: string[]
  bounds: {
    xMin: number
    xMax: number
    yMin: number
    yMax: number
    zMin: number
    zMax: number
  }
  supportTypes: PlacedBox['supportType'][]
  supportedBy: string[]
  summary: string
}

type GroupDraft = {
  boxes: PlacedBox[]
}

const DEPTH_SEGMENT_MM = 1000
const MAX_LABELS_PER_GROUP = 2

function depthSegment(box: PlacedBox) {
  return Math.floor(box.x / DEPTH_SEGMENT_MM)
}

function assertCompletedDepthLayer(box: PlacedBox): void {
  if (!Number.isFinite(box.depthLayer) || box.depthLayer <= 0) {
    throw new Error(`Placed box ${box.id} has invalid depthLayer`)
  }
}

function shouldStartNewGroup(current: GroupDraft | null, next: PlacedBox) {
  if (!current || current.boxes.length === 0) return false

  const first = current.boxes[0]
  const previous = current.boxes[current.boxes.length - 1]
  const labels = new Set(current.boxes.map((box) => box.label))
  labels.add(next.label)

  // A stage is a run of consecutive work steps the crew performs together, so it breaks
  // on loading wave, depth segment, a gap in the step sequence, or too many labels.
  //
  // It deliberately does *not* break on `supportType`: building one stack means placing
  // a floor box then boxes on top of it, which is a single continuous action. Splitting
  // there fragmented every stack into one-box stages once `supportType` stopped being
  // overwritten by the push-against relation. `supportTypes` is a list precisely because
  // a stage may span floor and stacked boxes.
  return (
    next.depthLayer !== first.depthLayer ||
    depthSegment(next) !== depthSegment(first) ||
    next.workStep !== previous.workStep + 1 ||
    labels.size > MAX_LABELS_PER_GROUP
  )
}

function buildLabels(boxes: PlacedBox[]): LoadingTaskGroupLabel[] {
  const labels = new Map<string, LoadingTaskGroupLabel>()
  for (const box of boxes) {
    const existing = labels.get(box.label)
    if (existing) {
      existing.count += 1
    } else {
      labels.set(box.label, { label: box.label, color: box.color, count: 1 })
    }
  }
  return [...labels.values()]
}

function uniqueSorted<T extends string | number>(values: T[]) {
  return [...new Set(values)].sort((a, b) => String(a).localeCompare(String(b), undefined, { numeric: true }))
}

function toGroup(draft: GroupDraft, sequence: number): LoadingTaskGroup {
  const boxes = draft.boxes
  const stepStart = Math.min(...boxes.map((box) => box.workStep))
  const stepEnd = Math.max(...boxes.map((box) => box.workStep))
  const labels = buildLabels(boxes)
  const xMin = Math.min(...boxes.map((box) => box.x))
  const yMin = Math.min(...boxes.map((box) => box.y))
  const zMin = Math.min(...boxes.map((box) => box.z))
  const xMax = Math.max(...boxes.map((box) => box.x + box.length))
  const yMax = Math.max(...boxes.map((box) => box.y + box.width))
  const zMax = Math.max(...boxes.map((box) => box.z + box.height))

  return {
    id: `group-${sequence}`,
    sequence,
    stepStart,
    stepEnd,
    depthLayer: boxes[0].depthLayer,
    labels,
    boxIds: boxes.map((box) => box.id),
    bounds: { xMin, xMax, yMin, yMax, zMin, zMax },
    supportTypes: uniqueSorted(boxes.map((box) => box.supportType)),
    supportedBy: uniqueSorted(boxes.flatMap((box) => box.supportedBy)),
    summary: labels.map((entry) => `${entry.label} x${entry.count}`).join(', '),
  }
}

export function buildLoadingTaskGroups(result: PackingResult | null | undefined): LoadingTaskGroup[] {
  if (!result || result.placed.length === 0 || result.workSteps.length === 0) return []

  const boxesById = new Map(result.placed.map((box) => [box.id, box]))
  const orderedBoxes = [...result.workSteps]
    .sort((a, b) => a.step - b.step)
    .map((step) => boxesById.get(step.boxId))
    .filter((box): box is PlacedBox => !!box)
  orderedBoxes.forEach(assertCompletedDepthLayer)

  const drafts: GroupDraft[] = []
  let current: GroupDraft | null = null
  for (const box of orderedBoxes) {
    if (shouldStartNewGroup(current, box)) {
      if (current) drafts.push(current)
      current = { boxes: [box] }
    } else if (current) {
      current.boxes.push(box)
    } else {
      current = { boxes: [box] }
    }
  }
  if (current) drafts.push(current)

  return drafts.map((draft, index) => toGroup(draft, index + 1))
}
