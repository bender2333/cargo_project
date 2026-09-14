import type {
  ContainerSpec,
  ExportTemplate,
} from '../types'
import type { PlaybackController } from '../hooks/usePlaybackController'
import type { PlaybackSequence } from '../lib/playback'
import type { LoadingTaskGroup } from '../lib/loadingTaskGroups'
import type { ReviewChecklist } from '../lib/reviewChecklist'
import type { CogResult } from '../lib/centerOfGravity'
import type { FillSuggestion } from '../lib/fillSuggestion'
import type { VehicleProfileId } from '../data/vehicleProfiles'

export type ResultsPlaybackProps = {
  playbackAvailable: boolean
  playback: PlaybackController
  playbackSequence: PlaybackSequence
}

export type ResultsLoadingStepsProps = {
  loadingStepsAvailable: boolean
  loadingTaskGroups: LoadingTaskGroup[]
  activeLoadingGroupIndex: number
  loadingGroupsPlaying: boolean
  setActiveLoadingGroupIndex: (index: number) => void
  setLoadingGroupsPlaying: (playing: boolean | ((current: boolean) => boolean)) => void
}

export type ResultsCogProps = {
  cogResult: CogResult
  showCogOverlay: boolean
  vehicleProfile: VehicleProfileId
  toggleCogOverlay: (show: boolean) => void
  setVehicleProfile: (id: VehicleProfileId) => void
}

export type ResultsCompareProps = {
  compareCandidates: ContainerSpec[]
  compareSelection: string[]
  setCompareSelection: (fn: (current: string[]) => string[]) => void
  selectContainerById: (id: string) => void
}

export type ResultsFillProps = {
  fillSuggestions: FillSuggestion[]
  handleAddFillCargo: (presetId: string, quantity: number) => void
  handleAddAllFillCargo: (rows: { preset: { id: string }; maxCount: number }[]) => void
}

export type ResultsExportActionsProps = {
  exportTemplates: ExportTemplate[]
  exportTemplateLoadFailed: boolean
  selectedExportTemplateId: string
  setSelectedExportTemplateId: (id: string) => void
  fetchExportTemplates: () => void
  importMessages: string[]
  reviewChecklist: ReviewChecklist
  exportReviewChecklistJson: () => void
  exportReviewChecklistExcel: () => void
  importExcel: (file: File | null) => void
  downloadImportTemplate: () => void
  exportExcel: () => void
  saveCurrentPlan: () => void
  exportPlaybackInstructions: () => void
  exportLoadingSheet: () => void
}

export type ResultsSelectionProps = {
  activeSelectedBoxId: string | null
  selectManualBox: (id: string | null) => void
  setSelectedBoxId: (id: string | null) => void
}
