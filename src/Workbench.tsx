import { useMemo, useRef, useState, useEffect } from 'react'
import type { FormEvent, DragEvent as ReactDragEvent } from 'react'
import { CargoImportDialog } from './components/CargoImportDialog'
import { buildPlaybackSequence, visibleBoxesAt } from './lib/playback'
import { buildLoadingTaskGroups } from './lib/loadingTaskGroups'
import { buildLoadingSheetModel } from './lib/loadingSheet'
import { usePlaybackController } from './hooks/usePlaybackController'
import { usePackingSession } from './hooks/usePackingSession'
import { useManualPlacementSession } from './hooks/useManualPlacementSession'
import { useHistoryPlans } from './hooks/useHistoryPlans'
import type { HistoryPlan } from './hooks/useHistoryPlans'
import { useCustomCargoLibrary } from './hooks/useCustomCargoLibrary'
import { shouldClearTemplateReference, useTemplateCatalogs } from './hooks/useTemplateCatalogs'
import { selectPackingContainer } from './lib/packingSession'
import { computeCenterOfGravity } from './lib/centerOfGravity'
import { compareContainers } from './lib/containerCompare'
import { computeRemainingCapacity } from './lib/remainingCapacity'
import { suggestFillItems } from './lib/fillSuggestion'
import { buildStandardCargoItem, STANDARD_BOXES, STANDARD_BOX_MAX_PER_CLICK } from './data/standardBoxes'
import { HistoryPage } from './components/HistoryPage'
import { CargoLibraryPage } from './components/CargoLibraryPage'
import { WorkbenchHeader } from './components/WorkbenchHeader'
import { buildCogOverlay } from './lib/cogVisual'
import { deriveCogOverlayState } from './lib/cogView'
import { DEFAULT_VEHICLE_PROFILE } from './data/vehicleProfiles'
import type { VehicleProfileId } from './data/vehicleProfiles'
import {
  dryRunRotation as manualDryRunRotation,
} from './lib/manualPlacement'
import type { ManualRotationDirection, OrientationKey, ValidationIssue } from './lib/manualPlacement'
import { containers, effectiveContainer, formatCubicMeters, getContainerVolume } from './data/containers'
import type { SceneViewMode } from './components/ContainerScene'
import type { PlanViewMode } from './components/ContainerPlan2D'
import { buildExportPlanRows, buildExportRowsFromTemplate } from './lib/exportPlan'
import { createClientId } from './lib/clientId'
import { parseCargoRows } from './lib/importCargo'
import type { ImportCargoRow } from './lib/importCargo'
import { importPreviewRows } from './lib/importTable'
import { canAutoMap, buildImportMessages } from './lib/importWorkflow'
import { normalizeCargoLabelColors } from './lib/labels'
import {
  deriveClearanceAnnotations,
  measureBoxClearance,
} from './lib/measurement'
import { buildReviewChecklist } from './lib/reviewChecklist'
import { assertPlanCompliant } from './lib/planCompliance'
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
import type { CargoItem, ContainerSpec, LoadingMode, Locale, PackingResult } from './types'
import { readCustomContainers } from './api/customContainers'
import type { User } from './lib/auth'
import { PackingSidebar } from './components/PackingSidebar'
import { DebugPanel } from './components/DebugPanel'
import { excelStyleLabel } from './lib/excelStyleLabel'
import { buildCargoDebugSnapshot } from './lib/debugSnapshot'
import { VisualizationWorkspace } from './components/VisualizationWorkspace'
import { ResultsPanel } from './components/ResultsPanel'
import { workbenchCopy as copy } from './data/workbenchCopy'

type CustomContainerDialogComponent = typeof import('./components/CustomContainerDialog')['CustomContainerDialog']
type TemplateManagerPageComponent = typeof import('./components/TemplateManagerPage')['TemplateManagerPage']
type UserManagementComponent = typeof import('./components/UserManagement')['UserManagement']
const colors = ['#f59e0b', '#0ea5e9', '#22c55e', '#ef4444', '#8b5cf6', '#14b8a6']
type WorksheetCell = string | number | boolean | null | undefined



const initialCargo: CargoItem[] = [
  {
    id: 'sample-1',
    name: 'Carton A',
    label: 'A',
    length: 400,
    width: 500,
    height: 600,
    weight: 18,
    quantity: 18,
    color: '#f59e0b',
    canRotate: true,
    stackable: true,
  },
]

const customContainerDefaults = {
  id: 'custom',
  label: 'Custom container',
  description: 'User defined container',
  length: 12000,
  width: 2350,
  height: 2600,
  maxWeight: 26000,
  doorGap: 0,
  topGap: 0,
  sideGap: 0,
}

type CargoForm = Omit<CargoItem, 'id'>
type WorkspaceView = '3d' | '2d'
type ResultTab = 'layers' | 'details' | 'diagnostics' | 'importLog' | 'playback' | 'loadingSteps' | 'cog' | 'compare' | 'fill' | 'reviewChecklist'
type NavTarget = 'overview' | 'report' | 'cargo' | 'container' | 'history' | 'cargo-library' | 'template-manager' | 'users'

function buildRotationNotice(
  dry: ReturnType<typeof manualDryRunRotation>,
  container: ContainerSpec,
  locale: Locale,
): string {
  if (dry.ok || !dry.rotatedBox) return ''
  const box = dry.rotatedBox
  const overflowL = box.x + box.length - container.length
  const overflowW = box.y + box.width - container.width
  const boundary = dry.issues.find((i) => i.type === 'boundary')
  if (boundary) {
    if (overflowL > 0) {
      return locale === 'zh'
        ? `旋转后长度 ${box.length} mm 超出柜长 ${container.length} mm（差 ${Math.round(overflowL)} mm）`
        : `Rotated length ${box.length} mm exceeds container length ${container.length} mm (over by ${Math.round(overflowL)} mm)`
    }
    if (overflowW > 0) {
      return locale === 'zh'
        ? `旋转后宽度 ${box.width} mm 超出柜宽 ${container.width} mm（差 ${Math.round(overflowW)} mm）`
        : `Rotated width ${box.width} mm exceeds container width ${container.width} mm (over by ${Math.round(overflowW)} mm)`
    }
    return locale === 'zh'
      ? '旋转后会超出货柜边界'
      : 'Rotated footprint exceeds the container'
  }
  const overlap = dry.issues.find((i) => i.type === 'overlap')
  if (overlap) {
    return locale === 'zh'
      ? '旋转后会与其它货物重叠，请先腾出位置'
      : 'Rotated box would overlap another cargo box'
  }
  const floating = dry.issues.find((i) => i.type === 'floating')
  if (floating) {
    return locale === 'zh'
      ? '旋转后底面支撑不足（需要 ≥50%）'
      : 'Rotated box has insufficient base support (≥50% required)'
  }
  const rotationDisabled = dry.issues.find((i) => i.type === 'rotation-disabled')
  if (rotationDisabled) {
    return locale === 'zh'
      ? '该货物不允许旋转'
      : 'This cargo cannot be rotated'
  }
  const stacking = dry.issues.find((i) => i.type === 'stacking')
  if (stacking) {
    return locale === 'zh'
      ? '旋转后会压在不可堆叠货物上'
      : 'Rotated box would rest on non-stackable cargo'
  }
  return locale === 'zh' ? '旋转后不满足校验，已撤销' : 'Rotation rejected by validation'
}

const emptyForm: CargoForm = {
  name: 'Carton B',
  label: 'B',
  length: 400,
  width: 500,
  height: 600,
  weight: 24,
  quantity: 10,
  color: '#0ea5e9',
  canRotate: true,
  stackable: true,
  maxStackLayers: undefined,
  groundOnly: false,
}
function nextLabel(index: number) {
  return excelStyleLabel(index)
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}

function filenameSlug(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fff]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function defaultProjectName(locale: Locale) {
  const now = new Date()
  const pad = (value: number) => String(value).padStart(2, '0')
  const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}`
  return locale === 'zh' ? `装箱方案-${stamp}` : `Packing plan-${stamp}`
}

function emptyPackingResult(container: ContainerSpec, cargoItems: CargoItem[]): PackingResult {
  return {
    placed: [],
    unplaced: [],
    layers: [],
    workSteps: [],
    labelStats: [],
    diagnostics: [],
    totalCargoCount: cargoItems.reduce((sum, item) => sum + item.quantity, 0),
    placedCount: 0,
    usedVolume: 0,
    containerVolume: getContainerVolume(container),
    volumeUtilization: 0,
    usedWeight: 0,
    weightUtilization: 0,
  }
}

function localizeManualIssue(issue: ValidationIssue, localeCopy: typeof copy.en) {
  if (issue.type === 'boundary') return localeCopy.manualIssueBoundary
  if (issue.type === 'overlap') return localeCopy.manualIssueOverlap
  if (issue.type === 'floating') return localeCopy.manualIssueFloating
  if (issue.type === 'rotation-disabled') return localeCopy.manualIssueRotationDisabled
  if (issue.type === 'max-stack-layers') return localeCopy.manualIssueMaxStackLayers
  return localeCopy.manualIssueStacking
}

type WorkbenchProps = {
  currentUser: User | null
  onLogout: () => void
}

function Workbench({ currentUser, onLogout }: WorkbenchProps) {
  const [locale, setLocale] = useState<Locale>('zh')
  const t = copy[locale]
  const [menuOpen, setMenuOpen] = useState(false)
  const [activeNav, setActiveNav] = useState<NavTarget>('overview')
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
  const [activeLayerId, setActiveLayerId] = useState('all')
  const [activeLabelId, setActiveLabelId] = useState('all')
  const [workspaceView, setWorkspaceView] = useState<WorkspaceView>('3d')
  const [sceneViewMode, setSceneViewMode] = useState<SceneViewMode>('iso')
  const [placementSettingsOpen, setPlacementSettingsOpen] = useState(false)
  const [snapSettingsOpen, setSnapSettingsOpen] = useState(false)
  const gridSnap = placementSettings.snapEnabled && placementSettings.gridSnapEnabled
  const edgeSnap = placementSettings.snapEnabled && placementSettings.edgeSnapEnabled
  const [clearanceEnabled, setClearanceEnabled] = useState(false)
  const [hoverInfo, setHoverInfo] = useState<{ id: string; label: string; length: number; width: number; height: number; orientationKey: OrientationKey; x: number; y: number; z: number; clientX: number; clientY: number } | null>(null)
  const [poolDragInfo, setPoolDragInfo] = useState<{ cargoId: string; length: number; width: number; height: number; color: string } | null>(null)
  const [workspaceMaximized, setWorkspaceMaximized] = useState(false)
  const [resetViewTick, setResetViewTick] = useState(0)
  const [compareSelection, setCompareSelection] = useState<string[]>(() => containers.slice(0, 3).map((c) => c.id))
  const [showCogOverlay, setShowCogOverlay] = useState(false)
  const [vehicleProfile, setVehicleProfile] = useState<VehicleProfileId>(DEFAULT_VEHICLE_PROFILE)
  const [planViewMode, setPlanViewMode] = useState<PlanViewMode>('top')
  const [activeResultTab, setActiveResultTab] = useState<ResultTab>('layers')
  const [activeLoadingGroupIndex, setActiveLoadingGroupIndex] = useState(0)
  const [loadingGroupsPlaying, setLoadingGroupsPlaying] = useState(false)
  const [manualHelpOpen, setManualHelpOpen] = useState(false)
  const [autoHelpOpen, setAutoHelpOpen] = useState(false)
  const [manualNotice, setManualNotice] = useState<ManualOperationNotice | null>(null)
  const [containerChangeNotice, setContainerChangeNotice] = useState('')
  const [customContainerLoadFailed, setCustomContainerLoadFailed] = useState(false)
  const [rotationNotice, setRotationNotice] = useState('')
  
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

  const workspaceRef = useRef<HTMLElement | null>(null)
  const reportRef = useRef<HTMLElement | null>(null)
  const cargoRef = useRef<HTMLFormElement | null>(null)
  const containerRef = useRef<HTMLElement | null>(null)

  const selectedContainer = selectPackingContainer(packingSession)
  const customContainer = packingSession.containerSnapshots.custom ?? customContainerDefaults

  const fetchCustomContainers = async () => {
    try {
      setCustomContainers(await readCustomContainers())
      setCustomContainerLoadFailed(false)
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
    setSelectedBoxId(null)
    setActiveLayerId('all')
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
    if (!workspaceMaximized) return
    const handle = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setWorkspaceMaximized(false)
    }
    window.addEventListener('keydown', handle)
    return () => window.removeEventListener('keydown', handle)
  }, [workspaceMaximized])

  useEffect(() => {
    setHoverInfo(null)
    setActiveLayerId('all')
    setActiveLabelId('all')
  }, [placementMode])

  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      if (target) {
        const tag = target.tagName
        if (tag === 'INPUT' || tag === 'TEXTAREA' || target.isContentEditable) {
          return
        }
      }

      const isMeta = event.ctrlKey || event.metaKey

      if (isMeta && (event.key === 'z' || event.key === 'Z')) {
        if (placementMode !== 'manual') return
        event.preventDefault()
        if (event.shiftKey) {
          redoManualPlacement()
        } else {
          undoManualPlacement()
        }
        return
      }
      if (isMeta && (event.key === 'y' || event.key === 'Y')) {
        if (placementMode !== 'manual') return
        event.preventDefault()
        redoManualPlacement()
        return
      }

      if ((event.key === 'r' || event.key === 'R') && placementMode === 'manual' && manualSelectedId) {
        event.preventDefault()
        const direction: ManualRotationDirection = event.shiftKey ? 'down' : 'right'
        const command = rotateManualBox(manualSelectedId, direction)
        if (!command.ok) {
          setRotationNotice(buildRotationNotice({
            ok: false,
            issues: command.issues,
            rotatedBox: command.rotatedBox ?? null,
          }, renderingContainer, locale))
          setManualNotice(createManualOperationNotice({
            operation: 'rotate',
            boxId: manualSelectedId,
            issues: command.issues,
            locale,
          }))
          return
        }
        setRotationNotice('')
        setManualNotice(null)
        return
      }

      if (event.key === 'm' || event.key === 'M') {
        event.preventDefault()
        setClearanceEnabled((enabled) => !enabled)
        return
      }

      if (event.key === 'Escape') {
        selectManualBox(null)
        return
      }
    }

    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [locale, manualSelectedId, placementMode, redoManualPlacement, renderingContainer, rotateManualBox, selectManualBox, undoManualPlacement])

  useEffect(() => {
    if (!manualNotice) return
    const timer = window.setTimeout(() => setManualNotice(null), 5000)
    return () => window.clearTimeout(timer)
  }, [manualNotice])

  const activeLayer = activeResult.layers.find((layer) => layer.id === activeLayerId)
  const playbackSequence = useMemo(() => buildPlaybackSequence(activeResult), [activeResult])
  const playbackAvailable = playbackSequence.total > 0
  const playback = usePlaybackController(playbackSequence)
  const playbackActive = playbackAvailable && activeResultTab === 'playback'
  const loadingTaskGroups = useMemo(() => buildLoadingTaskGroups(activeResult), [activeResult])
  const loadingStepsAvailable = loadingTaskGroups.length > 0
  const activeLoadingGroup = loadingTaskGroups[Math.max(0, Math.min(activeLoadingGroupIndex, loadingTaskGroups.length - 1))] ?? null
  const activeLoadingGroupBoxIds = useMemo(() => activeLoadingGroup ? new Set(activeLoadingGroup.boxIds) : undefined, [activeLoadingGroup])
  const loadingStepsActive = loadingStepsAvailable && activeResultTab === 'loadingSteps'
  const visibleAutoBoxes = useMemo(() => {
    if (placementMode === 'auto' && playbackActive) return visibleBoxesAt(playbackSequence, playback.cursor)
    return hasCalculated ? automaticDisplayResult.placed : []
  }, [automaticDisplayResult.placed, hasCalculated, placementMode, playback.cursor, playbackActive, playbackSequence])
  const visibleManualBoxes = useMemo(() => {
    if (placementMode === 'manual' && playbackActive) return visibleBoxesAt(playbackSequence, playback.cursor)
    return manualPlacedBoxes
  }, [manualPlacedBoxes, placementMode, playback.cursor, playbackActive, playbackSequence])
  const visibleBoxes = activeResult.placed.filter((box) => (
    (activeLayerId === 'all' || String(box.physicalLayer) === activeLayerId)
    && (activeLabelId === 'all' || box.label === activeLabelId)
  ))

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
  const cogViewState = useMemo(
    () => deriveCogOverlayState({
      activeResultTab,
      placementMode,
      overlayEnabled: showCogOverlay,
    }),
    [activeResultTab, placementMode, showCogOverlay],
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
  const compareRows = useMemo(() => {
    if (activeResultTab !== 'compare' || !hasCalculated) return []
    if (compareSelection.length === 0) return []
    const chosen = compareCandidates.filter((c) => compareSelection.includes(c.id))
    return compareContainers(chosen, displayCargoItems, loadingMode, defaultMaxStackLayers)
  }, [activeResultTab, compareSelection, compareCandidates, defaultMaxStackLayers, displayCargoItems, hasCalculated, loadingMode])
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
  const reviewChecklist: ReviewChecklist = useMemo(
    () => buildReviewChecklist({
      result: activeResult,
      measurements: [],
      cog: cogResult,
      manualIssues: placementMode === 'manual' ? manualIssues : [],
      locale,
    }),
    [activeResult, cogResult, locale, manualIssues, placementMode],
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
  const activeLayerIndex = activeResult.layers.findIndex((layer) => layer.id === activeLayerId)
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
    setSelectedBoxId(null)
    setActiveLayerId('all')
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
    setActiveNav('overview')
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
    const MAX_BYTES = 5 * 1024 * 1024
    if (file.size > MAX_BYTES) {
      setImportMessages([`${t.importIssue}: ${t.importFileTooLarge}`])
      setActiveResultTab('importLog')
      setActiveNav('report')
      return
    }
    let rows: ImportCargoRow[]
    try {
      const XLSX = await import('xlsx')
      const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array' })
      const sheet = workbook.Sheets[workbook.SheetNames[0]]
      rows = sheet ? XLSX.utils.sheet_to_json<WorksheetCell[]>(sheet, { header: 1, raw: true }) : []
    } catch (error) {
      // xlsx@0.18.5 has known prototype-pollution / ReDoS issues; keep the catch tight and
      // do not surface the raw error message to the user.
      console.error('[import-excel]', error)
      setImportMessages([`${t.importParseFailed}: ${t.importFileUnreadable}`])
      setActiveResultTab('importLog')
      setActiveNav('report')
      return
    }

    if (rows.length === 0) {
      setImportMessages([`${t.importIssue}: ${t.importNoData}`])
      setActiveResultTab('importLog')
      setActiveNav('report')
      return
    }

    const autoRows = importPreviewRows(rows, 1, 2)
    const autoMappable = canAutoMap(autoRows[0] ?? {})

    if (autoRows.length === 0) {
      setImportMessages([`${t.importIssue}: ${t.importNoData}`])
      setActiveResultTab('importLog')
      setActiveNav('report')
      return
    }

    if (autoMappable) {
      const imported = parseCargoRows(autoRows, { colors })
      setImportMessages(buildImportMessages(imported, t, locale))
      if (imported.errors.length === 0 && imported.items.length > 0) {
        dispatchPackingSession({ type: 'cargoImported', items: imported.items })
        setSelectedBoxId(null)
      } else if (imported.errors.length > 0) {
        setImportMessages((prev) => [...prev, locale === 'zh'
          ? '导入含错误行，未覆盖当前货物。请修正后重新导入或使用手动映射预览。'
          : 'Import has error rows; current cargo was not replaced. Fix the workbook or use manual mapping preview.'])
      } else if (imported.errors.length === 0) {
        setImportMessages((prev) => [...prev, locale === 'zh'
          ? '未识别到可导入的货物行，建议使用模板管理器手动映射列'
          : 'No cargo rows were recognized. Try mapping columns manually with the template manager.'])
      }
      setActiveResultTab('importLog')
      setActiveNav('report')
    } else {
      setImportRows(rows)
      setShowMappingModal(true)
    }
  }

  const exportExcel = async () => {
    assertPlanCompliant(activeResult, manualIssues)
    const XLSX = await import('xlsx')
    const exportTemplate = exportTemplates.find((item) => item.id === selectedExportTemplateId)
    const planRows = exportTemplate && exportTemplate.columns.length > 0
      ? buildExportRowsFromTemplate(detailRows, exportTemplate.columns)
      : detailRows
    const sheet = XLSX.utils.json_to_sheet(planRows)
    const shipmentSheet = XLSX.utils.json_to_sheet([
      {
        shipmentName: shipmentName.trim() || 'Untitled shipment',
        container: selectedContainer.label,
        loadingMode,
        generatedAt: new Date().toISOString(),
      },
    ])
    const workbook = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(workbook, shipmentSheet, 'Shipment')
    XLSX.utils.book_append_sheet(workbook, sheet, 'Packing Plan')
    const prefix = filenameSlug(shipmentName)
    XLSX.writeFile(workbook, `${prefix ? `${prefix}-` : ''}packing-plan.xlsx`)
  }

  const exportPlaybackInstructions = async () => {
    if (!playbackAvailable) return
    assertPlanCompliant(activeResult, manualIssues)
    const XLSX = await import('xlsx')
    const rows = playbackSequence.steps.map((entry) => {
      const supportLabel = entry.box.supportType === 'floor'
        ? (locale === 'zh' ? '地面' : 'floor')
        : entry.box.supportType === 'fully-supported'
          ? (locale === 'zh' ? '完全支撑' : 'fully supported')
          : (locale === 'zh' ? '部分支撑' : 'partial support')
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
    const prefix = filenameSlug(shipmentName)
    XLSX.writeFile(workbook, `${prefix ? `${prefix}-` : ''}loading-instructions.xlsx`)
  }

  const exportLoadingSheet = async () => {
    if (!loadingStepsAvailable) return
    assertPlanCompliant(activeResult, manualIssues)
    const { exportLoadingSheetPdf } = await import('./lib/exportLoadingSheet')
    const model = buildLoadingSheetModel(activeResult, renderingContainer)
    const prefix = filenameSlug(shipmentName)
    const blob = exportLoadingSheetPdf({
      model,
      boxes: activeResult.placed,
      container: renderingContainer,
      locale,
      title: shipmentName || projectName,
    })
    downloadBlob(blob, `${prefix ? `${prefix}-` : ''}loading-sheet.pdf`)
  }

  const exportReviewChecklistJson = () => {
    assertPlanCompliant(activeResult, manualIssues)
    const prefix = filenameSlug(shipmentName)
    downloadBlob(
      new Blob([JSON.stringify(reviewChecklist, null, 2)], { type: 'application/json;charset=utf-8' }),
      `${prefix ? `${prefix}-` : ''}review-checklist.json`,
    )
  }

  const exportReviewChecklistExcel = async () => {
    assertPlanCompliant(activeResult, manualIssues)
    const XLSX = await import('xlsx')
    const rows = reviewChecklist.items.map((item) => ({
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
    const prefix = filenameSlug(shipmentName)
    XLSX.writeFile(workbook, `${prefix ? `${prefix}-` : ''}review-checklist.xlsx`)
  }

  const exportCurrentView = () => {
    assertPlanCompliant(activeResult, manualIssues)
    if (workspaceView === '2d') {
      const selector = placementMode === 'manual'
        ? '[data-testid="manual-placement-2d"]'
        : '[data-testid="container-plan-2d"]'
      const svg = workspaceRef.current?.querySelector(selector)
      if (!(svg instanceof SVGSVGElement)) {
        throw new Error('2D plan is not available for export')
      }
      const source = new XMLSerializer().serializeToString(svg)
      const prefix = filenameSlug(shipmentName)
      downloadBlob(new Blob([source], { type: 'image/svg+xml;charset=utf-8' }), `${prefix ? `${prefix}-` : ''}packing-plan-${planViewMode}.svg`)
      return
    }

    const canvas = workspaceRef.current?.querySelector('canvas')
    if (!(canvas instanceof HTMLCanvasElement)) {
      throw new Error('3D canvas is not available for export')
    }
    canvas.toBlob((blob) => {
      if (!blob) {
        throw new Error('3D canvas export failed')
      }
      const prefix = filenameSlug(shipmentName)
      downloadBlob(blob, `${prefix ? `${prefix}-` : ''}packing-plan-${sceneViewMode}.png`)
    }, 'image/png')
  }

  const saveCurrentPlan = async () => {
    try {
      assertPlanCompliant(activeResult, manualIssues)
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
      setActiveNav('history')
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

    setContainerChangeNotice('')
    setActiveLayerId('all')
    setActiveLabelId('all')
    setSelectedBoxId(null)
    setActiveResultTab('layers')
    setActiveNav('overview')
  }

  const deleteCargo = (cargoId: string) => {
    dispatchPackingSession({ type: 'cargoDeleted', cargoId })
    setSelectedBoxId((current) => {
      const selectedBox = automaticDisplayResult.placed.find((box) => box.id === current)
      return selectedBox?.cargoId === cargoId ? null : current
    })
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

  const selectLayerByOffset = (offset: -1 | 1) => {
    if (!activeResult.layers.length) {
      return
    }

    if (activeLayerId === 'all') {
      setActiveLayerId(activeResult.layers[0].id)
      return
    }

    const nextIndex = Math.min(activeResult.layers.length - 1, Math.max(0, activeLayerIndex + offset))
    setActiveLayerId(activeResult.layers[nextIndex]?.id ?? 'all')
  }

  const selectStepBox = (boxId: string, layerId: string) => {
    if (placementMode === 'manual') {
      selectManualBox(boxId)
    } else {
      setSelectedBoxId(boxId)
    }
    setActiveLayerId(layerId)
  }

  const activateNav = (target: NavTarget) => {
    setActiveNav(target)
    setMenuOpen(false)
    if (target === 'report') {
      setActiveResultTab('layers')
      reportRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
    } else if (target === 'cargo') {
      cargoRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
    } else if (target === 'container') {
      containerRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
    }
  }

  const selectSceneView = (view: SceneViewMode) => {
    setSceneViewMode(view)
  }

  const resetSceneView = () => {
    setSceneViewMode('iso')
    setWorkspaceView('3d')
    setResetViewTick((t) => t + 1)
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
          <section className="archive-card overflow-hidden p-[18px]" data-testid="users-page">
            {UserManagement ? (
              <UserManagement onBack={() => activateNav('overview')} />
            ) : userManagementLoadFailed ? (
              <div className="py-10 text-center text-sm text-slate-500">
                <p className="font-semibold text-red-700" data-testid="user-management-load-error">
                  {locale === 'zh' ? '登录审计加载失败' : 'Failed to load login audit'}
                </p>
                <div className="mt-4 flex justify-center gap-2">
                  <button className="archive-button" type="button" onClick={() => window.location.reload()}>
                    {locale === 'zh' ? '重新加载页面' : 'Reload page'}
                  </button>
                  <button className="archive-button secondary" type="button" onClick={() => activateNav('overview')}>
                    {locale === 'zh' ? '关闭' : 'Close'}
                  </button>
                </div>
              </div>
            ) : (
              <div className="py-12 text-center text-sm text-slate-500" role="status">
                {locale === 'zh' ? '登录审计加载中...' : 'Loading login audit...'}
              </div>
            )}
          </section>
        ) : activeNav === 'history' ? (
          <HistoryPage
            labels={{
              title: t.historyPage,
              noHistory: t.noHistory,
              savePlan: t.savePlan,
              backToWorkbench: t.backToWorkbench,
              shipmentName: t.shipmentName,
              layers: t.layers,
              restore: t.restore,
              delete: locale === 'zh' ? '删除' : 'Delete',
              retry: locale === 'zh' ? '重试' : 'Retry',
              loadFailed: locale === 'zh' ? '历史方案加载失败' : 'Failed to load history plans',
              confirmDelete: locale === 'zh' ? '确认删除该历史方案吗？' : 'Are you sure you want to delete this plan?',
              saveFailed: locale === 'zh' ? '保存历史方案失败' : 'Failed to save plan',
              deleteFailed: locale === 'zh' ? '删除失败' : 'Failed to delete',
              snapshotBadge: locale === 'zh' ? '结果快照' : 'Snapshot',
              legacyTemplateBadge: locale === 'zh' ? '输入模板' : 'Input template',
            }}
            plans={historyPlans}
            loadFailed={historyLoadFailed}
            onRetry={refreshHistory}
            onSave={saveCurrentPlan}
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
            <section className="archive-card p-[18px] text-center text-sm text-slate-500" data-testid="template-manager-page">
              {templateManagerPageLoadFailed ? (
                <div className="py-10">
                  <p className="font-semibold text-red-700" data-testid="template-manager-page-load-error">
                    {locale === 'zh' ? '模板管理加载失败' : 'Failed to load template manager'}
                  </p>
                  <div className="mt-4 flex justify-center gap-2">
                    <button className="archive-button" type="button" onClick={() => window.location.reload()}>
                      {locale === 'zh' ? '重新加载页面' : 'Reload page'}
                    </button>
                    <button className="archive-button secondary" type="button" onClick={() => activateNav('overview')}>
                      {locale === 'zh' ? '关闭' : 'Close'}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="py-12" role="status">
                  {locale === 'zh' ? '模板管理加载中...' : 'Loading template manager...'}
                </div>
              )}
            </section>
          )
        ) : (
        <section className={sidebarCollapsed ? "flex gap-5 max-lg:flex-col" : "flex gap-5 max-lg:flex-col"} data-testid="workbench-layout">
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

        <section className="flex-1 min-w-0 space-y-4" ref={workspaceRef}>
        <VisualizationWorkspace
            workspaceMaximized={workspaceMaximized}
            setWorkspaceMaximized={setWorkspaceMaximized}
            activeResult={activeResult}
            formatCubicMeters={formatCubicMeters}
            t={t}
            placementMode={placementMode}
            setPlacementMode={setPlacementMode}
            hasCalculated={hasCalculated}
            handleContinueManually={handleContinueManually}
            workspaceView={workspaceView}
            setWorkspaceView={setWorkspaceView}
            planViewMode={planViewMode}
            setPlanViewMode={setPlanViewMode}
            sceneViewMode={sceneViewMode}
            selectSceneView={selectSceneView}
            resetSceneView={resetSceneView}
            clearanceEnabled={clearanceEnabled}
            setClearanceEnabled={setClearanceEnabled}
            exportCurrentView={exportCurrentView}
            containerChangeNotice={containerChangeNotice}
            customContainerLoadFailed={customContainerLoadFailed}
            locale={locale}
            manualNotice={manualNotice}
            setManualNotice={setManualNotice}
            rotationNotice={rotationNotice}
            setRotationNotice={setRotationNotice}
            manualIssues={manualIssues}
            localizeManualIssue={(issue) => localizeManualIssue(issue, t)}
            manualPool={manualPool}
            handleManualPoolDragStart={handleManualPoolDragStart}
            handleManualPoolDragEnd={handleManualPoolDragEnd}
            handleQuickPlaceCargo={handleQuickPlaceCargo}
            manualHelpOpen={manualHelpOpen}
            setManualHelpOpen={setManualHelpOpen}
            visibleManualBoxes={visibleManualBoxes}
            renderingContainer={renderingContainer}
            gridSnap={gridSnap}
            edgeSnap={edgeSnap}
            placementSettings={placementSettings}
            manualInvalidBoxIds={manualInvalidBoxIds}
            poolDragInfo={poolDragInfo}
            loadingStepsActive={loadingStepsActive}
            activeLoadingGroupBoxIds={activeLoadingGroupBoxIds}
            resetViewTick={resetViewTick}
            manualSelectedId={manualSelectedId}
            selectManualBox={selectManualBox}
            setHoverInfo={setHoverInfo}
            handleManualDeleteBox={handleManualDeleteBox}
            handleManualDropFromPool={handleManualDropFromPool}
            handleManualMoveBox={handleManualMoveBox}
            notifyManualRejected={notifyManualRejected}
            handleManualRotateBox={handleManualRotateBox}
            clearanceAnnotations={clearanceAnnotations}
            manualDraft={manualDraft}
            autoHelpOpen={autoHelpOpen}
            setAutoHelpOpen={setAutoHelpOpen}
            visibleAutoBoxes={visibleAutoBoxes}
            activeLabelId={activeLabelId}
            activeLayerId={activeLayerId}
            cogViewState={cogViewState}
            cogOverlay={cogOverlay}
            selectedBoxId={selectedBoxId}
            setSelectedBoxId={setSelectedBoxId}
            calculateAndShowPlacement={calculateAndShowPlacement}
            hoverInfo={hoverInfo}
          />

          <ResultsPanel
            reportRef={reportRef}
            workspaceMaximized={workspaceMaximized}
            locale={locale}
            t={t}
            activeResultTab={activeResultTab}
            setActiveResultTab={setActiveResultTab}
            activeResult={activeResult}
            selectedContainer={selectedContainer}
            activeLayerId={activeLayerId}
            setActiveLayerId={setActiveLayerId}
            activeLabelId={activeLabelId}
            setActiveLabelId={setActiveLabelId}
            labelOptions={labelOptions}
            activeLayer={activeLayer}
            visibleBoxes={visibleBoxes}
            activeSelectedBoxId={activeSelectedBoxId}
            detailRows={detailRows}
            importMessages={importMessages}
            exportTemplates={exportTemplates}
            exportTemplateLoadFailed={exportTemplateLoadFailed}
            selectedExportTemplateId={selectedExportTemplateId}
            setSelectedExportTemplateId={setSelectedExportTemplateId}
            fetchExportTemplates={fetchExportTemplates}
            playbackAvailable={playbackAvailable}
            playback={playback}
            playbackSequence={playbackSequence}
            loadingStepsAvailable={loadingStepsAvailable}
            loadingTaskGroups={loadingTaskGroups}
            activeLoadingGroupIndex={activeLoadingGroupIndex}
            loadingGroupsPlaying={loadingGroupsPlaying}
            setActiveLoadingGroupIndex={setActiveLoadingGroupIndex}
            setLoadingGroupsPlaying={setLoadingGroupsPlaying}
            cogResult={cogResult}
            showCogOverlay={showCogOverlay}
            vehicleProfile={vehicleProfile}
            toggleCogOverlay={toggleCogOverlay}
            setVehicleProfile={setVehicleProfile}
            compareCandidates={compareCandidates}
            compareRows={compareRows}
            compareSelection={compareSelection}
            setCompareSelection={setCompareSelection}
            selectContainerById={selectContainerById}
            hasCalculated={hasCalculated}
            fillSuggestions={fillSuggestions}
            handleAddFillCargo={handleAddFillCargo}
            handleAddAllFillCargo={handleAddAllFillCargo}
            reviewChecklist={reviewChecklist}
            exportReviewChecklistJson={exportReviewChecklistJson}
            exportReviewChecklistExcel={exportReviewChecklistExcel}
            selectLayerByOffset={selectLayerByOffset}
            selectStepBox={selectStepBox}
            importExcel={importExcel}
            downloadImportTemplate={downloadImportTemplate}
            exportExcel={exportExcel}
            saveCurrentPlan={saveCurrentPlan}
            exportPlaybackInstructions={exportPlaybackInstructions}
            exportLoadingSheet={exportLoadingSheet}
            displayCargoItemsCount={displayCargoItems.length}
            placementMode={placementMode}
            manualIssues={manualIssues}
            selectManualBox={selectManualBox}
            setSelectedBoxId={setSelectedBoxId}
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
              setActiveResultTab('importLog')
              setShowMappingModal(false)
              setActiveNav('report')
            }}
            onClose={() => setShowMappingModal(false)}
            onRefreshTemplates={() => void fetchImportTemplates()}
            onCreateTemplate={createImportTemplateRecord}
            onUpdateTemplate={updateImportTemplateRecord}
          />
        )}
        {editingCargo && (
          <div className="fixed inset-0 z-50 grid place-items-center bg-black/45 p-4">
            <form className="w-full max-w-[560px] rounded-xl bg-white p-5 shadow-2xl" onSubmit={saveEditedCargo} aria-label={t.editCargoTitle}>
              <div className="mb-4 flex items-start justify-between gap-4">
                <div>
                  <h3 className="text-xl font-bold text-slate-900">{t.editCargoTitle}</h3>
                  <p className="mt-1 text-sm text-slate-500">{editingCargo.name}</p>
                </div>
                <button className="border border-slate-300 bg-white px-3 py-1 text-sm font-semibold" type="button" onClick={() => setEditingCargo(null)} aria-label={t.closeEditDialog}>
                  ×
                </button>
              </div>
              <div className="grid grid-cols-[1fr_72px] gap-3">
                <label className="field-label">{t.name}<input className="field-input mt-1" value={editForm.name} onChange={(event) => setEditForm((current) => ({ ...current, name: event.target.value }))} /></label>
                <label className="field-label">{t.label}<input className="field-input mt-1 text-center font-bold" maxLength={12} value={editForm.label ?? ''} onChange={(event) => setEditForm((current) => ({ ...current, label: event.target.value.toUpperCase() }))} /></label>
              </div>
              <div className="mt-3 grid grid-cols-3 gap-3">
                <label className="field-label">{t.length}<input className="field-input mt-1" type="number" value={editForm.length} onChange={(event) => updateEditNumber('length', event.target.value)} /></label>
                <label className="field-label">{t.width}<input className="field-input mt-1" type="number" value={editForm.width} onChange={(event) => updateEditNumber('width', event.target.value)} /></label>
                <label className="field-label">{t.height}<input className="field-input mt-1" type="number" value={editForm.height} onChange={(event) => updateEditNumber('height', event.target.value)} /></label>
              </div>
              <div className="mt-3 grid grid-cols-[1fr_1fr_72px] gap-3">
                <label className="field-label">{t.weight}<input className="field-input mt-1" type="number" value={editForm.weight} onChange={(event) => updateEditNumber('weight', event.target.value)} /></label>
                <label className="field-label">{t.quantity}<input className="field-input mt-1" type="number" value={editForm.quantity} onChange={(event) => updateEditNumber('quantity', event.target.value)} /></label>
                <label className="field-label">{t.color}<input className="mt-1 h-10 w-full border border-[#a8a8a8]" type="color" value={editForm.color} onChange={(event) => setEditForm((current) => ({ ...current, color: event.target.value }))} /></label>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                <label className="flex items-center gap-2"><input checked={editForm.canRotate} type="checkbox" onChange={(event) => setEditForm((current) => ({ ...current, canRotate: event.target.checked }))} />{t.rotate}</label>
                <label className="flex items-center gap-2"><input checked={editForm.stackable} type="checkbox" onChange={(event) => setEditForm((current) => ({ ...current, stackable: event.target.checked, maxStackLayers: event.target.checked ? current.maxStackLayers : undefined }))} />{t.stackable}</label>
                <label className="flex items-center gap-2"><input checked={editForm.groundOnly ?? false} type="checkbox" onChange={(event) => setEditForm((current) => ({ ...current, groundOnly: event.target.checked }))} />{t.groundOnly}</label>
              </div>
              {editForm.stackable && (
                <label className="field-label mt-3 block" data-testid="edit-max-stack-layers-field">
                  {t.maxStackLayers}
                  <input
                    className="field-input mt-1"
                    type="number"
                    min={1}
                    value={editForm.maxStackLayers ?? ''}
                    onChange={(event) => updateEditMaxStackLayers(event.target.value)}
                  />
                </label>
              )}
              <div className="mt-5 flex justify-end gap-2">
                <button className="border border-slate-300 bg-white px-4 py-2 text-sm font-semibold" type="button" onClick={() => setEditingCargo(null)}>
                  {t.cancel}
                </button>
                <button className="archive-button px-4 py-2 text-sm" type="submit">
                  {t.saveChanges}
                </button>
              </div>
            </form>
          </div>
        )}
      </div>
      {showCustomContainerDialog && (
        CustomContainerDialog ? (
          <CustomContainerDialog
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
        ) : (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4" data-testid="custom-container-dialog-loader">
            {customContainerDialogLoadFailed ? (
              <div className="w-full max-w-md rounded-lg bg-white p-6 text-center shadow-2xl">
                <p className="text-sm font-semibold text-red-700" data-testid="custom-container-dialog-load-error">
                  {locale === 'zh' ? '柜型管理加载失败' : 'Failed to load container manager'}
                </p>
                <div className="mt-4 flex justify-center gap-2">
                  <button className="archive-button" type="button" onClick={() => window.location.reload()}>
                    {locale === 'zh' ? '重新加载页面' : 'Reload page'}
                  </button>
                  <button className="archive-button secondary" type="button" onClick={() => setShowCustomContainerDialog(false)}>
                    {locale === 'zh' ? '关闭' : 'Close'}
                  </button>
                </div>
              </div>
            ) : (
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-purple-600 border-t-transparent" role="status" aria-label={locale === 'zh' ? '正在加载柜型管理' : 'Loading container manager'} />
            )}
          </div>
        )
      )}
      <DebugPanel snapshot={debugSnapshot} />
    </main>
  )
}

export default Workbench
