import { useMemo, useRef, useState, useEffect } from 'react'
import type { FormEvent, DragEvent as ReactDragEvent } from 'react'
import { CargoImportDialog } from './components/CargoImportDialog'
import { buildPlaybackSequence } from './lib/playback'
import { deriveVisibleWorkspaceBoxes } from './lib/visibleWorkspaceBoxes'
import { buildLoadingTaskGroups } from './lib/loadingTaskGroups'
import { usePlaybackController } from './hooks/usePlaybackController'
import { usePackingSession } from './hooks/usePackingSession'
import { useManualPlacementSession } from './hooks/useManualPlacementSession'
import { useHistoryPlans } from './hooks/useHistoryPlans'
import type { HistoryPlan } from './hooks/useHistoryPlans'
import { useCustomCargoLibrary } from './hooks/useCustomCargoLibrary'
import { shouldClearTemplateReference, useTemplateCatalogs } from './hooks/useTemplateCatalogs'
import { selectPackingContainer } from './lib/packingSession'
import { computeCenterOfGravity } from './lib/centerOfGravity'
import { computeRemainingCapacity } from './lib/remainingCapacity'
import { suggestFillItems } from './lib/fillSuggestion'
import { buildStandardCargoItem, STANDARD_BOXES, STANDARD_BOX_MAX_PER_CLICK } from './data/standardBoxes'
import { HistoryPage } from './components/HistoryPage'
import { CargoLibraryPage } from './components/CargoLibraryPage'
import { WorkbenchHeader } from './components/WorkbenchHeader'
import { EditCargoDialog } from './components/EditCargoDialog'
import { CustomContainerDialogHost } from './components/CustomContainerDialogHost'
import { LazyLoadFallback } from './components/LazyLoadFallback'
import { buildCogOverlay } from './lib/cogVisual'
import { DEFAULT_VEHICLE_PROFILE, type VehicleProfileId } from './data/vehicleProfiles'
import type { ResultsPanelHandle, ResultsPanelState } from './components/ResultsPanel'

import type { ManualRotationDirection, OrientationKey, ValidationIssue } from './lib/manualPlacement'
import { containers, effectiveContainer, formatCubicMeters } from './data/containers'
import type { VisualizationChrome } from './components/VisualizationWorkspace'
import { VisualizationWorkspace } from './components/VisualizationWorkspace'
import { buildExportPlanRows } from './lib/exportPlan'
import { createClientId } from './lib/clientId'
import type { ImportCargoRow } from './lib/importCargo'
import { normalizeCargoLabelColors } from './lib/labels'
import {
  deriveClearanceAnnotations,
  measureBoxClearance,
} from './lib/measurement'
import { buildReviewChecklist } from './lib/reviewChecklist'
import { assertPlanCompliant, formatPlanComplianceMessage, getActivePlanCompliance } from './lib/planCompliance'
import {
  assertHistorySnapshotSize,
  buildHistorySnapshot,
  classifyHistoryRestore,
} from './lib/historySnapshot'
import type { ReviewChecklist } from './lib/reviewChecklist'
import { createManualOperationNotice } from './lib/manualFeedback'
import type { ManualOperationNotice } from './lib/manualFeedback'
import {
  loadPlacementSettings,
  savePlacementSettings,
  type PlacementSettings,
} from './lib/placementSettings'
import type { CargoItem, ContainerSpec, LoadingMode, Locale} from './types'
import { readCustomContainers } from './api/customContainers'
import type { User } from './lib/auth'
import { PackingSidebar } from './components/PackingSidebar'
import { DebugPanel } from './components/DebugPanel'
import { buildCargoDebugSnapshot } from './lib/debugSnapshot'
import { ResultsPanel } from './components/ResultsPanel'
import { prepareExcelImport } from './workbenchImport'
import {
  writeLoadingSheetPdf,
  writePackingPlanWorkbook,
  writePlaybackInstructionsWorkbook,
  writeReviewChecklistExcel,
  writeReviewChecklistJson,
} from './workbenchExports'
import { workbenchCopy as copy } from './data/workbenchCopy'
import {
  buildRotationNotice,
  customContainerDefaults,
  defaultProjectName,
  emptyForm,
  emptyPackingResult,
  initialCargo,
  historyPageLabels,
  localizeManualIssue,
  nextLabel,
  workbenchColors as colors,
  type CargoForm,
  type NavTarget,
} from './workbenchHelpers'

type CustomContainerDialogComponent = typeof import('./components/CustomContainerDialog')['CustomContainerDialog']
type TemplateManagerPageComponent = typeof import('./components/TemplateManagerPage')['TemplateManagerPage']
type UserManagementComponent = typeof import('./components/UserManagement')['UserManagement']

type WorkbenchProps = {
  currentUser: User | null
  onLogout: () => void
}

function Workbench({ currentUser, onLogout }: WorkbenchProps) {
  const [locale, setLocale] = useState<Locale>('zh')
  const t = copy[locale]
  const [menuOpen, setMenuOpen] = useState(false)
  const [activeNav, setActiveNav] = useState<NavTarget>('overview')
  const navigationRevisionRef = useRef(0)
  const navigateTo = (target: NavTarget, expectedRevision?: number) => {
    if (expectedRevision !== undefined && navigationRevisionRef.current !== expectedRevision) return false
    navigationRevisionRef.current += 1
    setActiveNav(target)
    return true
  }
  const [TemplateManagerPage, setTemplateManagerPage] = useState<TemplateManagerPageComponent | null>(null)
  const [templateManagerPageLoadFailed, setTemplateManagerPageLoadFailed] = useState(false)
  const [UserManagement, setUserManagement] = useState<UserManagementComponent | null>(null)
  const [userManagementLoadFailed, setUserManagementLoadFailed] = useState(false)
  const [placementSettings, setPlacementSettings] = useState<PlacementSettings>(() => loadPlacementSettings(currentUser?.id ?? null))
  const {
    state: packingSession,
    dispatch: dispatchPackingSession,
    calculate: calculateCurrentPacking,
    restoreHistory,
  } = usePackingSession({
    projectName: defaultProjectName(locale),
    shipmentName: '',
    cargoItems: initialCargo,
    containerSnapshots: [...containers, customContainerDefaults],
    selectedContainerId: containers[0].id,
    loadingMode: 'quantity',
    defaultMaxStackLayers: placementSettings.defaultMaxStackLayers,
    supportPolicy: placementSettings.supportPolicy,
  })
  const {
    projectName,
    shipmentName,
    cargoItems,
    selectedContainerId,
    loadingMode,
    defaultMaxStackLayers,
    automaticResult,
  } = packingSession
  const [form, setForm] = useState<CargoForm>(emptyForm)
  const [editingCargo, setEditingCargo] = useState<CargoItem | null>(null)
  const [editForm, setEditForm] = useState<CargoForm>(emptyForm)
  const hasCalculated = automaticResult !== null
  // --- ResultsPanel owns layer/label/tab selection (Knife 5) ---
  // Workbench reads current values via onStateChange and triggers actions via ref.
  const resultsPanelRef = useRef<ResultsPanelHandle>(null)
  const [resultsPanelState, setResultsPanelState] = useState<ResultsPanelState>({
    activeLayerId: 'all',
    activeLabelId: 'all',
    activeResultTab: 'layers',
    cogViewState: { showOverlay: false, boxOpacity: null },
  })
  const activeLayerId = resultsPanelState.activeLayerId
  const activeLabelId = resultsPanelState.activeLabelId
  const activeResultTab = resultsPanelState.activeResultTab
  const cogViewState = resultsPanelState.cogViewState
  const [snapSettingsOpen, setSnapSettingsOpen] = useState(false)
  const gridSnap = placementSettings.snapEnabled && placementSettings.gridSnapEnabled
  const edgeSnap = placementSettings.snapEnabled && placementSettings.edgeSnapEnabled
  const [hoverInfo, setHoverInfo] = useState<{ id: string; label: string; length: number; width: number; height: number; orientationKey: OrientationKey; x: number; y: number; z: number; clientX: number; clientY: number } | null>(null)
  const [poolDragInfo, setPoolDragInfo] = useState<{ cargoId: string; length: number; width: number; height: number; color: string } | null>(null)
  const [compareSelection, setCompareSelection] = useState<string[]>(() => containers.slice(0, 3).map((c) => c.id))
  const [showCogOverlay, setShowCogOverlay] = useState(false)
  const [vehicleProfile, setVehicleProfile] = useState<VehicleProfileId>(DEFAULT_VEHICLE_PROFILE)
  const [placementSettingsOpen, setPlacementSettingsOpen] = useState(false)
  const [activeLoadingGroupIndex, setActiveLoadingGroupIndex] = useState(0)
  const [loadingGroupsPlaying, setLoadingGroupsPlaying] = useState(false)
  const [manualHelpOpen, setManualHelpOpen] = useState(false)
  const [autoHelpOpen, setAutoHelpOpen] = useState(false)
  const [manualNotice, setManualNotice] = useState<ManualOperationNotice | null>(null)
  const [containerChangeNotice, setContainerChangeNotice] = useState('')
  const [customContainerLoadFailed, setCustomContainerLoadFailed] = useState(false)
  const [rotationNotice, setRotationNotice] = useState('')
  const [visualizationChrome, setVisualizationChrome] = useState<VisualizationChrome>({
    workspaceMaximized: false,
    workspaceView: '3d',
    sceneViewMode: 'iso',
    planViewMode: 'top',
    clearanceEnabled: false,
  })
  const {
    workspaceMaximized,
    workspaceView,
    sceneViewMode,
    planViewMode,
    clearanceEnabled,
  } = visualizationChrome
  // Backend integrated states
  const [customContainers, setCustomContainers] = useState<ContainerSpec[]>([])
  const [showCustomContainerDialog, setShowCustomContainerDialog] = useState(false)
  const [CustomContainerDialog, setCustomContainerDialog] = useState<CustomContainerDialogComponent | null>(null)
  const [customContainerDialogLoadFailed, setCustomContainerDialogLoadFailed] = useState(false)
  const {
    plans: historyPlans,
    loadFailed: historyLoadFailed,
    refresh: refreshHistory,
    save: saveHistory,
    remove: removeHistory,
  } = useHistoryPlans()
  const {
    items: customCargoItems,
    loadFailed: customCargoLoadFailed,
    refresh: refreshCustomCargo,
    create: createCustomCargo,
    update: updateCustomCargo,
    remove: removeCustomCargo,
  } = useCustomCargoLibrary()
  const {
    importTemplates,
    importLoadFailed: importTemplateLoadFailed,
    refreshImportTemplates: fetchImportTemplates,
    createImportTemplate: createImportTemplateRecord,
    updateImportTemplate: updateImportTemplateRecord,
    removeImportTemplate: deleteImportTemplateRecord,
    exportTemplates,
    exportLoadFailed: exportTemplateLoadFailed,
    refreshExportTemplates: fetchExportTemplates,
    createExportTemplate: createExportTemplateRecord,
    updateExportTemplate: updateExportTemplateRecord,
    removeExportTemplate: deleteExportTemplateRecord,
  } = useTemplateCatalogs()
  const [recentErrors, setRecentErrors] = useState<string[]>([])

  useEffect(() => {
    const settings = loadPlacementSettings(currentUser?.id ?? null)
    setPlacementSettings(settings)
    dispatchPackingSession({
      type: 'defaultMaxStackLayersChanged',
      defaultMaxStackLayers: settings.defaultMaxStackLayers,
    })
  }, [currentUser?.id, dispatchPackingSession])

  useEffect(() => {
    savePlacementSettings(currentUser?.id ?? null, placementSettings)
  }, [currentUser?.id, placementSettings])

  useEffect(() => {
    if (typeof window === 'undefined') return
    const originalError = console.error
    const originalWarn = console.warn
    const append = (level: 'error' | 'warn', args: unknown[]) => {
      const text = args.map((arg) => {
        if (arg instanceof Error) return arg.message
        if (typeof arg === 'object') {
          try { return JSON.stringify(arg) } catch { return String(arg) }
        }
        return String(arg)
      }).join(' ')
      setRecentErrors((current) => [...current.slice(-29), `[${level}] ${new Date().toISOString()} ${text}`])
    }
    console.error = (...args: unknown[]) => {
      append('error', args)
      originalError.apply(console, args as [])
    }
    console.warn = (...args: unknown[]) => {
      append('warn', args)
      originalWarn.apply(console, args as [])
    }
    return () => {
      console.error = originalError
      console.warn = originalWarn
    }
  }, [])

  const [importMessages, setImportMessages] = useState<string[]>([])
  const [selectedBoxId, setSelectedBoxId] = useState<string | null>(null)
  const [containerCollapsed, setContainerCollapsed] = useState(false)
  const [rulesCollapsed, setRulesCollapsed] = useState(false)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [draggedCargoId, setDraggedCargoId] = useState<string | null>(null)
  const [showMappingModal, setShowMappingModal] = useState(false)
  const [importRows, setImportRows] = useState<ImportCargoRow[]>([])
  const [selectedExportTemplateId, setSelectedExportTemplateId] = useState('')
  useEffect(() => {
    if (shouldClearTemplateReference(selectedExportTemplateId, exportTemplates, exportTemplateLoadFailed)) {
      setSelectedExportTemplateId('')
    }
  }, [exportTemplateLoadFailed, exportTemplates, selectedExportTemplateId])

  const reportRef = useRef<HTMLElement | null>(null)
  const cargoRef = useRef<HTMLFormElement | null>(null)
  const containerRef = useRef<HTMLElement | null>(null)

  const selectedContainer = selectPackingContainer(packingSession)
  const customContainer = packingSession.containerSnapshots.custom ?? customContainerDefaults

  const fetchCustomContainers = async () => {
    try {
      const nextCustomContainers = await readCustomContainers()
      setCustomContainers(nextCustomContainers)
      setCustomContainerLoadFailed(false)
      // Keep packing session snapshots aligned with library edits.
      // Selected container changes invalidate via containerSnapshotsSynced.
      dispatchPackingSession({
        type: 'containerSnapshotsSynced',
        containers: nextCustomContainers,
      })
    } catch (err) {
      console.error(err)
      setCustomContainerLoadFailed(true)
    }
  }

  useEffect(() => {
    // Let StrictMode cancel its development-only trial mount before requests start.
    const requestTimer = window.setTimeout(() => {
      void fetchCustomContainers()
    }, 0)

    return () => window.clearTimeout(requestTimer)
  }, [])

  // Controlled dynamic import: a failed chunk (typically an old session asking for
  // a hash that no longer exists after a deploy) must degrade to a recoverable
  // in-page state, not reject into the root and blank the whole workbench.
  useEffect(() => {
    if (activeNav !== 'users' || UserManagement) return
    let active = true
    setUserManagementLoadFailed(false)
    void import('./components/UserManagement')
      .then((module) => {
        if (active) setUserManagement(() => module.UserManagement)
      })
      .catch((err) => {
        console.error(err)
        if (active) setUserManagementLoadFailed(true)
      })
    return () => {
      active = false
    }
  }, [activeNav, UserManagement])

  useEffect(() => {
    if (activeNav !== 'template-manager' || TemplateManagerPage) return
    let active = true
    setTemplateManagerPageLoadFailed(false)
    void import('./components/TemplateManagerPage')
      .then((module) => {
        if (active) setTemplateManagerPage(() => module.TemplateManagerPage)
      })
      .catch((err) => {
        console.error(err)
        if (active) setTemplateManagerPageLoadFailed(true)
      })
    return () => {
      active = false
    }
  }, [activeNav, TemplateManagerPage])

  useEffect(() => {
    if (!showCustomContainerDialog || CustomContainerDialog) return
    let active = true
    setCustomContainerDialogLoadFailed(false)
    void import('./components/CustomContainerDialog')
      .then((module) => {
        if (active) setCustomContainerDialog(() => module.CustomContainerDialog)
      })
      .catch((err) => {
        console.error(err)
        if (active) setCustomContainerDialogLoadFailed(true)
      })
    return () => {
      active = false
    }
  }, [showCustomContainerDialog, CustomContainerDialog])

  const renderingContainer = effectiveContainer(selectedContainer)
  const displayCargoItems = useMemo(() => normalizeCargoLabelColors(cargoItems), [cargoItems])
  const automaticDisplayResult = useMemo(
    () => automaticResult ?? emptyPackingResult(selectedContainer, displayCargoItems),
    [automaticResult, displayCargoItems, selectedContainer],
  )
  const {
    mode: placementMode,
    draft: manualDraft,
    selectedId: manualSelectedId,
    pool: manualPool,
    issues: manualIssues,
    blockingInvalidBoxIds: manualInvalidBoxIds,
    placedBoxes: manualPlacedBoxes,
    activeResult,
    setMode: setPlacementMode,
    select: selectManualBox,
    move: moveManualBox,
    drop: dropManualBox,
    quickPlace: quickPlaceManualBox,
    rotate: rotateManualBox,
    deleteBox: deleteManualBox,
    undo: undoManualPlacement,
    redo: redoManualPlacement,
    continueFromAutomatic,
    restoreHistoryDraft,
  } = useManualPlacementSession({
    cargoItems: displayCargoItems,
    container: renderingContainer,
    automaticDisplayResult,
    supportPolicy: placementSettings.supportPolicy,
    defaultMaxStackLayers,
  })
  const detailRows = useMemo(
    () => buildExportPlanRows(displayCargoItems, activeResult, { defaultMaxStackLayers }),
    [activeResult, defaultMaxStackLayers, displayCargoItems],
  )

  const calculateAndShowPlacement = () => {
    calculateCurrentPacking()
    setContainerChangeNotice('')
  }

  const changeSelectedContainer = (container: ContainerSpec, suppressNotice = false) => {
    const changed = container.id !== selectedContainer.id
      || container.label !== selectedContainer.label
      || container.description !== selectedContainer.description
      || container.length !== selectedContainer.length
      || container.width !== selectedContainer.width
      || container.height !== selectedContainer.height
      || container.maxWeight !== selectedContainer.maxWeight
      || container.doorGap !== selectedContainer.doorGap
      || container.topGap !== selectedContainer.topGap
      || container.sideGap !== selectedContainer.sideGap
    if (!changed) return

    if (!suppressNotice && placementMode === 'auto'
      && ((hasCalculated && automaticDisplayResult.placedCount > 0) || containerChangeNotice !== '')) {
      setContainerChangeNotice(t.containerChangedNotice)
    } else {
      setContainerChangeNotice('')
    }
    resultsPanelRef.current?.resetFilters()
    dispatchPackingSession({ type: 'containerChanged', container })
  }

  const selectContainerById = (containerId: string) => {
    const container = customContainers.find((candidate) => candidate.id === containerId)
      ?? packingSession.containerSnapshots[containerId]
    if (container) changeSelectedContainer(container)
  }

  const manualCapacity = useMemo(
    () => computeRemainingCapacity(manualPlacedBoxes, renderingContainer),
    [manualPlacedBoxes, renderingContainer],
  )

  const notifyManualRejected = (
    operation: 'move' | 'drop' | 'rotate' | 'delete',
    boxId?: string,
    cargoId?: string,
    issues?: ValidationIssue[],
    reasonCode?: ManualOperationNotice['reasonCode'],
  ) => {
    setManualNotice(createManualOperationNotice({
      operation,
      boxId,
      cargoId,
      issues,
      reasonCode,
      locale,
    }))
  }

  const handleManualMoveBox = (id: string, x: number, y: number, z?: number) => {
    const command = moveManualBox(id, x, y, z)
    if (!command.ok) {
      notifyManualRejected('move', command.boxId, command.cargoId, command.issues)
      return
    }
    setManualNotice(null)
  }

  const handleManualDropFromPool = (cargoId: string, dropX: number, dropY: number, dropZ?: number) => {
    const command = dropManualBox(cargoId, dropX, dropY, dropZ)
    if (!command.ok) {
      notifyManualRejected(
        'drop',
        command.boxId,
        command.cargoId,
        command.issues,
        command.reason === 'quantity-limit' ? 'quantity-limit' : undefined,
      )
      return
    }
    setManualNotice(null)
  }

  const handleQuickPlaceCargo = (cargoId: string) => {
    const command = quickPlaceManualBox(cargoId)
    if (!command.ok) {
      if (command.reason === 'quantity-limit') {
        notifyManualRejected('drop', undefined, cargoId, undefined, 'quantity-limit')
      } else {
        setManualNotice({
          ...createManualOperationNotice({
            operation: 'drop',
            cargoId,
            reasonCode: 'missing-target',
            locale,
          }),
          operation: 'drop',
          cargoId,
          reasonCode: 'missing-target',
          message: t.quickPlaceNoSpace,
        })
      }
      return
    }
    setManualNotice(null)
  }

  const handleManualPoolDragStart = (event: ReactDragEvent<HTMLDivElement>, cargoId: string) => {
    event.dataTransfer.setData('application/x-cargo-id', cargoId)
    event.dataTransfer.setData('text/plain', cargoId)
    event.dataTransfer.effectAllowed = 'copy'
    const item = displayCargoItems.find((c) => c.id === cargoId)
    if (item) {
      event.dataTransfer.setData('application/x-cargo-size', JSON.stringify({
        length: item.length,
        width: item.width,
        height: item.height,
      }))
      setPoolDragInfo({ cargoId, length: item.length, width: item.width, height: item.height, color: item.color })
    }
  }
  const handleManualPoolDragEnd = () => {
    setPoolDragInfo(null)
  }

  const handleManualRotateBox = (boxId: string, direction: ManualRotationDirection = 'right') => {
    const command = rotateManualBox(boxId, direction)
    if (!command.ok) {
      setRotationNotice(buildRotationNotice({
        ok: false,
        issues: command.issues,
        rotatedBox: command.rotatedBox ?? null,
      }, renderingContainer, locale))
      notifyManualRejected('rotate', command.boxId, command.cargoId, command.issues)
      return
    }
    setRotationNotice('')
    setManualNotice(null)
  }

  const handleManualDeleteBox = (boxId: string) => {
    const command = deleteManualBox(boxId)
    if (!command.ok) {
      notifyManualRejected('delete', command.boxId, command.cargoId, command.issues)
    }
  }

  const handleContinueManually = () => {
    continueFromAutomatic()
    setManualNotice(null)
    setRotationNotice('')
  }

  useEffect(() => {
    resultsPanelRef.current?.resetFilters()
    setHoverInfo(null)
  }, [placementMode])

  useEffect(() => {
    if (!manualNotice) return
    const timer = window.setTimeout(() => setManualNotice(null), 5000)
    return () => window.clearTimeout(timer)
  }, [manualNotice])

  const playbackSequence = useMemo(() => buildPlaybackSequence(activeResult), [activeResult])
  const playbackAvailable = playbackSequence.total > 0
  const playback = usePlaybackController(playbackSequence)
  const playbackActive = playbackAvailable && activeResultTab === 'playback'
  const loadingTaskGroups = useMemo(() => buildLoadingTaskGroups(activeResult), [activeResult])
  const loadingStepsAvailable = loadingTaskGroups.length > 0
  const activeLoadingGroup = loadingTaskGroups[Math.max(0, Math.min(activeLoadingGroupIndex, loadingTaskGroups.length - 1))] ?? null
  const activeLoadingGroupBoxIds = useMemo(() => activeLoadingGroup ? new Set(activeLoadingGroup.boxIds) : undefined, [activeLoadingGroup])
  const loadingStepsActive = loadingStepsAvailable && activeResultTab === 'loadingSteps'
  const { visibleAutoBoxes, visibleManualBoxes } = useMemo(
    () => deriveVisibleWorkspaceBoxes({
      placementMode,
      playbackActive,
      playbackSequence,
      playbackCursor: playback.cursor,
      hasCalculated,
      automaticPlaced: automaticDisplayResult.placed,
      manualPlacedBoxes,
    }),
    [
      automaticDisplayResult.placed,
      hasCalculated,
      manualPlacedBoxes,
      placementMode,
      playback.cursor,
      playbackActive,
      playbackSequence,
    ],
  )

  useEffect(() => {
    setActiveLoadingGroupIndex(0)
    setLoadingGroupsPlaying(false)
  }, [loadingTaskGroups.length])

  useEffect(() => {
    if (!loadingStepsActive) {
      setLoadingGroupsPlaying(false)
      return
    }
    if (!loadingGroupsPlaying) return
    if (activeLoadingGroupIndex >= loadingTaskGroups.length - 1) {
      setLoadingGroupsPlaying(false)
      return
    }
    const timer = window.setTimeout(() => {
      setActiveLoadingGroupIndex((current) => Math.min(current + 1, loadingTaskGroups.length - 1))
    }, 900)
    return () => window.clearTimeout(timer)
  }, [loadingStepsActive, loadingGroupsPlaying, activeLoadingGroupIndex, loadingTaskGroups.length])

  const visibleActiveBoxes = placementMode === 'manual' ? visibleManualBoxes : visibleAutoBoxes
  // Box coordinates live in effective-container space (the packer places inside the
  // reserved gaps), so the geometric centre must come from the same space or the
  // offset is measured against the wrong midpoint.
  const cogResult = useMemo(
    () => computeCenterOfGravity(visibleActiveBoxes.length > 0 ? visibleActiveBoxes : activeResult.placed, renderingContainer),
    [activeResult.placed, renderingContainer, visibleActiveBoxes],
  )
  const cogOverlay = useMemo(
    () => (cogViewState.showOverlay && placementMode === 'auto'
      ? buildCogOverlay(cogResult, renderingContainer, vehicleProfile)
      : null),
    [cogViewState.showOverlay, placementMode, cogResult, renderingContainer, vehicleProfile],
  )
  const toggleCogOverlay = (show: boolean) => {
    setShowCogOverlay(show)
  }

  const compareCandidates = useMemo(() => {
    const allCustom = customContainers.filter((c) => !!c)
    return [...containers, ...allCustom]
  }, [customContainers])
  const fillSuggestions = useMemo(
    () => suggestFillItems(hasCalculated ? automaticDisplayResult : null, selectedContainer),
    [automaticDisplayResult, hasCalculated, selectedContainer],
  )
  const clearanceSelectedBox = useMemo(() => {
    if (placementMode === 'manual') {
      return manualSelectedId ? manualPlacedBoxes.find((box) => box.id === manualSelectedId) ?? null : null
    }
    return selectedBoxId ? visibleAutoBoxes.find((box) => box.id === selectedBoxId) ?? null : null
  }, [manualPlacedBoxes, manualSelectedId, placementMode, selectedBoxId, visibleAutoBoxes])
  const clearanceBoxes = placementMode === 'manual' ? manualPlacedBoxes : visibleAutoBoxes
  const clearanceAnnotations = useMemo(
    () => clearanceEnabled && clearanceSelectedBox
      ? deriveClearanceAnnotations(measureBoxClearance(clearanceSelectedBox, renderingContainer, clearanceBoxes), locale)
      : [],
    [clearanceBoxes, clearanceEnabled, clearanceSelectedBox, locale, renderingContainer],
  )
  const activePlanCompliance = useMemo(
    () => getActivePlanCompliance({ mode: placementMode, result: activeResult, manualIssues, locale }),
    [activeResult, locale, manualIssues, placementMode],
  )
  const planComplianceMessage = formatPlanComplianceMessage(activePlanCompliance, locale)
  const planSaveDisabled = placementMode === 'auto' && !hasCalculated
  const planSaveDisabledReason = planSaveDisabled
    ? (locale === 'zh' ? '请先点击“装箱”生成结果，再保存方案。' : 'Load the packing result before saving.')
    : planComplianceMessage
  const reviewChecklist: ReviewChecklist = useMemo(
    () => buildReviewChecklist({
      result: activeResult,
      measurements: [],
      cog: cogResult,
      locale,
    }),
    [activeResult, cogResult, locale],
  )
  const debugSnapshot = useMemo(
    () => buildCargoDebugSnapshot({
      user: currentUser,
      locale,
      projectName,
      shipmentName,
      placementMode,
      workspaceView,
      sceneViewMode,
      planViewMode,
      activeResultTab,
      activeLayerId,
      activeLabelId,
      selectedContainer,
      effectiveContainer: renderingContainer,
      loadingMode,
      defaultMaxStackLayers,
      cargoItems: displayCargoItems,
      placementSettings,
      hasCalculated,
      automatic: {
        placedBoxes: automaticDisplayResult.placed,
        visibleBoxes: visibleAutoBoxes,
        unplaced: automaticDisplayResult.unplaced,
        diagnostics: automaticDisplayResult.diagnostics,
        layersCount: automaticDisplayResult.layers.length,
        placedCount: automaticDisplayResult.placedCount,
        totalCargoCount: automaticDisplayResult.totalCargoCount,
      },
      activeResult: {
        placedCount: activeResult.placedCount,
        totalCargoCount: activeResult.totalCargoCount,
        layersCount: activeResult.layers.length,
      },
      manual: {
        draft: manualDraft,
        placedBoxes: manualPlacedBoxes,
        pool: manualPool,
        issues: manualIssues,
        invalidBoxIds: Array.from(manualInvalidBoxIds),
        selectedBoxId: manualSelectedId,
        notice: manualNotice,
        capacity: manualCapacity,
      },
      measurements: [],
      ui: {
        gridSnap,
        edgeSnap,
        clearanceEnabled,
        workspaceMaximized,
      },
      historyCount: historyPlans.length,
      recentErrors,
    }),
    [
      activeLabelId,
      activeLayerId,
      activeResultTab,
      activeResult.layers.length,
      activeResult.placedCount,
      activeResult.totalCargoCount,
      automaticDisplayResult.diagnostics,
      automaticDisplayResult.layers.length,
      automaticDisplayResult.placed,
      automaticDisplayResult.placedCount,
      automaticDisplayResult.totalCargoCount,
      automaticDisplayResult.unplaced,
      clearanceEnabled,
      currentUser,
      defaultMaxStackLayers,
      displayCargoItems,
      edgeSnap,
      gridSnap,
      hasCalculated,
      historyPlans.length,
      loadingMode,
      locale,
      manualCapacity,
      manualDraft,
      manualInvalidBoxIds,
      manualIssues,
      manualNotice,
      manualPlacedBoxes,
      manualPool,
      manualSelectedId,
      placementMode,
      placementSettings,
      planViewMode,
      projectName,
      recentErrors,
      renderingContainer,
      sceneViewMode,
      selectedContainer,
      shipmentName,
      visibleAutoBoxes,
      workspaceMaximized,
      workspaceView,
    ],
  )

  const handleAddFillCargo = (presetId: string, quantity: number) => {
    if (quantity <= 0) return
    const preset = STANDARD_BOXES.find((p) => p.id === presetId)
    if (!preset) return
    const clamped = Math.min(quantity, STANDARD_BOX_MAX_PER_CLICK)
    const item = buildStandardCargoItem(preset, clamped, () => createClientId())
    dispatchPackingSession({ type: 'cargoAdded', items: [item] })
  }
  const handleAddAllFillCargo = (rows: { preset: { id: string }; maxCount: number }[]) => {
    let added = 0
    const additions: CargoItem[] = []
    for (const row of rows) {
      if (row.maxCount <= 0) continue
      const preset = STANDARD_BOXES.find((p) => p.id === row.preset.id)
      if (!preset) continue
      const clamped = Math.min(row.maxCount, STANDARD_BOX_MAX_PER_CLICK)
      additions.push(buildStandardCargoItem(preset, clamped, () => createClientId()))
      added += 1
    }
    if (added === 0) return
    dispatchPackingSession({ type: 'cargoAdded', items: additions })
  }
  const labelOptions = [...new Set(activeResult.labelStats.map((item) => item.label))]
  const activeSelectedBoxId = placementMode === 'manual' ? manualSelectedId : selectedBoxId
  const selectCargoResultBox = (cargoId: string) => {
    const boxId = activeResult.placed.find((box) => box.cargoId === cargoId)?.id ?? null
    if (placementMode === 'manual') {
      selectManualBox(boxId)
    } else {
      setSelectedBoxId(boxId)
    }
  }
  const loadingModeLabels: Record<LoadingMode, string> = {
    volume: t.volumeMode,
    weight: t.weightMode,
    quantity: t.quantityMode,
    input: t.inputMode,
  }
  const containerSummary = `${selectedContainer.label} · ${renderingContainer.length.toLocaleString()} x ${renderingContainer.width.toLocaleString()} x ${renderingContainer.height.toLocaleString()} mm`

  const updateNumber = (field: keyof Pick<CargoForm, 'length' | 'width' | 'height' | 'weight' | 'quantity'>, value: string) => {
    setForm((current) => ({ ...current, [field]: Number(value) || 0 }))
  }

  const updateEditNumber = (field: keyof Pick<CargoForm, 'length' | 'width' | 'height' | 'weight' | 'quantity'>, value: string) => {
    setEditForm((current) => ({ ...current, [field]: Number(value) || 0 }))
  }

  const updateMaxStackLayers = (value: string) => {
    const parsed = Math.floor(Number(value) || 0)
    setForm((current) => ({ ...current, maxStackLayers: parsed > 0 ? parsed : undefined }))
  }

  const updateEditMaxStackLayers = (value: string) => {
    const parsed = Math.floor(Number(value) || 0)
    setEditForm((current) => ({ ...current, maxStackLayers: parsed > 0 ? parsed : undefined }))
  }

  const updateDefaultMaxStackLayers = (value: string) => {
    const parsed = Math.floor(Number(value) || 0)
    const defaultMaxStackLayers = parsed > 0 ? parsed : undefined
    setPlacementSettings((current) => ({ ...current, defaultMaxStackLayers }))
    dispatchPackingSession({ type: 'defaultMaxStackLayersChanged', defaultMaxStackLayers })
  }

  const updateContainerNumber = (field: 'length' | 'width' | 'height' | 'maxWeight' | 'doorGap' | 'topGap' | 'sideGap', value: string) => {
    const nextValue = Math.max(0, Number(value) || 0)
    if (selectedContainer[field] === nextValue) return
    if (placementMode === 'auto'
      && ((hasCalculated && automaticDisplayResult.placedCount > 0) || containerChangeNotice !== '')) {
      setContainerChangeNotice(t.containerChangedNotice)
    } else {
      setContainerChangeNotice('')
    }
    resultsPanelRef.current?.resetFilters()
    dispatchPackingSession({ type: 'containerUpdated', field, value: nextValue })
  }

  const addCargo = (event: FormEvent) => {
    event.preventDefault()
    const next: CargoItem = {
      ...form,
      id: createClientId(),
      name: form.name.trim() || `Cargo ${cargoItems.length + 1}`,
      label: (form.label || nextLabel(cargoItems.length)).toUpperCase(),
      quantity: Math.max(1, Math.floor(form.quantity)),
      maxStackLayers: form.stackable ? form.maxStackLayers : undefined,
      groundOnly: form.groundOnly ?? false,
    }
    dispatchPackingSession({ type: 'cargoAdded', items: [next] })
    setForm((current) => ({
      ...current,
      name: `Carton ${nextLabel(cargoItems.length + 2)}`,
      label: nextLabel(cargoItems.length + 1),
      color: colors[(cargoItems.length + 1) % colors.length],
    }))
  }

  const openEditCargo = (cargo: CargoItem) => {
    setEditingCargo(cargo)
    setEditForm({
      name: cargo.name,
      label: cargo.label,
      length: cargo.length,
      width: cargo.width,
      height: cargo.height,
      weight: cargo.weight,
      quantity: cargo.quantity,
      color: cargo.color,
      canRotate: cargo.canRotate,
      stackable: cargo.stackable,
      maxStackLayers: cargo.maxStackLayers,
      groundOnly: cargo.groundOnly ?? false,
    })
  }

  const saveEditedCargo = (event: FormEvent) => {
    event.preventDefault()
    if (!editingCargo) return

    const nextCargo: CargoItem = {
      ...editForm,
      id: editingCargo.id,
      name: editForm.name.trim() || editingCargo.name,
      label: (editForm.label || editingCargo.label || nextLabel(cargoItems.length)).toUpperCase(),
      quantity: Math.max(1, Math.floor(editForm.quantity)),
      maxStackLayers: editForm.stackable ? editForm.maxStackLayers : undefined,
      groundOnly: editForm.groundOnly ?? false,
    }

    dispatchPackingSession({ type: 'cargoEdited', item: nextCargo })
    setEditingCargo(null)
    setSelectedBoxId(null)
  }

  const addLibraryCargoToWorkbench = (item: CargoItem) => {
    dispatchPackingSession({
      type: 'cargoAdded',
      items: [{ ...item, id: createClientId(), quantity: 1 }],
    })
    navigateTo('overview')
  }

  const downloadImportTemplate = async () => {
    const XLSX = await import('xlsx')
    const template = locale === 'zh'
      ? {
          filename: '标准空白货物导入模板.xlsx',
          sheetName: '货物',
          headers: ['标签', '货物名称', '长mm', '宽mm', '高mm', '重量kg', '数量', '颜色', '允许旋转', '允许堆叠', '最大堆叠层数', '必须落地'],
        }
      : {
          filename: 'standard-cargo-import-template.xlsx',
          sheetName: 'Cargo',
          headers: ['Label', 'Name', 'Length mm', 'Width mm', 'Height mm', 'Weight kg', 'Quantity', 'Color', 'Rotate', 'Stackable', 'Max stack layers', 'Ground only'],
        }
    const sheet = XLSX.utils.aoa_to_sheet([template.headers])
    const workbook = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(workbook, sheet, template.sheetName)
    XLSX.writeFile(workbook, template.filename)
  }

  const importExcel = async (file: File | null) => {
    if (!file) return
    const outcome = await prepareExcelImport({ file, locale, t })
    if (outcome.kind === 'messages') {
      setImportMessages(outcome.messages)
      resultsPanelRef.current?.showImportLog()
      navigateTo('report')
      return
    }
    setImportRows(outcome.rows)
    setShowMappingModal(true)
  }

  const runPlanExport = async (operation: () => void | Promise<void>): Promise<void> => {
    try {
      assertPlanCompliant(activePlanCompliance)
      await operation()
    } catch (error) {
      console.error('[plan-export]', error)
      const message = error instanceof Error ? error.message : ''
      alert(message || (locale === 'zh' ? '导出失败' : 'Export failed'))
    }
  }
  const exportExcel = () => runPlanExport(() => writePackingPlanWorkbook({
    detailRows,
    exportTemplates,
    selectedExportTemplateId,
    shipmentName,
    selectedContainerLabel: selectedContainer.label,
    loadingMode,
  }))

  const exportPlaybackInstructions = () => runPlanExport(async () => {
    if (!playbackAvailable) return
    await writePlaybackInstructionsWorkbook({ playbackSequence, locale, shipmentName })
  })

  const exportLoadingSheet = () => runPlanExport(async () => {
    if (!loadingStepsAvailable) return
    await writeLoadingSheetPdf({
      activeResult,
      renderingContainer,
      locale,
      shipmentName,
      projectName,
    })
  })

  const exportReviewChecklistJson = () => runPlanExport(() => {
    writeReviewChecklistJson({ reviewChecklist, shipmentName })
  })

  const exportReviewChecklistExcel = () => runPlanExport(() => writeReviewChecklistExcel({
    reviewChecklist,
    shipmentName,
  }))

  const saveCurrentPlan = async () => {
    const saveStartNavigationRevision = navigationRevisionRef.current
    try {
      if (planSaveDisabled) {
        throw new Error(planSaveDisabledReason || (locale === 'zh' ? '请先点击“装箱”生成结果，再保存方案。' : 'Load the packing result before saving.'))
      }
      assertPlanCompliant(activePlanCompliance)
      const planData = buildHistorySnapshot({
        container: selectedContainer,
        cargoItems: displayCargoItems,
        packingResult: activeResult,
        placementMode,
        defaultMaxStackLayers,
        manualDraft,
        draftInitialized: true,
      })
      assertHistorySnapshotSize(planData)

      await saveHistory({
        projectName,
        shipmentName,
        loadingMode,
        data: planData,
      })
      navigateTo('history', saveStartNavigationRevision)
    } catch (err) {
      console.error(err)
      const message = err instanceof Error && err.message
        ? err.message
        : (locale === 'zh' ? '保存历史方案失败' : 'Failed to save plan')
      alert(message)
    }
  }

  const restorePlan = (plan: HistoryPlan) => {
    const decision = classifyHistoryRestore(plan)
    if (decision.kind === 'invalid') {
      alert(decision.reason)
      return
    }
    if (decision.kind === 'legacy-recompute') {
      const ok = confirm(locale === 'zh'
        ? '该历史记录仅保存了输入模板，将按当前算法重新计算。是否继续？'
        : 'This history record is an input template only and will recompute with the current algorithm. Continue?')
      if (!ok) return
    }

    const data = decision.kind === 'snapshot' ? decision.data : decision.data
    if (!containers.some((container) => container.id === data.containerId)
      && data.containerId !== 'custom'
      && !customContainers.some((container) => container.id === data.containerId)) {
      setCustomContainers((current) => [...current, data.container])
    }

    restoreHistory({
      projectName: plan.projectName || defaultProjectName(locale),
      shipmentName: plan.shipmentName,
      container: data.container,
      cargoItems: data.cargoItems,
      loadingMode: plan.loadingMode || 'quantity',
      defaultMaxStackLayers: data.defaultMaxStackLayers,
      result: decision.kind === 'snapshot' ? decision.data.packingResult : undefined,
    })

    if (decision.kind === 'snapshot' && decision.data.placementMode === 'manual' && decision.data.manualDraft) {
      restoreHistoryDraft({
        draft: decision.data.manualDraft,
        mode: 'manual',
        draftInitialized: decision.data.draftInitialized ?? true,
        cargoItems: decision.data.cargoItems,
        defaultMaxStackLayers: decision.data.defaultMaxStackLayers,
      })
    } else {
      restoreHistoryDraft({
        draft: { boxes: [] },
        mode: 'auto',
        draftInitialized: false,
        cargoItems: data.cargoItems,
        defaultMaxStackLayers: data.defaultMaxStackLayers,
      })
    }

    resultsPanelRef.current?.resetFilters()
    setContainerChangeNotice('')
    setSelectedBoxId(null)
    navigateTo('overview')
  }

  const reorderCargo = (targetCargoId: string) => {
    if (!draggedCargoId || draggedCargoId === targetCargoId) {
      setDraggedCargoId(null)
      return
    }

    dispatchPackingSession({
      type: 'cargoReordered',
      cargoId: draggedCargoId,
      targetCargoId,
    })
    setSelectedBoxId(null)
    setDraggedCargoId(null)
  }

  const deleteCargo = (cargoId: string) => {
    dispatchPackingSession({ type: 'cargoDeleted', cargoId })
    setSelectedBoxId((current) => {
      const selectedBox = automaticDisplayResult.placed.find((box) => box.id === current)
      return selectedBox?.cargoId === cargoId ? null : current
    })
  }

  const activateNav = (target: NavTarget) => {
    navigateTo(target)
    setMenuOpen(false)
    if (target === 'report') {
      resultsPanelRef.current?.activateReport()
      reportRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
    } else if (target === 'cargo') {
      cargoRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
    } else if (target === 'container') {
      containerRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
    }
  }

  const navItems: Array<{ target: NavTarget; label: string }> = [
    { target: 'overview', label: t.nav[0] },
    { target: 'history', label: t.nav[1] },
    { target: 'cargo-library', label: t.nav[2] },
    { target: 'template-manager', label: t.nav[3] },
    ...(currentUser?.role === 'admin' ? [{ target: 'users' as const, label: t.nav[4] }] : []),
  ]

  return (
    <main className="min-h-screen bg-[#f4f7fb] text-[#1f2937]">
      <div className="mx-auto p-5 max-w-[1500px] xl:max-w-[1800px] 2xl:max-w-none 2xl:px-8">
        <WorkbenchHeader
          title={t.title}
          navItems={navItems}
          activeNav={activeNav}
          onNavigate={activateNav}
          currentUser={currentUser}
          locale={locale}
          onLocaleChange={() => setLocale(locale === 'en' ? 'zh' : 'en')}
          onLogout={onLogout}
          workspaceMaximized={workspaceMaximized}
          labels={t}
        />

        {activeNav === 'users' && currentUser?.role === 'admin' ? (
          UserManagement ? (
            <section className="archive-card overflow-hidden p-[18px]" data-testid="users-page">
              <UserManagement onBack={() => activateNav('overview')} />
            </section>
          ) : (
            <LazyLoadFallback
              locale={locale}
              testId="users-page"
              errorTestId="user-management-load-error"
              failed={userManagementLoadFailed}
              loadingText={{ zh: '登录审计加载中...', en: 'Loading login audit...' }}
              errorText={{ zh: '登录审计加载失败', en: 'Failed to load login audit' }}
              onClose={() => activateNav('overview')}
            />
          )
        ) : activeNav === 'history' ? (
          <HistoryPage
            labels={historyPageLabels(t, locale)}
            plans={historyPlans}
            loadFailed={historyLoadFailed}
            onRetry={refreshHistory}
            onSave={saveCurrentPlan}
            saveDisabled={planSaveDisabled || !activePlanCompliance.ok}
            saveDisabledReason={planSaveDisabledReason}
            onRestore={restorePlan}
            onDelete={removeHistory}
            onBack={() => activateNav('overview')}
          />
        ) : activeNav === 'cargo-library' ? (
          <CargoLibraryPage
            locale={locale}
            labels={t}
            items={customCargoItems}
            loadFailed={customCargoLoadFailed}
            onRetry={refreshCustomCargo}
            onCreate={createCustomCargo}
            onUpdate={updateCustomCargo}
            onDelete={removeCustomCargo}
            onUseCargo={addLibraryCargoToWorkbench}
            onBack={() => activateNav('overview')}
          />
        ) : activeNav === 'template-manager' ? (
          TemplateManagerPage ? (
            <TemplateManagerPage
              locale={locale}
              labels={t}
              importTemplates={importTemplates}
              importLoadFailed={importTemplateLoadFailed}
              exportTemplates={exportTemplates}
              exportLoadFailed={exportTemplateLoadFailed}
              onRetryImport={fetchImportTemplates}
              onCreateImport={createImportTemplateRecord}
              onUpdateImport={updateImportTemplateRecord}
              onDeleteImport={deleteImportTemplateRecord}
              onRetryExport={fetchExportTemplates}
              onCreateExport={createExportTemplateRecord}
              onUpdateExport={updateExportTemplateRecord}
              onDeleteExport={deleteExportTemplateRecord}
              onBack={() => activateNav('overview')}
            />
          ) : (
            <LazyLoadFallback
              locale={locale}
              testId="template-manager-page"
              errorTestId="template-manager-page-load-error"
              failed={templateManagerPageLoadFailed}
              loadingText={{ zh: '模板管理加载中...', en: 'Loading template manager...' }}
              errorText={{ zh: '模板管理加载失败', en: 'Failed to load template manager' }}
              onClose={() => activateNav('overview')}
              cardClassName="archive-card p-[18px] text-center text-sm text-slate-500"
            />
          )
        ) : (
        <section className="flex gap-5 max-lg:flex-col" data-testid="workbench-layout">
          <PackingSidebar
            sidebarCollapsed={sidebarCollapsed}
            setSidebarCollapsed={setSidebarCollapsed}
            workspaceMaximized={workspaceMaximized}
            menuOpen={menuOpen}
            setMenuOpen={setMenuOpen}
            currentUser={currentUser}
            activateNav={activateNav}
            shipmentName={shipmentName}
            dispatchPackingSession={dispatchPackingSession}
            placementSettingsOpen={placementSettingsOpen}
            setPlacementSettingsOpen={setPlacementSettingsOpen}
            snapSettingsOpen={snapSettingsOpen}
            setSnapSettingsOpen={setSnapSettingsOpen}
            placementSettings={placementSettings}
            setPlacementSettings={setPlacementSettings}
            containerRef={containerRef}
            containerCollapsed={containerCollapsed}
            setContainerCollapsed={setContainerCollapsed}
            containerSummary={containerSummary}
            selectedContainer={selectedContainer}
            selectedContainerId={selectedContainerId}
            customContainers={customContainers}
            customContainer={customContainer}
            selectContainerById={selectContainerById}
            setShowCustomContainerDialog={setShowCustomContainerDialog}
            updateContainerNumber={updateContainerNumber}
            locale={locale}
            cargoRef={cargoRef}
            form={form}
            setForm={setForm}
            addCargo={addCargo}
            updateNumber={updateNumber}
            updateMaxStackLayers={updateMaxStackLayers}
            rulesCollapsed={rulesCollapsed}
            setRulesCollapsed={setRulesCollapsed}
            loadingMode={loadingMode}
            defaultMaxStackLayers={defaultMaxStackLayers}
            updateDefaultMaxStackLayers={updateDefaultMaxStackLayers}
            loadingModeLabels={loadingModeLabels}
            displayCargoItems={displayCargoItems}
            activeResult={activeResult}
            activeSelectedBoxId={activeSelectedBoxId}
            selectCargoResultBox={selectCargoResultBox}
            openEditCargo={openEditCargo}
            deleteCargo={deleteCargo}
            setDraggedCargoId={setDraggedCargoId}
            reorderCargo={reorderCargo}
            t={t}
          />

        <section className="flex-1 min-w-0 space-y-4">
        <VisualizationWorkspace
            activeResult={activeResult}
            formatCubicMeters={formatCubicMeters}
            t={t}
            hasCalculated={hasCalculated}
            handleContinueManually={handleContinueManually}
            exportCurrentViewDisabled={!activePlanCompliance.ok}
            exportCurrentViewDisabledReason={planComplianceMessage}
            exportShipmentName={shipmentName}
            onExportView={runPlanExport}
            containerChangeNotice={containerChangeNotice}
            customContainerLoadFailed={customContainerLoadFailed}
            locale={locale}
            calculateAndShowPlacement={calculateAndShowPlacement}
            onChromeChange={setVisualizationChrome}
            hotkeysEnabled
            manual={{
              manualNotice,
              setManualNotice,
              rotationNotice,
              setRotationNotice,
              manualIssues,
              localizeManualIssue: (issue) => localizeManualIssue(issue, t),
              manualPool,
              handleManualPoolDragStart,
              handleManualPoolDragEnd,
              handleQuickPlaceCargo,
              manualHelpOpen,
              setManualHelpOpen,
              automaticPlaced: automaticDisplayResult.placed,
              manualPlacedBoxes,
              manualInvalidBoxIds,
              poolDragInfo,
              manualSelectedId,
              selectManualBox,
              setHoverInfo,
              handleManualDeleteBox,
              handleManualDropFromPool,
              handleManualMoveBox,
              notifyManualRejected,
              handleManualRotateBox,
              undoManualPlacement,
              redoManualPlacement,
              clearanceAnnotations,
              manualDraft,
              autoHelpOpen,
              setAutoHelpOpen,
              hoverInfo,
            }}
            playback={{
              playbackActive,
              playbackSequence,
              playbackCursor: playback.cursor,
              loadingStepsActive,
              activeLoadingGroupBoxIds,
            }}
            render={{
              placementMode,
              setPlacementMode,
              renderingContainer,
              gridSnap,
              edgeSnap,
              placementSettings,
            }}
            selection={{
              activeLabelId,
              activeLayerId,
              cogViewState,
              cogOverlay,
              selectedBoxId,
              setSelectedBoxId,
            }}
          />

          <ResultsPanel
            ref={resultsPanelRef}
            reportRef={reportRef}
            workspaceMaximized={workspaceMaximized}
            locale={locale}
            t={t}
            activeResult={activeResult}
            selectedContainer={selectedContainer}
            labelOptions={labelOptions}
            detailRows={detailRows}
            hasCalculated={hasCalculated}
            displayCargoItemsCount={displayCargoItems.length}
            placementMode={placementMode}
            planCompliance={activePlanCompliance}
            onStateChange={setResultsPanelState}
            displayCargoItems={displayCargoItems}
            loadingMode={loadingMode}
            defaultMaxStackLayers={defaultMaxStackLayers}
            playback={{
              playbackAvailable,
              playback,
              playbackSequence,
            }}
            loadingSteps={{
              loadingStepsAvailable,
              loadingTaskGroups,
              activeLoadingGroupIndex,
              loadingGroupsPlaying,
              setActiveLoadingGroupIndex,
              setLoadingGroupsPlaying,
            }}
            cog={{
              cogResult,
              showCogOverlay,
              vehicleProfile,
              toggleCogOverlay,
              setVehicleProfile,
            }}
            compare={{
              compareCandidates,
              compareSelection,
              setCompareSelection,
              selectContainerById,
            }}
            fill={{
              fillSuggestions,
              handleAddFillCargo,
              handleAddAllFillCargo,
            }}
            exportActions={{
              exportTemplates,
              exportTemplateLoadFailed,
              selectedExportTemplateId,
              setSelectedExportTemplateId,
              fetchExportTemplates,
              importMessages,
              reviewChecklist,
              exportReviewChecklistJson,
              exportReviewChecklistExcel,
              importExcel,
              downloadImportTemplate,
              exportExcel,
              saveCurrentPlan,
              exportPlaybackInstructions,
              exportLoadingSheet,
            }}
            selection={{
              activeSelectedBoxId,
              selectManualBox,
              setSelectedBoxId,
            }}
          />
        </section>
        </section>
        )}
        {showMappingModal && (
          <CargoImportDialog
            importRows={importRows}
            importTemplates={importTemplates}
            importTemplateLoadFailed={importTemplateLoadFailed}
            locale={locale}
            labels={t as never}
            userId={currentUser?.id ?? null}
            colors={colors}
            onConfirm={(items, messages) => {
              setImportMessages(messages)
              if (items.length > 0) {
                dispatchPackingSession({ type: 'cargoImported', items })
                setSelectedBoxId(null)
              }
              resultsPanelRef.current?.showImportLog()
              setShowMappingModal(false)
              navigateTo('report')
            }}
            onClose={() => setShowMappingModal(false)}
            onRefreshTemplates={() => void fetchImportTemplates()}
            onCreateTemplate={createImportTemplateRecord}
            onUpdateTemplate={updateImportTemplateRecord}
          />
        )}
        {editingCargo && (
          <EditCargoDialog
            cargoName={editingCargo.name}
            form={editForm}
            labels={t}
            onChange={setEditForm}
            onUpdateNumber={updateEditNumber}
            onUpdateMaxStackLayers={updateEditMaxStackLayers}
            onClose={() => setEditingCargo(null)}
            onSubmit={saveEditedCargo}
          />
        )}
      </div>
      {showCustomContainerDialog && (
        <CustomContainerDialogHost
          Dialog={CustomContainerDialog}
          loadFailed={customContainerDialogLoadFailed}
          locale={locale}
          currentSelectedId={selectedContainerId}
          onClose={() => {
            setShowCustomContainerDialog(false)
            fetchCustomContainers()
          }}
          onSelect={(container) => {
            changeSelectedContainer(container)
            setShowCustomContainerDialog(false)
            fetchCustomContainers()
          }}
        />
      )}
      <DebugPanel snapshot={debugSnapshot} />
    </main>
  )
}

export default Workbench
