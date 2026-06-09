import type { ContainerSpec, PackingResult } from '../types'
import { buildLoadingTaskGroups, type LoadingTaskGroupLabel } from './loadingTaskGroups'
import { buildPlaybackSequence, visibleBoxesAt } from './playback'

export type LoadingSheetLegendRow = {
  label: string
  color: string
  name: string
  count: number
  length: number
  width: number
  height: number
  weight: number
}

export type LoadingSheetSummary = {
  placedCount: number
  totalCargoCount: number
  totalWeight: number
  usedVolume: number
  containerVolume: number
  volumeUtilization: number
  loadedLength: number
}

export type LoadingSheetStep = {
  sequence: number
  labelSummary: LoadingTaskGroupLabel[]
  cumulativeBoxIds: string[]
  newBoxIds: string[]
}

export type LoadingSheetModel = {
  container: ContainerSpec
  legend: {
    rows: LoadingSheetLegendRow[]
    summary: LoadingSheetSummary
  }
  steps: LoadingSheetStep[]
}

function buildLegendRows(result: PackingResult): LoadingSheetLegendRow[] {
  return result.labelStats
    .filter((stat) => stat.placed > 0)
    .map((stat) => {
      const first = result.placed.find((box) => box.label === stat.label && box.name === stat.name)
        ?? result.placed.find((box) => box.label === stat.label)
      return {
        label: stat.label,
        color: stat.color,
        name: stat.name,
        count: stat.placed,
        length: first?.length ?? 0,
        width: first?.width ?? 0,
        height: first?.height ?? 0,
        weight: first?.weight ?? 0,
      }
    })
}

function loadedLength(result: PackingResult) {
  if (result.placed.length === 0) return 0
  return Math.max(...result.placed.map((box) => box.x + box.length))
}

export function buildLoadingSheetModel(result: PackingResult, container: ContainerSpec): LoadingSheetModel {
  const groups = buildLoadingTaskGroups(result)
  const sequence = buildPlaybackSequence(result)
  const cursorByBoxId = new Map(sequence.steps.map((step, index) => [step.box.id, index + 1]))

  return {
    container,
    legend: {
      rows: buildLegendRows(result),
      summary: {
        placedCount: result.placedCount,
        totalCargoCount: result.totalCargoCount,
        totalWeight: result.usedWeight,
        usedVolume: result.usedVolume,
        containerVolume: result.containerVolume,
        volumeUtilization: result.volumeUtilization,
        loadedLength: loadedLength(result),
      },
    },
    steps: groups.map((group) => {
      const cursor = Math.max(0, ...group.boxIds.map((id) => cursorByBoxId.get(id) ?? 0))
      return {
        sequence: group.sequence,
        labelSummary: group.labels,
        cumulativeBoxIds: visibleBoxesAt(sequence, cursor).map((box) => box.id),
        newBoxIds: group.boxIds,
      }
    }),
  }
}
