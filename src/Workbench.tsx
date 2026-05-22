import { useMemo, useRef, useState, useEffect } from 'react'
import type { FormEvent, DragEvent as ReactDragEvent } from 'react'
import * as XLSX from 'xlsx'
import { ContainerScene } from './components/ContainerScene'
import type { SceneViewMode } from './components/ContainerScene'
import { ContainerPlan2D } from './components/ContainerPlan2D'
import type { PlanViewMode } from './components/ContainerPlan2D'
import { ManualPlacement2D } from './components/ManualPlacement2D'
import {
  addBox as manualAddBox,
  buildPool as manualBuildPool,
  commit as manualCommit,
  emptyHistory as manualEmptyHistory,
  makeManualBox,
  redo as manualRedo,
  removeBox as manualRemoveBox,
  rotateBox as manualRotateBox,
  setBoxPosition as manualSetBoxPosition,
  toPlacedBoxes as manualToPlacedBoxes,
  undo as manualUndo,
  validateDraft as manualValidateDraft,
} from './lib/manualPlacement'
import type { ManualHistory } from './lib/manualPlacement'
import { containers, effectiveContainer, formatCubicMeters, getContainerVolume } from './data/containers'
import { buildExportPlanRows } from './lib/exportPlan'
import type { HistoryPlan } from './lib/historyPlans'
import { createClientId } from './lib/clientId'
import { parseCargoRows, parseCargoRowsWithMapping } from './lib/importCargo'
import type { ImportCargoRow } from './lib/importCargo'
import { normalizeCargoLabelColors } from './lib/labels'
import { calculatePacking } from './lib/packing'
import type { CargoItem, ContainerSpec, LoadingMode, Locale, PackingDiagnostic, PackingLayer, CustomDbContainer, DbHistoryPlan } from './types'
import { isLoggedIn, getCurrentUser, fetchWithAuth, removeToken } from './lib/auth'
import type { User } from './lib/auth'
import { LoginPage } from './components/LoginPage'
import { RegisterPage } from './components/RegisterPage'
import { UserManagement } from './components/UserManagement'
import { CustomContainerDialog } from './components/CustomContainerDialog'

const colors = ['#f59e0b', '#0ea5e9', '#22c55e', '#ef4444', '#8b5cf6', '#14b8a6']

const copy = {
  en: {
    nav: ['Workbench', 'History'],
    title: 'Cargo loading workspace',
    shipment: 'Enter shipment name',
    savedShipment: 'Shipment name is saved with history plans',
    menu: 'Workspace menu',
    closeMenu: 'Close menu',
    overview: 'Overview',
    reportNavHint: 'Report tab is active',
    cargoNavHint: 'Cargo item panel focused',
    containerNavHint: 'Cargo space panel focused',
    group: 'Group 1',
    note: '- click to edit note',
    name: 'Name',
    length: 'Length mm',
    width: 'Width mm',
    height: 'Height mm',
    weight: 'Weight kg',
    quantity: 'Quantity',
    color: 'Color',
    rotate: 'Allow rotation',
    stackable: 'Stackable',
    add: '+ Add cargo item',
    cargoItems: 'Cargo items',
    unitParameters: 'Pallet / cargo unit parameters',
    ruleSummary: 'Loading rules',
    collapse: 'Collapse',
    expand: 'Expand',
    importLog: 'Import log',
    noImportLog: 'No import activity yet',
    editCargo: 'Edit cargo',
    editCargoTitle: 'Edit cargo item',
    saveChanges: 'Save changes',
    cancel: 'Cancel',
    closeEditDialog: 'Close edit dialog',
    deleteCargo: 'Delete cargo',
    dragCargo: 'Drag to reorder cargo',
    dropCargo: 'Drop cargo here',
    historyPage: 'History plans',
    backToWorkbench: 'Back to workbench',
    boundaryRule: 'Effective container boundary',
    payloadRule: 'Max payload',
    supportRule: 'Support and stackability',
    containerConfig: 'Container parameters',
    containerType: 'Container type',
    loadingMode: 'Loading mode',
    volumeMode: 'Volume priority',
    weightMode: 'Weight priority',
    quantityMode: 'Quantity priority',
    inputMode: 'Input order',
    hardRules: 'Hard rules',
    selectableRules: 'Selectable rules',
    customContainer: 'Custom container',
    maxWeight: 'Max payload kg',
    doorGap: 'Door gap mm',
    topGap: 'Top gap mm',
    sideGap: 'Side gap mm',
    importExcel: 'Import XLSX',
    exportExcel: 'Export XLSX',
    exportView: 'Export view',
    importIssue: 'Import issue',
    importWarning: 'Import warning',
    importParseFailed: 'Import parse failed',
    importNoData: 'No usable data found',
    importSuccess: 'Import success',
    importMappedFields: 'Mapped fields',
    importConvertedRows: 'Rows converted from cm',
    mappingTitle: 'Smart field mapping',
    mappingSubtitle: 'Match the source columns to required fields and choose units before importing.',
    mappingPreview: 'Source data preview',
    mappingUnit: 'Unit',
    mappingAutoUnit: 'Auto',
    mappingTotalRows: 'Total rows',
    mappingTotalCols: 'columns',
    mappingConfirm: 'Confirm import',
    mappingCancel: 'Cancel',
    mappingSelectColumn: '-- Select column --',
    mappingConvertHint: 'Values will be converted to mm',
    mappingFieldLabel: 'Cargo label',
    mappingFieldName: 'Cargo name',
    mappingFieldLength: 'Length',
    mappingFieldWidth: 'Width',
    mappingFieldHeight: 'Height',
    mappingFieldWeight: 'Unit weight',
    mappingFieldQuantity: 'Quantity',
    load: 'Load',
    view2d: '2D',
    view3d: '3D',
    isoView: 'Iso',
    freeView: 'Free view',
    topView: 'Top',
    frontView: 'Front',
    sideView: 'Side',
    results: 'Results',
    loaded: 'Loaded',
    cargoTypes: 'Cargo types',
    volumeUse: 'Volume utilization',
    weightUse: 'Weight utilization',
    containerVolume: 'Container volume',
    volume: 'Volume',
    qty: 'qty',
    unloaded: 'Unloaded cargo',
    layers: 'Layer-by-layer placement',
    details: 'Details',
    originalSize: 'Original size',
    actualSize: 'Actual size',
    workStep: 'Step',
    diagnostics: 'Diagnostics',
    history: 'History',
    savePlan: 'Save plan',
    shipmentName: 'Shipment',
    restore: 'Restore',
    noHistory: 'No saved plans',
    allLayers: 'All layers',
    allLabels: 'All labels',
    currentLayer: 'Current layer',
    labelFilter: 'Label filter',
    previousLayer: 'Prev',
    nextLayer: 'Next',
    showLayer: 'Show layer',
    layerStats: 'Layer stats',
    loadingSteps: 'Loading steps',
    supportedBy: 'Supported by',
    planned: 'Planned',
    placed: 'Placed',
    unplacedCount: 'Unplaced',
    failureReason: 'Failure reason',
    noFailure: 'None',
    label: 'Label',
    language: '中文',
    newProjectName: 'New Project',
    projectNameText: 'Project Name',
    newProject: 'New Project',
    saveProject: 'Save Project',
    uploadProject: 'Upload Project',
    autoMode: 'Auto placement',
    manualMode: 'Manual placement',
    placementPool: 'Placement pool',
    poolRemaining: 'Remaining',
    manualIssues: 'Validation issues',
    manualNoIssues: 'No validation issues',
    manualRotate: 'Rotate 90°',
    manualDelete: 'Delete',
    undo: 'Undo',
    redo: 'Redo',
    manualHint: 'Drag cargo from the pool. Use R to rotate, arrows to move (Shift = 500mm), Delete to remove, Ctrl/Cmd+Z to undo.',
    poolEmpty: 'All cargo has been placed.',
    continueManually: 'Continue manually',
    modeManual3D: '3D Review',
  },
  zh: {
    nav: ['工作台', '历史方案'],
    title: '货柜排箱装柜工作台',
    shipment: '输入装运名称',
    savedShipment: '装运名称会随历史方案保存',
    menu: '工作台菜单',
    closeMenu: '关闭菜单',
    overview: '总览',
    reportNavHint: '已切换到装箱报告',
    cargoNavHint: '已聚焦货物项目',
    containerNavHint: '已聚焦货柜空间',
    group: '分组 1',
    note: '- 点击编辑备注',
    name: '名称',
    length: '长 mm',
    width: '宽 mm',
    height: '高 mm',
    weight: '重量 kg',
    quantity: '数量',
    color: '颜色',
    rotate: '允许旋转',
    stackable: '允许堆叠',
    add: '+ 添加货物',
    cargoItems: '货物项目',
    unitParameters: '托盘 / 货物单元参数',
    ruleSummary: '装载规则',
    collapse: '折叠',
    expand: '展开',
    importLog: '导入日志',
    noImportLog: '暂无导入记录',
    editCargo: '编辑货物',
    editCargoTitle: '编辑货物项目',
    saveChanges: '保存修改',
    closeEditDialog: '关闭编辑对话框',
    cancel: '取消',
    deleteCargo: '删除货物',
    dragCargo: '拖拽调整货物顺序',
    dropCargo: '拖放到这里',
    historyPage: '历史方案',
    backToWorkbench: '返回工作台',
    boundaryRule: '有效货柜边界',
    payloadRule: '最大载重',
    supportRule: '支撑与堆叠限制',
    containerConfig: '货柜参数',
    containerType: '货柜类型',
    loadingMode: '装载模式',
    volumeMode: '体积优先',
    weightMode: '重量优先',
    quantityMode: '数量优先',
    inputMode: '录入顺序',
    hardRules: '硬约束',
    selectableRules: '可选规则',
    customContainer: '自定义柜型',
    maxWeight: '最大载重 kg',
    doorGap: '柜门预留 mm',
    topGap: '顶部余量 mm',
    sideGap: '左右预留 mm',
    importExcel: '导入 XLSX',
    exportExcel: '导出 XLSX',
    exportView: '导出视图',
    importIssue: '导入问题',
    importWarning: '导入提醒',
    importParseFailed: '导入解析失败',
    importNoData: '未找到可用数据',
    importSuccess: '导入成功',
    importMappedFields: '识别字段',
    importConvertedRows: '厘米换算行数',
    mappingTitle: '智能字段映射',
    mappingSubtitle: '请关联源文件列并选择单位以开始导入。',
    mappingPreview: '原始数据预览',
    mappingUnit: '单位',
    mappingAutoUnit: '自动识别',
    mappingTotalRows: '总行数',
    mappingTotalCols: '列',
    mappingConfirm: '确认导入',
    mappingCancel: '取消',
    mappingSelectColumn: '-- 请选择数据列 --',
    mappingConvertHint: '将转换为 mm',
    mappingFieldLabel: '货物标识',
    mappingFieldName: '货物名称',
    mappingFieldLength: '长度',
    mappingFieldWidth: '宽度',
    mappingFieldHeight: '高度',
    mappingFieldWeight: '单件重量',
    mappingFieldQuantity: '数量',
    load: '装箱',
    view2d: '2D',
    view3d: '3D',
    isoView: '轴测',
    freeView: '自由视角',
    topView: '俯视',
    frontView: '正视',
    sideView: '侧视',
    results: '结果',
    loaded: '已装入',
    cargoTypes: '参与箱型',
    volumeUse: '体积利用率',
    weightUse: '重量利用率',
    containerVolume: '货柜体积',
    volume: '体积',
    qty: '数量',
    unloaded: '未装入货物',
    layers: '逐层添加货物',
    details: '明细表',
    originalSize: '原始尺寸',
    actualSize: '实际朝向',
    workStep: '步骤',
    diagnostics: '合规与诊断',
    history: '历史方案',
    savePlan: '保存方案',
    shipmentName: '装运名称',
    restore: '恢复',
    noHistory: '暂无历史方案',
    allLayers: '全部层',
    allLabels: '全部标签',
    currentLayer: '当前层',
    labelFilter: '标签筛选',
    previousLayer: '上层',
    nextLayer: '下层',
    showLayer: '显示层',
    layerStats: '当前层统计',
    loadingSteps: '装柜作业步骤',
    supportedBy: '支撑来源',
    planned: '计划',
    placed: '已装',
    unplacedCount: '未装',
    failureReason: '失败原因',
    noFailure: '无',
    label: '标识',
    language: 'English',
    newProjectName: '新装箱项目',
    projectNameText: '项目名称',
    newProject: '新建项目',
    saveProject: '保存项目',
    uploadProject: '上传项目',
    autoMode: '自动排布',
    manualMode: '手动排布',
    placementPool: '待放置池',
    poolRemaining: '剩余',
    manualIssues: '校验问题',
    manualNoIssues: '当前无校验问题',
    manualRotate: '旋转 90°',
    manualDelete: '删除',
    undo: '撤销',
    redo: '重做',
    manualHint: '从待放置池拖入货物。R 旋转，方向键移动（Shift 500mm），Delete 删除，Ctrl/Cmd+Z 撤销。',
    poolEmpty: '所有货物已放置完毕。',
    continueManually: '继续手动微调',
    modeManual3D: '3D 复核',
  },
}

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
type ResultTab = 'layers' | 'details' | 'diagnostics' | 'importLog'
type NavTarget = 'overview' | 'report' | 'cargo' | 'container' | 'history'

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
}

function nextLabel(index: number) {
  return String.fromCharCode(65 + (index % 26))
}

function layerName(layer: PackingLayer, locale: Locale) {
  return locale === 'zh' ? `第${layer.physicalLayer}层` : `Layer ${layer.physicalLayer}`
}

function formatDimensions(length: number | '', width: number | '', height: number | '') {
  return length === '' || width === '' || height === '' ? '-' : `${length} x ${width} x ${height}`
}

function moveItem<T>(items: T[], fromIndex: number, toIndex: number) {
  if (fromIndex === toIndex || fromIndex < 0 || toIndex < 0) {
    return items
  }

  const next = [...items]
  const [item] = next.splice(fromIndex, 1)
  next.splice(toIndex, 0, item)
  return next
}

function formatTemplate(template: string, params?: Record<string, string | number>) {
  if (!params) return template
  return template.replace(/\{(\w+)\}/g, (match, key: string) =>
    Object.prototype.hasOwnProperty.call(params, key) ? String(params[key]) : match,
  )
}

const importCodeMessages: Record<Locale, Record<string, string>> = {
  zh: {
    'cm-converted': '第 {row} 行已从厘米换算为毫米。',
    'invalid-dimensions': '第 {row} 行缺少或非法的长宽高。',
    'invalid-quantity': '第 {row} 行缺少或非法的数量。',
    'quantity-defaulted': '第 {row} 行未填数量，已默认为 1。',
  },
  en: {
    'cm-converted': 'Row {row}: Centimeter dimensions were converted to millimeters.',
    'invalid-dimensions': 'Row {row}: Missing or invalid length, width, or height.',
    'invalid-quantity': 'Row {row}: Missing or invalid quantity.',
    'quantity-defaulted': 'Row {row}: Quantity was missing and defaulted to 1.',
  },
}

const unplacedReasonMessages: Record<Locale, Record<string, string>> = {
  zh: {
    'exceeds-dimensions': '超出货柜尺寸',
    'exceeds-payload': '超过最大载重',
    'no-space': '没有剩余装载空间',
  },
  en: {
    'exceeds-dimensions': 'Exceeds container dimensions',
    'exceeds-payload': 'Exceeds maximum payload',
    'no-space': 'No remaining loading space',
  },
}

function translateImportIssue(
  issue: { code: string; params?: Record<string, string | number>; row: number; message: string },
  locale: Locale,
) {
  const template = importCodeMessages[locale]?.[issue.code]
  if (template) {
    return formatTemplate(template, issue.params ?? { row: issue.row })
  }
  return issue.message
}

function diagnosticMessage(diagnostic: PackingDiagnostic, locale: Locale) {
  if (diagnostic.id.startsWith('unplaced-') && diagnostic.code) {
    const reason = unplacedReasonMessages[locale]?.[diagnostic.code] ?? diagnostic.code
    const params = diagnostic.params ?? {}
    const label = String(params.label ?? '')
    const name = String(params.name ?? '')
    const quantity = String(params.quantity ?? '')
    if (locale === 'zh') {
      return `${label} ${name}：${quantity} 未装入，原因：${reason}。`
    }
    return `${label} ${name}: ${quantity} unplaced because ${reason}.`
  }

  if (locale === 'en') {
    return diagnostic.message
  }

  const zhMessages: Record<string, string> = {
    'boundary-check': diagnostic.severity === 'error'
      ? '边界检查失败：至少一个已装箱体超出有效货柜。'
      : '边界检查通过：所有已装箱体都在有效货柜内。',
    'weight-check': diagnostic.severity === 'error'
      ? '载重检查失败：已装货物超过最大载重。'
      : '载重检查通过：已装货物未超过最大载重。',
    'overlap-check': diagnostic.severity === 'error'
      ? '重叠检查失败：至少一组已装箱体发生重叠。'
      : '重叠检查通过：已装箱体没有互相重叠。',
    'support-check': diagnostic.severity === 'error'
      ? '支撑检查失败：堆叠货物缺少明确支撑。'
      : diagnostic.severity === 'warning'
        ? '支撑检查提醒：部分箱体只有部分支撑。'
        : '支撑检查通过：堆叠箱体都有明确支撑关系。',
    'stacking-check': diagnostic.severity === 'error'
      ? '堆叠检查失败：货物被放在不可堆叠项目上。'
      : '堆叠检查通过：不可堆叠项目未作为支撑使用。',
    'optimization-suggestion': diagnostic.severity === 'warning'
      ? '优化建议：检查未装入货物、柜型、预留间隙、载重限制或堆叠规则。'
      : '优化建议：当前方案没有明显合规阻塞。',
  }

  if (zhMessages[diagnostic.id]) {
    return zhMessages[diagnostic.id]
  }

  return diagnostic.message
}

function failureReason(reason: string, locale: Locale, reasonCode?: string) {
  if (reasonCode) {
    const translated = unplacedReasonMessages[locale]?.[reasonCode]
    if (translated) return translated
  }

  if (locale === 'en') {
    return reason
  }

  const mapping: Record<string, string> = {
    'Exceeds container dimensions': '超出货柜尺寸',
    'Exceeds maximum payload': '超过最大载重',
    'No remaining loading space': '没有剩余装载空间',
  }

  return mapping[reason] ?? reason
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

function Workbench() {
  const [locale, setLocale] = useState<Locale>('zh')
  const t = copy[locale]
  const [projectName, setProjectName] = useState(() => locale === 'zh' ? '新装箱项目' : 'New Project')
  const [shipmentName, setShipmentName] = useState('')
  const [menuOpen, setMenuOpen] = useState(false)
  const [activeNav, setActiveNav] = useState<NavTarget>('overview')
  const [selectedContainerId, setSelectedContainerId] = useState(containers[0].id)
  const [loadingMode, setLoadingMode] = useState<LoadingMode>('quantity')
  const [containerOverrides, setContainerOverrides] = useState(() => Object.fromEntries(containers.map((container) => [container.id, container])))
  const [customContainer, setCustomContainer] = useState(customContainerDefaults)
  const [cargoItems, setCargoItems] = useState<CargoItem[]>(initialCargo)
  const [form, setForm] = useState<CargoForm>(emptyForm)
  const [editingCargo, setEditingCargo] = useState<CargoItem | null>(null)
  const [editForm, setEditForm] = useState<CargoForm>(emptyForm)
  const [hasCalculated, setHasCalculated] = useState(true)
  const [activeLayerId, setActiveLayerId] = useState('all')
  const [activeLabelId, setActiveLabelId] = useState('all')
  const [workspaceView, setWorkspaceView] = useState<WorkspaceView>('3d')
  const [sceneViewMode, setSceneViewMode] = useState<SceneViewMode>('iso')
  const [freeViewEnabled, setFreeViewEnabled] = useState(false)
  const [planViewMode, setPlanViewMode] = useState<PlanViewMode>('top')
  const [activeResultTab, setActiveResultTab] = useState<ResultTab>('layers')
  const [placementMode, setPlacementMode] = useState<'auto' | 'manual'>('auto')
  const [manualHistory, setManualHistory] = useState<ManualHistory>(() => manualEmptyHistory())
  const [manualSelectedId, setManualSelectedId] = useState<string | null>(null)
  
  // Backend integrated states
  const [loggedIn, setLoggedIn] = useState(() => isLoggedIn())
  const [showRegister, setShowRegister] = useState(false)
  const [currentUser, setCurrentUser] = useState<User | null>(() => getCurrentUser())
  const [showUserManagement, setShowUserManagement] = useState(false)
  const [customContainers, setCustomContainers] = useState<ContainerSpec[]>([])
  const [showCustomContainerDialog, setShowCustomContainerDialog] = useState(false)
  const [historyPlans, setHistoryPlans] = useState<HistoryPlan[]>([])

  const [importMessages, setImportMessages] = useState<string[]>([])
  const [selectedBoxId, setSelectedBoxId] = useState<string | null>(null)
  const [containerCollapsed, setContainerCollapsed] = useState(false)
  const [rulesCollapsed, setRulesCollapsed] = useState(false)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [draggedCargoId, setDraggedCargoId] = useState<string | null>(null)
  const [showMappingModal, setShowMappingModal] = useState(false)
  const [importRows, setImportRows] = useState<ImportCargoRow[]>([])
  const [customMapping, setCustomMapping] = useState<Record<string, string>>({
    label: '',
    name: '',
    length: '',
    width: '',
    height: '',
    weight: '',
    quantity: '',
  })
  type DimensionUnit = 'auto' | 'mm' | 'cm'
  const [customUnits, setCustomUnits] = useState<Record<'length' | 'width' | 'height', DimensionUnit>>({
    length: 'auto',
    width: 'auto',
    height: 'auto',
  })
  const workspaceRef = useRef<HTMLElement | null>(null)
  const reportRef = useRef<HTMLElement | null>(null)
  const cargoRef = useRef<HTMLFormElement | null>(null)
  const containerRef = useRef<HTMLElement | null>(null)

  const selectedContainer = useMemo(() => {
    const standard = containerOverrides[selectedContainerId] ?? containers.find(c => c.id === selectedContainerId)
    if (standard) return standard

    const custom = customContainers.find(c => c.id === selectedContainerId)
    if (custom) return custom

    return customContainer
  }, [selectedContainerId, containerOverrides, customContainers, customContainer])

  const fetchCustomContainers = async () => {
    if (!isLoggedIn()) return
    try {
      const res = await fetchWithAuth('/api/containers/custom')
      if (!res.ok) throw new Error('获取自定义柜型失败')
      const data = await res.json()
      const mapped: ContainerSpec[] = data.map((item: CustomDbContainer) => ({
        id: item.id,
        label: item.name,
        description: `自定义柜型: ${item.name} (${item.length}x${item.width}x${item.height}mm)`,
        length: item.length,
        width: item.width,
        height: item.height,
        maxWeight: item.max_weight,
        doorGap: item.door_gap,
        topGap: item.top_gap,
        sideGap: item.side_gap,
      }))
      setCustomContainers(mapped)
    } catch (err) {
      console.error(err)
    }
  }

  const fetchHistory = async () => {
    if (!isLoggedIn()) return
    try {
      const res = await fetchWithAuth('/api/history')
      if (!res.ok) throw new Error('获取历史方案失败')
      const data = await res.json()
      const mapped = data.map((item: DbHistoryPlan) => ({
        id: item.id,
        createdAt: item.created_at,
        projectName: item.project_name,
        shipmentName: item.shipment_name,
        loadingMode: item.loading_mode,
        containerId: item.data.containerId,
        container: item.data.container,
        cargoItems: item.data.cargoItems,
        placedCount: item.data.placedCount,
        totalCargoCount: item.data.totalCargoCount,
        layerCount: item.data.layerCount,
        labelSummary: item.data.labelSummary,
      }))
      setHistoryPlans(mapped)
    } catch (err) {
      console.error(err)
    }
  }

  const deleteHistoryPlan = async (id: string) => {
    if (!confirm(locale === 'zh' ? '确认删除该历史方案吗？' : 'Are you sure you want to delete this plan?')) {
      return
    }
    try {
      const res = await fetchWithAuth(`/api/history/${id}`, {
        method: 'DELETE',
      })
      if (!res.ok) throw new Error('删除失败')
      await fetchHistory()
    } catch (err) {
      console.error(err)
      alert(locale === 'zh' ? '删除失败' : 'Failed to delete')
    }
  }

  useEffect(() => {
    if (loggedIn) {
      fetchHistory()
      fetchCustomContainers()
    }
  }, [loggedIn])

  const renderingContainer = effectiveContainer(selectedContainer)
  const displayCargoItems = useMemo(() => normalizeCargoLabelColors(cargoItems), [cargoItems])
  const result = useMemo(() => calculatePacking(selectedContainer, displayCargoItems, { loadingMode }), [displayCargoItems, loadingMode, selectedContainer])
  const detailRows = useMemo(() => buildExportPlanRows(displayCargoItems, result), [displayCargoItems, result])

  const manualDraft = manualHistory.present
  const manualPool = useMemo(
    () => manualBuildPool(displayCargoItems, manualDraft),
    [displayCargoItems, manualDraft],
  )
  const manualIssues = useMemo(
    () => manualValidateDraft(manualDraft, renderingContainer),
    [manualDraft, renderingContainer],
  )
  const manualInvalidBoxIds = useMemo(() => {
    const ids = new Set<string>()
    for (const issue of manualIssues) {
      ids.add(issue.boxId)
    }
    return ids
  }, [manualIssues])
  const manualPlacedBoxes = useMemo(
    () => manualToPlacedBoxes(manualDraft, manualInvalidBoxIds),
    [manualDraft, manualInvalidBoxIds],
  )
  const manualCanUndo = manualHistory.past.length > 0
  const manualCanRedo = manualHistory.future.length > 0

  const commitManual = (nextDraft: typeof manualDraft) => {
    setManualHistory((current) => manualCommit(current, nextDraft))
  }

  const handleManualMoveBox = (id: string, x: number, y: number) => {
    commitManual(manualSetBoxPosition(manualDraft, id, x, y))
  }

  const handleManualDropFromPool = (cargoId: string, dropX: number, dropY: number) => {
    const cargoItem = displayCargoItems.find((item) => item.id === cargoId)
    if (!cargoItem) return
    const used = manualDraft.boxes.filter((box) => box.cargoId === cargoId).length
    if (used >= cargoItem.quantity) return
    const boxId = `manual-${cargoId}-${Date.now()}-${used + 1}`
    const newBox = makeManualBox({
      id: boxId,
      cargoId,
      label: cargoItem.label ?? cargoItem.name,
      color: cargoItem.color,
      length: cargoItem.length,
      width: cargoItem.width,
      height: cargoItem.height,
      x: Math.max(0, dropX - cargoItem.length / 2),
      y: Math.max(0, dropY - cargoItem.width / 2),
    })
    commitManual(manualAddBox(manualDraft, newBox))
    setManualSelectedId(boxId)
  }

  const handleManualPoolDragStart = (event: ReactDragEvent<HTMLDivElement>, cargoId: string) => {
    event.dataTransfer.setData('application/x-cargo-id', cargoId)
    event.dataTransfer.setData('text/plain', cargoId)
    event.dataTransfer.effectAllowed = 'copy'
  }

  const handleManualUndo = () => {
    setManualHistory((current) => manualUndo(current))
  }

  const handleManualRedo = () => {
    setManualHistory((current) => manualRedo(current))
  }

  const handleManualRotate = () => {
    if (!manualSelectedId) return
    commitManual(manualRotateBox(manualDraft, manualSelectedId))
  }

  const handleManualDelete = () => {
    if (!manualSelectedId) return
    commitManual(manualRemoveBox(manualDraft, manualSelectedId))
    setManualSelectedId(null)
  }

  const handleContinueManually = () => {
    const nextDraft = {
      boxes: result.placed.map((box) => ({
        id: `manual-${box.id}`,
        cargoId: box.cargoId,
        label: box.label,
        color: box.color,
        x: box.x,
        y: box.y,
        z: box.z,
        length: box.length,
        width: box.width,
        height: box.height,
        orientationKey: box.orientationKey,
        labelRotationDeg: box.labelRotationDeg,
      })),
    }
    setManualHistory((current) => manualCommit(current, nextDraft))
    setManualSelectedId(null)
    setPlacementMode('manual')
  }

  useEffect(() => {
    if (placementMode !== 'manual') return
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
        event.preventDefault()
        if (event.shiftKey) {
          setManualHistory((current) => manualRedo(current))
        } else {
          setManualHistory((current) => manualUndo(current))
        }
        return
      }
      if (isMeta && (event.key === 'y' || event.key === 'Y')) {
        event.preventDefault()
        setManualHistory((current) => manualRedo(current))
        return
      }

      if (event.key === 'Escape') {
        setManualSelectedId(null)
        return
      }

      if (!manualSelectedId) return

      if (event.key === 'r' || event.key === 'R') {
        if (event.shiftKey) return
        event.preventDefault()
        setManualHistory((current) => manualCommit(current, manualRotateBox(current.present, manualSelectedId)))
        return
      }

      if (event.key === 'Delete' || event.key === 'Backspace') {
        event.preventDefault()
        setManualHistory((current) => manualCommit(current, manualRemoveBox(current.present, manualSelectedId)))
        setManualSelectedId(null)
        return
      }

      const arrowDeltas: Record<string, { dx: number; dy: number }> = {
        ArrowLeft: { dx: -1, dy: 0 },
        ArrowRight: { dx: 1, dy: 0 },
        ArrowUp: { dx: 0, dy: 1 },
        ArrowDown: { dx: 0, dy: -1 },
      }
      const delta = arrowDeltas[event.key]
      if (delta) {
        event.preventDefault()
        const step = event.shiftKey ? 500 : 50
        setManualHistory((current) => {
          const box = current.present.boxes.find((b) => b.id === manualSelectedId)
          if (!box) return current
          return manualCommit(
            current,
            manualSetBoxPosition(current.present, manualSelectedId, box.x + delta.dx * step, box.y + delta.dy * step),
          )
        })
      }
    }

    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [placementMode, manualSelectedId])

  const activeLayer = result.layers.find((layer) => layer.id === activeLayerId)
  const visibleBoxes = hasCalculated
    ? result.placed.filter((box) => (activeLayerId === 'all' || String(box.physicalLayer) === activeLayerId) && (activeLabelId === 'all' || box.label === activeLabelId))
    : []
  const labelOptions = [...new Set(result.labelStats.map((item) => item.label))]
  const activeLayerIndex = result.layers.findIndex((layer) => layer.id === activeLayerId)
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

  const updateContainerNumber = (field: 'length' | 'width' | 'height' | 'maxWeight' | 'doorGap' | 'topGap' | 'sideGap', value: string) => {
    const nextValue = Math.max(0, Number(value) || 0)
    if (selectedContainerId === 'custom') {
      setCustomContainer((current) => ({ ...current, [field]: nextValue }))
      return
    }
    setContainerOverrides((current) => ({
      ...current,
      [selectedContainerId]: {
        ...(current[selectedContainerId] ?? containers.find((container) => container.id === selectedContainerId) ?? containers[0]),
        [field]: nextValue,
      },
    }))
  }

  const addCargo = (event: FormEvent) => {
    event.preventDefault()
    const next: CargoItem = {
      ...form,
      id: createClientId(),
      name: form.name.trim() || `Cargo ${cargoItems.length + 1}`,
      label: (form.label || nextLabel(cargoItems.length)).toUpperCase().slice(0, 2),
      quantity: Math.max(1, Math.floor(form.quantity)),
    }
    setCargoItems((items) => [...items, next])
    setForm((current) => ({
      ...current,
      name: `Carton ${nextLabel(cargoItems.length + 2)}`,
      label: nextLabel(cargoItems.length + 1),
      color: colors[(cargoItems.length + 1) % colors.length],
    }))
    setHasCalculated(false)
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
    })
  }

  const saveEditedCargo = (event: FormEvent) => {
    event.preventDefault()
    if (!editingCargo) return

    const nextCargo: CargoItem = {
      ...editForm,
      id: editingCargo.id,
      name: editForm.name.trim() || editingCargo.name,
      label: (editForm.label || editingCargo.label || nextLabel(cargoItems.length)).toUpperCase().slice(0, 2),
      quantity: Math.max(1, Math.floor(editForm.quantity)),
    }

    setCargoItems((items) => items.map((item) => item.id === editingCargo.id ? nextCargo : item))
    setEditingCargo(null)
    setSelectedBoxId(null)
    setHasCalculated(false)
  }

  const confirmMappingImport = () => {
    const dimensionFields: Array<'length' | 'width' | 'height'> = ['length', 'width', 'height']
    const effectiveMapping: Record<string, string> = { ...customMapping }
    const effectiveRows: ImportCargoRow[] = importRows.map((row) => ({ ...row }))

    dimensionFields.forEach((field) => {
      const colName = customMapping[field]
      const unit = customUnits[field]
      if (!colName || unit === 'auto') return

      // Build a sanitized synthetic key whose unit hint is unambiguous to the
      // lib (which detects cm via substring match). We strip any existing cm /
      // 厘米 markers from the original column name to avoid false positives.
      const sanitized = colName.replace(/cm/gi, '').replace(/厘米/g, '')
      const suffix = unit === 'cm' ? ' cm' : ' mm'
      const syntheticKey = `${sanitized}__unit${suffix}`
      effectiveMapping[field] = syntheticKey
      effectiveRows.forEach((row, index) => {
        row[syntheticKey] = importRows[index]?.[colName]
      })
    })

    const imported = parseCargoRowsWithMapping(effectiveRows, effectiveMapping, { colors })
    setImportMessages([
      `${t.importSuccess}: ${imported.summary.importedRows}`,
      `${t.importMappedFields}: ${imported.summary.mappedFields.join(', ') || '-'}`,
      `${t.importConvertedRows}: ${imported.summary.convertedCentimeterRows}`,
      ...imported.errors.map((issue) => `${t.importIssue} row ${issue.row}: ${translateImportIssue(issue, locale)}`),
      ...imported.warnings.map((issue) => `${t.importWarning} row ${issue.row}: ${translateImportIssue(issue, locale)}`),
    ])
    if (imported.items.length > 0) {
      setCargoItems(imported.items)
      setSelectedBoxId(null)
      setHasCalculated(false)
    }
    setShowMappingModal(false)
    setActiveResultTab('importLog')
    setActiveNav('report')
  }

  const canAutoMap = (row: ImportCargoRow): boolean => {
    const keys = Object.keys(row).map(k => k.toLowerCase())
    const fieldsToCheck = {
      length: ['length', '长', '長', '长度', '長度', 'outer_length_mm', '厘米'],
      width: ['width', '宽', '寬', '宽度', '寬度', 'outer_width_mm', '厘米'],
      height: ['height', '高', '高度', 'outer_height_mm', '厘米'],
      weight: ['weight', '重量', '毛重', 'gross_weight_kg'],
      quantity: ['quantity', '数量', '數量', '箱数', '箱數', '托数', '托數', 'carton_count'],
    }
    return Object.values(fieldsToCheck).every(candidates =>
      keys.some(key => candidates.some(cand => key.includes(cand)))
    )
  }

  const preSelectCol = (fieldKey: string, columns: string[]): string => {
    const candidates = {
      length: ['length', '长', '長', '长度', '長度', 'outer_length_mm'],
      width: ['width', '宽', '寬', '宽度', '寬度', 'outer_width_mm'],
      height: ['height', '高', '高度', 'outer_height_mm'],
      weight: ['weight', '重量', '毛重', 'gross_weight_kg'],
      quantity: ['quantity', '数量', '數量', '箱数', '箱數', '托数', '托數', 'carton_count'],
      name: ['name', '名称', '品名', '名称', '货物名称', 'description'],
      label: ['label', '标签', '代码', '代号', '托盘'],
    }[fieldKey] || []
    return columns.find(col => candidates.some(cand => col.toLowerCase().includes(cand.toLowerCase()))) || columns[0] || ''
  }

  const importExcel = async (file: File | null) => {
    if (!file) return
    let rows: Record<string, string | number>[]
    try {
      const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array' })
      const sheet = workbook.Sheets[workbook.SheetNames[0]]
      rows = sheet ? XLSX.utils.sheet_to_json<Record<string, string | number>>(sheet) : []
    } catch (error) {
      setImportMessages([`${t.importParseFailed}: ${error instanceof Error ? error.message : String(error)}`])
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

    const rowKeys = Object.keys(rows[0] ?? {})
    const autoMappable = canAutoMap(rows[0] ?? {})

    if (autoMappable) {
      const imported = parseCargoRows(rows, { colors })
      setImportMessages([
        `${t.importSuccess}: ${imported.summary.importedRows}`,
        `${t.importMappedFields}: ${imported.summary.mappedFields.join(', ') || '-'}`,
        `${t.importConvertedRows}: ${imported.summary.convertedCentimeterRows}`,
        ...imported.errors.map((issue) => `${t.importIssue} row ${issue.row}: ${translateImportIssue(issue, locale)}`),
        ...imported.warnings.map((issue) => `${t.importWarning} row ${issue.row}: ${translateImportIssue(issue, locale)}`),
      ])
      if (imported.items.length > 0) {
        setCargoItems(imported.items)
        setSelectedBoxId(null)
        setHasCalculated(false)
      }
      setActiveResultTab('importLog')
      setActiveNav('report')
    } else {
      setImportRows(rows)
      const initialMap: Record<string, string> = {}
      const requiredFields = ['label', 'name', 'length', 'width', 'height', 'weight', 'quantity']
      requiredFields.forEach((fieldKey) => {
        initialMap[fieldKey] = preSelectCol(fieldKey, rowKeys)
      })
      setCustomMapping(initialMap)
      setShowMappingModal(true)
    }
  }

  const exportExcel = () => {
    const sheet = XLSX.utils.json_to_sheet(detailRows)
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

  const exportCurrentView = () => {
    if (workspaceView === '2d') {
      const svg = workspaceRef.current?.querySelector('[data-testid="container-plan-2d"]')
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
    const planData = {
      containerId: selectedContainer.id,
      container: selectedContainer,
      cargoItems: displayCargoItems,
      placedCount: result.placedCount,
      totalCargoCount: result.totalCargoCount,
      layerCount: result.layers.length,
      labelSummary: result.labelStats.map((item) => `${item.label}:${item.placed}/${item.planned}`).join(', '),
    }

    try {
      const res = await fetchWithAuth('/api/history', {
        method: 'POST',
        body: JSON.stringify({
          projectName,
          shipmentName,
          loadingMode,
          data: planData,
        }),
      })
      if (!res.ok) {
        throw new Error('保存历史方案失败')
      }
      await fetchHistory()
      setActiveNav('history')
    } catch (err) {
      console.error(err)
      alert(locale === 'zh' ? '保存历史方案失败' : 'Failed to save plan')
    }
  }

  const restorePlan = (plan: HistoryPlan) => {
    setProjectName(plan.projectName || '新装箱项目')
    setShipmentName(plan.shipmentName)
    setSelectedContainerId(plan.containerId)
    if (plan.containerId === 'custom') {
      setCustomContainer(plan.container)
    } else if (containers.some((c) => c.id === plan.containerId)) {
      setContainerOverrides((current) => ({ ...current, [plan.containerId]: plan.container }))
    } else {
      if (!customContainers.some((c) => c.id === plan.containerId)) {
        setCustomContainers((current) => [...current, plan.container])
      }
    }
    setCargoItems(plan.cargoItems)
    setLoadingMode(plan.loadingMode || 'quantity')
    setActiveLayerId('all')
    setActiveLabelId('all')
    setSelectedBoxId(null)
    setHasCalculated(true)
    setActiveResultTab('layers')
    setActiveNav('overview')
  }

  const handleNewProject = () => {
    setProjectName(locale === 'zh' ? '新装箱项目' : 'New Project')
    setShipmentName('')
    setCargoItems(initialCargo)
    setSelectedContainerId(containers[0].id)
    setCustomContainer(customContainerDefaults)
    setLoadingMode('volume')
    setActiveLayerId('all')
    setActiveLabelId('all')
    setSelectedBoxId(null)
    setHasCalculated(true)
    setActiveResultTab('layers')
  }

  const handleSaveProject = () => {
    const config = {
      projectName,
      shipmentName,
      selectedContainerId,
      loadingMode,
      cargoItems,
      customContainer,
    }
    const jsonString = JSON.stringify(config, null, 2)
    const blob = new Blob([jsonString], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `${filenameSlug(projectName || 'project')}.json`
    link.click()
    URL.revokeObjectURL(url)

    // Save to backend history
    const planData = {
      containerId: selectedContainer.id,
      container: selectedContainer,
      cargoItems: displayCargoItems,
      placedCount: result.placedCount,
      totalCargoCount: result.totalCargoCount,
      layerCount: result.layers.length,
      labelSummary: result.labelStats.map((item) => `${item.label}:${item.placed}/${item.planned}`).join(', '),
    }
    fetchWithAuth('/api/history', {
      method: 'POST',
      body: JSON.stringify({
        projectName,
        shipmentName,
        loadingMode,
        data: planData,
      }),
    }).then(() => fetchHistory()).catch(err => console.error('Auto-save history failed:', err))
  }

  const handleUploadProject = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (event) => {
      try {
        const raw = event.target?.result as string
        const config = JSON.parse(raw)
        
        if (config.projectName !== undefined) setProjectName(String(config.projectName))
        if (config.shipmentName !== undefined) setShipmentName(String(config.shipmentName))
        if (config.selectedContainerId !== undefined) setSelectedContainerId(String(config.selectedContainerId))
        if (config.loadingMode !== undefined) setLoadingMode(config.loadingMode)
        if (Array.isArray(config.cargoItems)) setCargoItems(config.cargoItems)
        if (config.customContainer !== undefined) setCustomContainer(config.customContainer)
        
        setActiveLayerId('all')
        setActiveLabelId('all')
        setSelectedBoxId(null)
        setHasCalculated(true)
        setActiveResultTab('layers')
      } catch (err) {
        console.error('Failed to parse uploaded project file', err)
        alert(locale === 'zh' ? '上传项目文件解析失败！' : 'Failed to parse uploaded project file!')
      }
    }
    reader.readAsText(file)
    e.target.value = ''
  }

  const deleteCargo = (cargoId: string) => {
    setCargoItems((items) => items.filter((item) => item.id !== cargoId))
    setHasCalculated(false)
    setSelectedBoxId((current) => {
      const selectedBox = result.placed.find((box) => box.id === current)
      return selectedBox?.cargoId === cargoId ? null : current
    })
  }

  const reorderCargo = (targetCargoId: string) => {
    if (!draggedCargoId || draggedCargoId === targetCargoId) {
      setDraggedCargoId(null)
      return
    }

    setCargoItems((items) => moveItem(
      items,
      items.findIndex((item) => item.id === draggedCargoId),
      items.findIndex((item) => item.id === targetCargoId),
    ))
    setSelectedBoxId(null)
    setHasCalculated(false)
    setDraggedCargoId(null)
  }

  const selectLayerByOffset = (offset: -1 | 1) => {
    if (!result.layers.length) {
      return
    }

    if (activeLayerId === 'all') {
      setActiveLayerId(result.layers[0].id)
      return
    }

    const nextIndex = Math.min(result.layers.length - 1, Math.max(0, activeLayerIndex + offset))
    setActiveLayerId(result.layers[nextIndex]?.id ?? 'all')
  }

  const selectStepBox = (boxId: string, layerId: string) => {
    setSelectedBoxId(boxId)
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
    setFreeViewEnabled(false)
  }

  const enableFreeView = () => {
    setWorkspaceView('3d')
    setFreeViewEnabled(true)
  }

  const navTargets: NavTarget[] = ['overview', 'history']

  if (!loggedIn) {
    if (showRegister) {
      return (
        <RegisterPage
          onRegisterSuccess={() => {
            setLoggedIn(true)
            setCurrentUser(getCurrentUser())
            fetchHistory()
            fetchCustomContainers()
          }}
          onToggleLogin={() => setShowRegister(false)}
        />
      )
    }
    return (
      <LoginPage
        onLoginSuccess={() => {
          setLoggedIn(true)
          setCurrentUser(getCurrentUser())
          fetchHistory()
          fetchCustomContainers()
        }}
        onToggleRegister={() => setShowRegister(true)}
      />
    )
  }

  if (showUserManagement && currentUser?.role === 'admin') {
    return <UserManagement onBack={() => setShowUserManagement(false)} />
  }

  return (
    <main className="min-h-screen bg-[#f4f7fb] text-[#1f2937]">
      <div className="mx-auto p-5 max-w-[1500px] xl:max-w-[1800px] 2xl:max-w-none 2xl:px-8">
        <header className="mb-5 rounded-2xl bg-gradient-to-br from-[#2563eb] to-[#7c3aed] p-6 text-white">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h1 className="m-0 text-[30px] font-bold">{t.title}</h1>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <div className="flex items-center gap-2 rounded-[10px] bg-white/10 px-3 py-1.5 border border-white/20 mr-2">
                <span className="opacity-90">{t.projectNameText}:</span>
                <input
                  type="text"
                  className="bg-transparent text-white font-bold outline-none border-b border-transparent focus:border-white/50 w-32 text-sm placeholder-white/50"
                  value={projectName}
                  placeholder={t.projectNameText}
                  onChange={(e) => setProjectName(e.target.value)}
                  data-testid="project-name-input"
                />
              </div>
              <button
                className="rounded-[10px] bg-white/20 px-3 py-2 font-bold text-white hover:bg-white/30 border border-white/10 transition-colors mr-1"
                type="button"
                onClick={handleNewProject}
                data-testid="new-project-button"
              >
                {t.newProject}
              </button>
              <button
                className="rounded-[10px] bg-white/20 px-3 py-2 font-bold text-white hover:bg-white/30 border border-white/10 transition-colors mr-1"
                type="button"
                onClick={handleSaveProject}
                data-testid="save-project-button"
              >
                {t.saveProject}
              </button>
              <label className="rounded-[10px] bg-white/20 px-3 py-2 font-bold text-white hover:bg-white/30 border border-white/10 transition-colors cursor-pointer mr-2 text-center">
                {t.uploadProject}
                <input
                  type="file"
                  accept=".json"
                  className="hidden"
                  onChange={handleUploadProject}
                  data-testid="upload-project-input"
                />
              </label>

              <div className="hidden md:block w-[1px] h-6 bg-white/20 mx-2"></div>

              {t.nav.map((item, index) => (
                <button
                  className={`rounded-[10px] px-4 py-2 font-bold ${activeNav === navTargets[index] ? 'bg-white text-[#1d4ed8]' : 'bg-white/20 text-white hover:bg-white/30'}`}
                  key={item}
                  type="button"
                  onClick={() => activateNav(navTargets[index])}
                >
                  {item}
                </button>
              ))}
              {currentUser && (
                <div className="flex items-center gap-2 rounded-[10px] bg-white/10 px-3 py-1.5 border border-white/20 ml-2">
                  <span className="opacity-80 text-xs">{locale === 'zh' ? '用户' : 'User'}:</span>
                  <span className="font-bold text-xs">{currentUser.username}</span>
                  {currentUser.role === 'admin' && (
                    <button
                      onClick={() => setShowUserManagement(true)}
                      className="rounded-[6px] bg-indigo-600 hover:bg-indigo-700 px-2 py-1 text-[11px] font-bold text-white transition-colors cursor-pointer animate-pulse"
                      type="button"
                    >
                      {locale === 'zh' ? '用户管理' : 'Users'}
                    </button>
                  )}
                  <button
                    onClick={() => {
                      removeToken()
                      setLoggedIn(false)
                      setCurrentUser(null)
                      window.location.href = '/'
                    }}
                    className="rounded-[6px] bg-red-600 hover:bg-red-700 px-2 py-1 text-[11px] font-bold text-white transition-colors cursor-pointer"
                    type="button"
                  >
                    {locale === 'zh' ? '退出' : 'Logout'}
                  </button>
                </div>
              )}
              <button className="rounded-[10px] bg-white px-4 py-2 font-bold text-[#1d4ed8]" type="button" onClick={() => setLocale(locale === 'en' ? 'zh' : 'en')}>
                {t.language}
              </button>
            </div>
          </div>
        </header>

        {activeNav === 'history' ? (
          <section className="archive-card overflow-hidden p-[18px]" data-testid="history-page">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-xl font-bold">{t.historyPage}</h2>
                <p className="text-sm text-[#64748b]">{t.noHistory}</p>
              </div>
              <div className="flex gap-2">
                <button className="archive-button success" type="button" onClick={saveCurrentPlan}>{t.savePlan}</button>
                <button className="archive-button secondary" type="button" onClick={() => activateNav('overview')}>{t.backToWorkbench}</button>
              </div>
            </div>
            {historyPlans.length === 0 ? (
              <p className="border border-[#c6c6c6] bg-white p-3">{t.noHistory}</p>
            ) : (
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {historyPlans.map((plan) => (
                  <article className="border border-[#c6c6c6] bg-white p-3 text-sm flex flex-col justify-between" key={plan.id}>
                    <div>
                      <strong>{plan.projectName}</strong>
                      <p>{t.shipmentName}: {plan.shipmentName || '-'}</p>
                      <p>{new Date(plan.createdAt).toLocaleString()}</p>
                      <p>{plan.placedCount}/{plan.totalCargoCount} · {plan.layerCount} {t.layers}</p>
                      <p className="text-xs text-slate-500 mt-1 line-clamp-2">{plan.labelSummary}</p>
                    </div>
                    <div className="mt-3 flex gap-2">
                      <button className="border border-[#9b9b9b] bg-[#eeeeee] px-3 py-1.5 text-xs font-semibold hover:bg-slate-200 transition" type="button" onClick={() => restorePlan(plan)}>
                        {t.restore}
                      </button>
                      <button className="border border-red-300 bg-red-50 text-red-700 px-3 py-1.5 text-xs font-semibold hover:bg-red-100 transition" type="button" onClick={() => deleteHistoryPlan(plan.id)}>
                        {locale === 'zh' ? '删除' : 'Delete'}
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>
        ) : (
        <section className={sidebarCollapsed ? "flex gap-5 max-lg:flex-col" : "flex gap-5 max-lg:flex-col"} data-testid="workbench-layout">
          <aside className={sidebarCollapsed ? "w-[32px] shrink-0 overflow-hidden flex flex-col items-center" : "w-[340px] lg:w-[360px] shrink-0 space-y-4 max-lg:w-full"}>
            {sidebarCollapsed ? (
              <button
                className="mt-4 flex h-8 w-8 items-center justify-center rounded bg-[#111827] text-white hover:bg-slate-700 font-bold"
                type="button"
                title="展开参数栏"
                aria-label="Expand parameters"
                data-testid="expand-sidebar"
                onClick={() => setSidebarCollapsed(false)}
              >
                ▶
              </button>
            ) : (
              <div className="archive-card overflow-hidden">
              <div className="flex min-h-14 items-center gap-4 bg-[#111827] px-4 py-3 text-white">
                <button
                  className="grid h-10 w-10 shrink-0 place-items-center rounded-[10px] bg-[#64748b] text-2xl font-bold"
                  type="button"
                  aria-expanded={menuOpen}
                  aria-label={menuOpen ? t.closeMenu : t.menu}
                  onClick={() => setMenuOpen((open) => !open)}
                >
                  ≡
                </button>
                <input
                  className="w-full rounded-[10px] border border-white/30 bg-white/10 px-3 py-2 text-sm outline-none placeholder:text-white/70"
                  placeholder={t.shipment}
                  aria-label="Shipment name"
                  value={shipmentName}
                  onChange={(event) => setShipmentName(event.target.value)}
                />
                <button
                  className="grid h-10 w-10 shrink-0 place-items-center rounded-[10px] bg-[#64748b] text-xl font-bold hover:bg-[#475569]"
                  type="button"
                  title="折叠参数栏"
                  aria-label="Collapse parameters"
                  data-testid="collapse-sidebar"
                  onClick={() => setSidebarCollapsed(true)}
                >
                  ◀
                </button>
              </div>
          {menuOpen && (
            <div className="grid gap-2 border-b border-[#e5e7eb] bg-[#f8fafc] p-3 text-sm" data-testid="workspace-menu">
              <button className="archive-button secondary text-left" type="button" onClick={() => activateNav('overview')}>{t.nav[0]}</button>
              <button className="archive-button secondary text-left" type="button" onClick={() => activateNav('history')}>{t.nav[1]}</button>
            </div>
          )}
          <div className="flex items-center justify-between bg-[#b0b4b7] pl-4">
            <strong className="bg-[#f29ca8] px-4 py-3 text-sm">{t.group}</strong>
            <span className="flex-1 px-4 text-sm italic text-white">{t.note}</span>
          </div>
          <section className="border-b border-[#e5e7eb] p-[18px]" ref={containerRef} data-testid="container-panel">
            <div className="mb-3 flex items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-bold">{t.containerConfig}</h2>
                <p className="mt-1 text-xs text-[#64748b]">{containerSummary}</p>
              </div>
              <button
                className="border border-[#b8b8b8] bg-white px-3 py-2 text-xs font-semibold"
                type="button"
                aria-expanded={!containerCollapsed}
                onClick={() => setContainerCollapsed((collapsed) => !collapsed)}
              >
                {containerCollapsed ? t.expand : t.collapse}
              </button>
            </div>
            {!containerCollapsed && (
              <>
                <label className="field-label">{t.containerType}
                  <select className="field-input mt-1" value={selectedContainerId} onChange={(event) => setSelectedContainerId(event.target.value)}>
                    {containers.map((container) => <option key={container.id} value={container.id}>{container.label}</option>)}
                    {customContainers.map((container) => <option key={container.id} value={container.id}>{container.label}</option>)}
                    <option value="custom">{t.customContainer}</option>
                  </select>
                </label>
                <button
                  type="button"
                  onClick={() => setShowCustomContainerDialog(true)}
                  className="mt-2 text-xs font-semibold text-purple-600 hover:text-purple-800 focus:outline-none flex items-center gap-1 cursor-pointer"
                  data-testid="manage-custom-containers"
                >
                  ⚙️ {locale === 'zh' ? '管理自定义柜型' : 'Manage Custom Containers'}
                </button>
                <div className="mt-3 max-h-[220px] overflow-auto border border-[#d1d1d1]">
                  {[...containers, ...customContainers, customContainer].map((container) => (
                    <button className={`block w-full border-b border-[#d1d1d1] px-3 py-3 text-left hover:bg-white cursor-pointer ${container.id === selectedContainer.id ? 'bg-white' : 'bg-[#f8fafc]'}`} key={container.id} type="button" onClick={() => setSelectedContainerId(container.id)}>
                      <div className="mb-2 ml-auto h-5 w-24 bg-[#5f5f5f]" />
                      <strong>{container.label}</strong>
                      <p className="text-xs">{container.length.toLocaleString()} x {container.width.toLocaleString()} x {container.height.toLocaleString()} mm {container.maxWeight.toLocaleString()} kg</p>
                    </button>
                  ))}
                </div>
                <div className="mt-3 grid grid-cols-3 gap-2">
                  <label className="field-label">{t.length}<input className="field-input mt-1" type="number" value={selectedContainer.length} onChange={(event) => updateContainerNumber('length', event.target.value)} /></label>
                  <label className="field-label">{t.width}<input className="field-input mt-1" type="number" value={selectedContainer.width} onChange={(event) => updateContainerNumber('width', event.target.value)} /></label>
                  <label className="field-label">{t.height}<input className="field-input mt-1" type="number" value={selectedContainer.height} onChange={(event) => updateContainerNumber('height', event.target.value)} /></label>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <label className="field-label">{t.maxWeight}<input className="field-input mt-1" type="number" value={selectedContainer.maxWeight} onChange={(event) => updateContainerNumber('maxWeight', event.target.value)} /></label>
                  <label className="field-label">{t.doorGap}<input className="field-input mt-1" type="number" value={selectedContainer.doorGap} onChange={(event) => updateContainerNumber('doorGap', event.target.value)} /></label>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <label className="field-label">{t.topGap}<input className="field-input mt-1" type="number" value={selectedContainer.topGap} onChange={(event) => updateContainerNumber('topGap', event.target.value)} /></label>
                  <label className="field-label">{t.sideGap}<input className="field-input mt-1" type="number" value={selectedContainer.sideGap} onChange={(event) => updateContainerNumber('sideGap', event.target.value)} /></label>
                </div>
              </>
            )}
          </section>
          <form className="space-y-3 p-[18px]" onSubmit={addCargo} ref={cargoRef} data-testid="cargo-panel">
            <h2 className="text-lg font-bold">{t.unitParameters}</h2>
            <div className="grid grid-cols-[1fr_56px] gap-2">
              <label className="field-label">{t.name}<input className="field-input mt-1" value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} /></label>
              <label className="field-label">{t.label}<input className="field-input mt-1 text-center font-bold" maxLength={2} value={form.label ?? ''} onChange={(event) => setForm((current) => ({ ...current, label: event.target.value.toUpperCase() }))} /></label>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <label className="field-label">{t.length}<input className="field-input mt-1" type="number" value={form.length} onChange={(event) => updateNumber('length', event.target.value)} /></label>
              <label className="field-label">{t.width}<input className="field-input mt-1" type="number" value={form.width} onChange={(event) => updateNumber('width', event.target.value)} /></label>
              <label className="field-label">{t.height}<input className="field-input mt-1" type="number" value={form.height} onChange={(event) => updateNumber('height', event.target.value)} /></label>
            </div>
            <div className="grid grid-cols-[1fr_1fr_56px] gap-2">
              <label className="field-label">{t.weight}<input className="field-input mt-1" type="number" value={form.weight} onChange={(event) => updateNumber('weight', event.target.value)} /></label>
              <label className="field-label">{t.quantity}<input className="field-input mt-1" type="number" value={form.quantity} onChange={(event) => updateNumber('quantity', event.target.value)} /></label>
              <label className="field-label">{t.color}<input className="mt-1 h-10 w-full border border-[#a8a8a8]" type="color" value={form.color} onChange={(event) => setForm((current) => ({ ...current, color: event.target.value }))} /></label>
            </div>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <label className="flex items-center gap-2"><input checked={form.canRotate} type="checkbox" onChange={(event) => setForm((current) => ({ ...current, canRotate: event.target.checked }))} />{t.rotate}</label>
              <label className="flex items-center gap-2"><input checked={form.stackable} type="checkbox" onChange={(event) => setForm((current) => ({ ...current, stackable: event.target.checked }))} />{t.stackable}</label>
            </div>
            <button className="archive-button w-full text-left" type="submit">{t.add}</button>
          </form>
          <section className="border-t border-[#e5e7eb] p-[18px] text-xs" data-testid="loading-rules-panel">
            <div className="mb-3 flex items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-bold">{t.ruleSummary}</h2>
                <p className="mt-1 text-xs text-[#64748b]">{loadingModeLabels[loadingMode]}</p>
              </div>
              <button
                className="border border-[#b8b8b8] bg-white px-3 py-2 text-xs font-semibold"
                type="button"
                aria-expanded={!rulesCollapsed}
                onClick={() => setRulesCollapsed((collapsed) => !collapsed)}
              >
                {rulesCollapsed ? t.expand : t.collapse}
              </button>
            </div>
            {!rulesCollapsed && (
              <>
                <label className="field-label">{t.selectableRules}
                  <select aria-label={t.ruleSummary} className="field-input mt-1" value={loadingMode} onChange={(event) => setLoadingMode(event.target.value as LoadingMode)}>
                    <option value="volume">{t.volumeMode}</option>
                    <option value="weight">{t.weightMode}</option>
                    <option value="quantity">{t.quantityMode}</option>
                    <option value="input">{t.inputMode}</option>
                  </select>
                </label>
                <div className="mt-3 grid gap-2">
                  <div className="rounded-xl border border-[#e5e7eb] bg-[#f8fafc] px-3 py-2"><strong>{t.hardRules}</strong>: {t.boundaryRule}</div>
                  <div className="rounded-xl border border-[#e5e7eb] bg-[#f8fafc] px-3 py-2"><strong>{t.hardRules}</strong>: {t.payloadRule}</div>
                  <div className="rounded-xl border border-[#e5e7eb] bg-[#f8fafc] px-3 py-2"><strong>{t.hardRules}</strong>: {t.supportRule}</div>
                </div>
              </>
            )}
          </section>
          <div className="border-t border-[#e5e7eb] p-[18px]">
            <div className="mb-2 flex items-center justify-between gap-2">
              <h2 className="text-sm font-bold">{t.cargoItems}</h2>
              <span className="text-xs text-[#64748b]">{displayCargoItems.length}</span>
            </div>
            <div className="space-y-2">
              {displayCargoItems.map((item) => (
                <div
                  className={`w-full border p-3 text-left text-sm ${result.placed.some((box) => box.cargoId === item.id && box.id === selectedBoxId) ? 'border-[#f3b21a] bg-[#fff7df]' : 'border-[#c9c9c9] bg-white'}`}
                  key={item.id}
                  draggable
                  data-testid="cargo-list-item"
                  onDragStart={() => setDraggedCargoId(item.id)}
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={() => reorderCargo(item.id)}
                >
                  <div className="flex items-center justify-between gap-2">
                    <button className="flex min-w-0 flex-1 items-center gap-2 text-left font-semibold" type="button" onClick={() => setSelectedBoxId(result.placed.find((box) => box.cargoId === item.id)?.id ?? null)}>
                      <span aria-label={t.dragCargo} className="cursor-grab text-[#64748b]">☰</span>
                      <span className="grid h-6 w-6 shrink-0 place-items-center rounded bg-[#222] text-xs text-white">{item.label}</span>
                      <span className="h-3 w-3 shrink-0" style={{ backgroundColor: item.color }} />
                      <span className="truncate">{item.name}</span>
                    </button>
                    <button className="border border-[#b8b8b8] bg-white px-2 py-1 text-xs" type="button" aria-label={`${t.editCargo}: ${item.name}`} onClick={() => openEditCargo(item)}>
                      {locale === 'zh' ? '编辑' : 'Edit'}
                    </button>
                    <button className="border border-[#b8b8b8] bg-white px-2 py-1 text-xs" type="button" aria-label={`${t.deleteCargo}: ${item.name}`} onClick={() => deleteCargo(item.id)}>
                      ×
                    </button>
                  </div>
                  <p className="mt-1 text-xs text-[#666]">{item.length} x {item.width} x {item.height} mm, {item.weight} kg, {t.qty} {item.quantity}</p>
                </div>
              ))}
            </div>
          </div>
          </div>
          )}
        </aside>

        <section className="flex-1 min-w-0 space-y-4" ref={workspaceRef}>
          <div className="grid grid-cols-5 gap-3 max-xl:grid-cols-2" data-testid="archive-stat-grid">
            <div className="archive-stat"><div className="archive-stat-value">{result.placedCount}</div><div className="archive-stat-key">{t.loaded}</div></div>
            <div className="archive-stat"><div className="archive-stat-value">{Math.round(result.usedWeight)}</div><div className="archive-stat-key">{t.weight}</div></div>
            <div className="archive-stat"><div className="archive-stat-value">{result.volumeUtilization.toFixed(1)}%</div><div className="archive-stat-key">{t.volumeUse}</div></div>
            <div className="archive-stat"><div className="archive-stat-value">{result.weightUtilization.toFixed(1)}%</div><div className="archive-stat-key">{t.weightUse}</div></div>
            <div className="archive-stat"><div className="archive-stat-value">{result.labelStats.length}</div><div className="archive-stat-key">{t.cargoTypes}</div></div>
          </div>

          <section className="archive-card overflow-hidden" data-testid="visual-workspace">
            <div className="flex flex-wrap gap-2 border-b border-[#e5e7eb] p-[18px]">
              <button
                className={`archive-tab ${placementMode === 'auto' ? 'active' : ''}`}
                type="button"
                data-testid="placement-mode-auto"
                onClick={() => setPlacementMode('auto')}
              >
                {t.autoMode}
              </button>
              <button
                className={`archive-tab ${placementMode === 'manual' ? 'active' : ''}`}
                type="button"
                data-testid="placement-mode-manual"
                onClick={() => setPlacementMode('manual')}
              >
                {t.manualMode}
              </button>
              {placementMode === 'auto' && hasCalculated && (
                <button
                  className="archive-tab"
                  type="button"
                  data-testid="continue-manually"
                  onClick={handleContinueManually}
                >
                  {t.continueManually}
                </button>
              )}
              <span className="mx-2 self-center text-[#cbd5e1]">|</span>
              <button className={`archive-tab ${workspaceView === '2d' ? 'active' : ''}`} type="button" onClick={() => setWorkspaceView('2d')}>
                {t.view2d}
              </button>
              <button className={`archive-tab ${workspaceView === '3d' ? 'active' : ''}`} type="button" onClick={() => setWorkspaceView('3d')}>
              {t.view3d}
            </button>
            {workspaceView === '2d' && (
              <>
                {[
                  { id: 'top' as const, label: t.topView },
                  { id: 'front' as const, label: t.frontView },
                  { id: 'side' as const, label: t.sideView },
                ].map((view) => (
                  <button className={`archive-tab ${planViewMode === view.id ? 'active' : ''}`} key={view.id} type="button" onClick={() => setPlanViewMode(view.id)}>
                    {view.label}
                  </button>
                ))}
              </>
            )}
            {workspaceView === '3d' && (
              <>
                {[
                  { id: 'iso' as const, label: t.isoView },
                  { id: 'top' as const, label: t.topView },
                  { id: 'front' as const, label: t.frontView },
                  { id: 'side' as const, label: t.sideView },
                ].map((view) => (
                  <button className={`archive-tab ${sceneViewMode === view.id && !freeViewEnabled ? 'active' : ''}`} key={view.id} type="button" onClick={() => selectSceneView(view.id)}>
                    {view.label}
                  </button>
                ))}
                <button className={`archive-tab inline-flex items-center gap-2 ${freeViewEnabled ? 'active' : ''}`} type="button" aria-pressed={freeViewEnabled} aria-label={t.freeView} onClick={enableFreeView}>
                  <svg aria-hidden="true" className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2">
                    <path d="M8 11V6a2 2 0 0 1 4 0v5" />
                    <path d="M12 11V5a2 2 0 0 1 4 0v7" />
                    <path d="M16 12V8a2 2 0 0 1 4 0v7a7 7 0 0 1-7 7h-1.5a7 7 0 0 1-5.6-2.8L3.2 15.6a2 2 0 0 1 3.1-2.5L8 15" />
                    <path d="M8 11V8a2 2 0 0 0-4 0v6" />
                  </svg>
                  {t.freeView}
                </button>
              </>
            )}
            <button className="archive-button success" type="button" onClick={exportCurrentView}>
              {t.exportView}
            </button>
            <div
              className="ml-auto flex items-center gap-2 rounded-lg bg-[#f1f5f9] px-3 py-1.5 text-xs text-[#0f172a] shadow-sm"
              data-testid="container-dimension-badge"
            >
              <strong className="text-sm">{selectedContainer.label}</strong>
              <span className="text-[#475569]">
                {renderingContainer.length.toLocaleString()} × {renderingContainer.width.toLocaleString()} × {renderingContainer.height.toLocaleString()} mm
              </span>
            </div>
            </div>
            <div
              className={`relative w-full bg-gradient-to-b from-[#eef6ff] to-[#f8fafc] ${
                workspaceView === '3d'
                  ? 'min-h-[480px] xl:min-h-[640px] 2xl:min-h-[760px] h-[70vh] xl:h-[78vh]'
                  : 'aspect-[16/9] min-h-[420px] max-h-[85vh] xl:min-h-[560px]'
              }`}
            >
              {placementMode === 'manual' ? (
                <div className="flex h-full w-full flex-col gap-3 p-4" data-testid="manual-workspace">
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      className="archive-button"
                      type="button"
                      onClick={handleManualUndo}
                      disabled={!manualCanUndo}
                      data-testid="manual-undo"
                    >
                      {t.undo}
                    </button>
                    <button
                      className="archive-button"
                      type="button"
                      onClick={handleManualRedo}
                      disabled={!manualCanRedo}
                      data-testid="manual-redo"
                    >
                      {t.redo}
                    </button>
                    <button
                      className="archive-button"
                      type="button"
                      onClick={handleManualRotate}
                      disabled={!manualSelectedId}
                      data-testid="manual-rotate"
                    >
                      {t.manualRotate}
                    </button>
                    <button
                      className="archive-button"
                      type="button"
                      onClick={handleManualDelete}
                      disabled={!manualSelectedId}
                      data-testid="manual-delete"
                    >
                      {t.manualDelete}
                    </button>
                    <span className="ml-auto text-xs text-[#475569]">{t.manualHint}</span>
                  </div>
                  {manualIssues.length > 0 && (
                    <div
                      className="rounded-xl border border-[#fecaca] bg-[#fef2f2] p-3 text-xs text-[#991b1b]"
                      data-testid="manual-issues"
                    >
                      <div className="mb-1 font-semibold">{t.manualIssues} ({manualIssues.length})</div>
                      <ul className="list-inside list-disc space-y-0.5">
                        {manualIssues.slice(0, 10).map((issue, index) => (
                          <li key={`${issue.boxId}-${issue.type}-${index}`}>{issue.message}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  <div className="flex flex-1 gap-3 overflow-hidden">
                    <aside
                      className="flex w-56 shrink-0 flex-col gap-2 overflow-auto rounded-xl border border-[#e5e7eb] bg-white p-3"
                      data-testid="manual-pool"
                    >
                      <h3 className="text-sm font-bold">{t.placementPool}</h3>
                      {manualPool.every((entry) => entry.remaining === 0) ? (
                        <p className="text-xs text-[#64748b]">{t.poolEmpty}</p>
                      ) : (
                        manualPool.map((entry) => (
                          <div
                            key={entry.cargoId}
                            draggable={entry.remaining > 0}
                            data-testid="manual-pool-item"
                            data-cargo-id={entry.cargoId}
                            onDragStart={(event) => handleManualPoolDragStart(event, entry.cargoId)}
                            className={`flex flex-col gap-1 rounded-lg border p-2 text-xs ${
                              entry.remaining > 0
                                ? 'cursor-grab border-[#c9c9c9] bg-white'
                                : 'cursor-not-allowed border-[#e5e7eb] bg-[#f1f5f9] opacity-60'
                            }`}
                          >
                            <div className="flex items-center gap-2">
                              <span className="grid h-5 w-5 shrink-0 place-items-center rounded bg-[#222] text-[10px] text-white">{entry.label}</span>
                              <span className="h-3 w-3 shrink-0" style={{ backgroundColor: entry.color }} />
                              <span className="ml-auto font-semibold">{t.poolRemaining}: {entry.remaining}</span>
                            </div>
                            <span className="text-[#64748b]">{entry.length} x {entry.width} x {entry.height} mm</span>
                          </div>
                        ))
                      )}
                    </aside>
                    <div className="flex-1 overflow-hidden rounded-xl border border-[#e5e7eb] bg-white" data-testid="manual-view-container">
                      {workspaceView === '3d' ? (
                        <ContainerScene
                          activeLabelId={'all'}
                          activeLayerId={'all'}
                          boxes={manualPlacedBoxes}
                          container={renderingContainer}
                          freeView={freeViewEnabled}
                          invalidBoxIds={manualInvalidBoxIds}
                          manualEditable
                          selectedBoxId={manualSelectedId}
                          viewMode={sceneViewMode}
                          onManualDropFromPool={handleManualDropFromPool}
                          onManualMove={handleManualMoveBox}
                          onSelectBox={setManualSelectedId}
                        />
                      ) : (
                        <ManualPlacement2D
                          container={renderingContainer}
                          draft={manualDraft}
                          selectedBoxId={manualSelectedId}
                          issues={manualIssues}
                          viewMode={planViewMode}
                          onSelectBox={setManualSelectedId}
                          onMoveBox={handleManualMoveBox}
                          onDropFromPool={handleManualDropFromPool}
                        />
                      )}
                    </div>
                  </div>
                </div>
              ) : workspaceView === '3d' ? (
                <ContainerScene activeLabelId={activeLabelId} activeLayerId={activeLayerId} boxes={hasCalculated ? result.placed : []} container={renderingContainer} freeView={freeViewEnabled} selectedBoxId={selectedBoxId} viewMode={sceneViewMode} onSelectBox={setSelectedBoxId} />
              ) : (
                <ContainerPlan2D activeLabelId={activeLabelId} activeLayerId={activeLayerId} boxes={result.placed} container={renderingContainer} mode={planViewMode} selectedBoxId={selectedBoxId} onSelectBox={setSelectedBoxId} />
              )}
              <button
                className="archive-button success absolute bottom-6 right-6"
                type="button"
                onClick={() => setHasCalculated(true)}
              >
                {t.load}
              </button>
            </div>
          </section>

          <section className="archive-card overflow-hidden" ref={reportRef} data-testid="report-panel">
          <div className="border-b border-[#e5e7eb] p-[18px]">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3" data-testid="import-export-toolbar">
              <h2 className="text-lg font-bold">{t.results}</h2>
              <div className="flex flex-wrap gap-2 text-xs">
                <label className="cursor-pointer border border-[#b8b8b8] bg-white px-3 py-2 font-semibold">{t.importExcel}<input className="hidden" accept=".xlsx,.xls,.csv" type="file" onChange={(event) => void importExcel(event.target.files?.[0] ?? null)} /></label>
                <button className="border border-[#b8b8b8] bg-white px-3 py-2 font-semibold" type="button" onClick={exportExcel}>{t.exportExcel}</button>
                <button className="border border-[#9b9b9b] bg-white px-3 py-2 font-semibold" type="button" onClick={saveCurrentPlan}>{t.savePlan}</button>
              </div>
            </div>
            <div className="flex flex-wrap gap-2 text-sm font-bold">
              {[
                { id: 'layers' as const, label: t.layers },
                { id: 'details' as const, label: t.details },
                { id: 'diagnostics' as const, label: t.diagnostics },
                { id: 'importLog' as const, label: t.importLog },
              ].map((tab) => (
                <button className={`archive-tab ${activeResultTab === tab.id ? 'active' : ''}`} key={tab.id} type="button" onClick={() => setActiveResultTab(tab.id)}>
                  {tab.label}
                </button>
              ))}
            </div>

            {activeResultTab === 'layers' && (
              <div className="mt-3">
                <div className="flex gap-2">
                  <select className="w-full border border-[#aaa] bg-white p-2" value={activeLayerId} onChange={(event) => setActiveLayerId(event.target.value)}>
                    <option value="all">{t.allLayers}</option>
                    {result.layers.map((layer) => <option key={layer.id} value={layer.id}>{layerName(layer, locale)}: {layer.count}</option>)}
                  </select>
                  <button className="border border-[#b8b8b8] bg-white px-3 py-2 text-xs" type="button" onClick={() => selectLayerByOffset(-1)}>
                    {t.previousLayer}
                  </button>
                  <button className="border border-[#b8b8b8] bg-white px-3 py-2 text-xs" type="button" onClick={() => selectLayerByOffset(1)}>
                    {t.nextLayer}
                  </button>
                </div>
                <label className="field-label mt-2">{t.labelFilter}
                  <select aria-label={t.labelFilter} className="field-input mt-1" value={activeLabelId} onChange={(event) => setActiveLabelId(event.target.value)}>
                    <option value="all">{t.allLabels}</option>
                    {labelOptions.map((label) => <option key={label} value={label}>{label}</option>)}
                  </select>
                </label>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  {result.layers.map((layer) => (
                    <button className={`border px-2 py-1 text-left text-xs ${activeLayerId === layer.id ? 'border-[#f3b21a] bg-white' : 'border-[#bbb] bg-[#eee]'}`} key={layer.id} type="button" onClick={() => setActiveLayerId(layer.id)}>
                      {layerName(layer, locale)}<br />{Math.round(layer.minZ)}-{Math.round(layer.maxZ)} mm<br />
                      {layer.labels.map((entry) => `${entry.label} x${entry.count}`).join(', ')}
                    </button>
                  ))}
                </div>
                {activeLayer && (
                  <div className="mt-3 border-t border-[#bebebe] pt-2 text-xs">
                    <strong>{t.layerStats}</strong>
                    <p>{activeLayer.count} {t.qty}, {activeLayer.weight.toLocaleString()} kg, {formatCubicMeters(activeLayer.volume)}</p>
                    <p>{activeLayer.labels.map((entry) => `${entry.label} x${entry.count}`).join(', ')}</p>
                    {activeLayer.supportedBy.length > 0 && <p>{t.supportedBy}: {activeLayer.supportedBy.join(', ')}</p>}
                  </div>
                )}
                <div className="mt-3 border-t border-[#bebebe] pt-2 text-xs">
                  <strong>{t.loadingSteps}</strong>
                  <div className="mt-2 max-h-[180px] space-y-1 overflow-auto">
                    {result.workSteps.map((step) => {
                      const isSelected = step.boxId === selectedBoxId
                      const box = result.placed.find((entry) => entry.id === step.boxId)
                      return (
                        <button
                          className={`block w-full border px-2 py-1 text-left ${isSelected ? 'border-[#f3b21a] bg-white' : 'border-[#bbb] bg-[#eee]'}`}
                          key={step.boxId}
                          type="button"
                          onClick={() => selectStepBox(step.boxId, String(step.physicalLayer))}
                        >
                          <strong>{step.step}</strong> {step.label} · {step.supportType}
                          {box && <div>{box.name} · {layerName(result.layers.find((layer) => layer.physicalLayer === box.physicalLayer) ?? result.layers[0], locale)}</div>}
                        </button>
                      )
                    })}
                  </div>
                </div>
              </div>
            )}

            {activeResultTab === 'details' && (
              <div className="mt-3 max-h-[240px] overflow-auto border border-[#c6c6c6] bg-white">
                <table className="min-w-[760px] text-left text-xs">
                  <thead className="sticky top-0 bg-[#eeeeee]">
                    <tr>
                      <th className="p-2">{t.label}</th>
                      <th className="p-2">{t.name}</th>
                      <th className="p-2">{t.originalSize}</th>
                      <th className="p-2">{t.actualSize}</th>
                      <th className="p-2">{t.weight}</th>
                      <th className="p-2">{t.planned}</th>
                      <th className="p-2">{t.placed}</th>
                      <th className="p-2">{t.unplacedCount}</th>
                      <th className="p-2">{t.layers}</th>
                      <th className="p-2">{t.workStep}</th>
                      <th className="p-2">{t.failureReason}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detailRows.map((item) => (
                      <tr className="border-t border-[#dddddd]" key={`${item.label}-${item.name}`}>
                        <td className="p-2 font-bold">{item.label}</td>
                        <td className="p-2">{item.name}</td>
                        <td className="p-2">{formatDimensions(item.originalLength, item.originalWidth, item.originalHeight)}</td>
                        <td className="p-2">{formatDimensions(item.actualLength, item.actualWidth, item.actualHeight)}</td>
                        <td className="p-2">{item.weight}</td>
                        <td className="p-2">{item.plannedQuantity}</td>
                        <td className="p-2">{item.placedQuantity}</td>
                        <td className="p-2">{item.unplacedQuantity}</td>
                        <td className="p-2">{item.layer || '-'}</td>
                        <td className="p-2">{item.workStep || '-'}</td>
                        <td className="p-2">{item.failureReason ? failureReason(item.failureReason, locale, item.failureReasonCode) : t.noFailure}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {activeResultTab === 'diagnostics' && (
              <div className="mt-3 space-y-2 text-xs">
                {result.diagnostics.map((diagnostic) => (
                  <div className="border border-[#c6c6c6] bg-white p-2" key={diagnostic.id}>
                    <strong className="uppercase">{diagnostic.severity}</strong>
                    <p>{diagnosticMessage(diagnostic, locale)}</p>
                  </div>
                ))}
                {result.unplaced.map((item) => (
                  <div className="border border-[#d7b7b7] bg-white p-2" key={item.cargoId}>
                    <strong>{item.label} {item.name}</strong>
                    <p>{t.failureReason}: {failureReason(item.reason || t.noFailure, locale, item.reasonCode)}</p>
                  </div>
                ))}
              </div>
            )}

            {activeResultTab === 'importLog' && (
              <div className="mt-3 space-y-2 text-xs" data-testid="import-log-panel">
                {importMessages.length === 0 ? (
                  <p className="border border-[#c6c6c6] bg-white p-2">{t.noImportLog}</p>
                ) : (
                  importMessages.map((message) => <p className="border border-[#c6c6c6] bg-white p-2" key={message}>{message}</p>)
                )}
              </div>
            )}
          </div>
          <div className="m-3 border border-[#c9c9c9] bg-white p-3 text-sm">
            <h2 className="font-bold">{t.results}</h2>
            <p>{t.loaded}: {result.placedCount} / {result.totalCargoCount}</p>
            <p>{t.cargoTypes}: {result.labelStats.length}</p>
            <p>{t.volumeUse}: {result.volumeUtilization.toFixed(1)}%</p>
            <p>{t.weightUse}: {result.weightUtilization.toFixed(1)}%</p>
            <p>{t.containerVolume}: {formatCubicMeters(getContainerVolume(selectedContainer))}</p>
            <div className="mt-3 border-t pt-2">
              <strong>{t.showLayer}</strong>
              {visibleBoxes.slice(0, 10).map((box) => (
                <button className={`mt-1 block w-full rounded px-2 py-1 text-left text-xs ${selectedBoxId === box.id ? 'bg-[#fff0bd]' : 'bg-[#f6f6f6]'}`} key={box.id} type="button" onClick={() => selectStepBox(box.id, String(box.physicalLayer))}>
                  <b>{box.label}</b> {box.name} #{box.index} x:{Math.round(box.x)} y:{Math.round(box.y)} z:{Math.round(box.z)}
                  <br />{layerName(result.layers.find((layer) => layer.physicalLayer === box.physicalLayer) ?? result.layers[0], locale)} · {box.supportType}
                </button>
              ))}
            </div>
            {result.unplaced.length > 0 && (
              <div className="mt-3 border-t pt-2">
                <strong>{t.unloaded}</strong>
                {result.unplaced.map((item) => <p className="text-xs" key={item.cargoId}>{item.name} x {item.quantity}: {failureReason(item.reason, locale, item.reasonCode)}</p>)}
              </div>
            )}
          </div>
          </section>
        </section>
      </section>
        )}
        {showMappingModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" data-testid="mapping-modal">
            <div className="w-full max-w-5xl rounded-xl border border-slate-200 bg-white p-6 shadow-2xl animate-in fade-in zoom-in duration-200 max-h-[92vh] overflow-y-auto">
              <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="text-xl font-bold text-slate-800">{t.mappingTitle}</h3>
                  <p className="mt-1 text-sm text-slate-500">{t.mappingSubtitle}</p>
                </div>
                <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-600" data-testid="mapping-stats">
                  {t.mappingTotalRows}: {importRows.length} / {Object.keys(importRows[0] ?? {}).length} {t.mappingTotalCols}
                </div>
              </div>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="space-y-3" data-testid="mapping-fields">
                  {Object.keys(customMapping).map((fieldKey) => {
                    const labelMap: Record<string, string> = {
                      label: t.mappingFieldLabel,
                      name: t.mappingFieldName,
                      length: t.mappingFieldLength,
                      width: t.mappingFieldWidth,
                      height: t.mappingFieldHeight,
                      weight: t.mappingFieldWeight,
                      quantity: t.mappingFieldQuantity,
                    }
                    const excelColumns = Object.keys(importRows[0] ?? {})
                    const isDimension = fieldKey === 'length' || fieldKey === 'width' || fieldKey === 'height'
                    const dimensionKey = fieldKey as 'length' | 'width' | 'height'
                    return (
                      <div key={fieldKey} className="rounded-md border border-slate-200 bg-white p-3">
                        <label className="block text-sm font-semibold text-slate-700">
                          {labelMap[fieldKey] || fieldKey}
                          <select
                            className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                            value={customMapping[fieldKey]}
                            onChange={(e) => setCustomMapping(prev => ({ ...prev, [fieldKey]: e.target.value }))}
                            data-testid={`map-select-${fieldKey}`}
                          >
                            <option value="">{t.mappingSelectColumn}</option>
                            {excelColumns.map(col => (
                              <option key={col} value={col}>{col}</option>
                            ))}
                          </select>
                        </label>
                        {isDimension && (
                          <label className="mt-2 block text-xs font-semibold text-slate-600">
                            {t.mappingUnit}
                            <select
                              className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-xs text-slate-900 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                              value={customUnits[dimensionKey]}
                              onChange={(e) => setCustomUnits(prev => ({ ...prev, [dimensionKey]: e.target.value as DimensionUnit }))}
                              data-testid={`map-unit-${fieldKey}`}
                            >
                              <option value="auto">{t.mappingAutoUnit}</option>
                              <option value="mm">mm</option>
                              <option value="cm">cm</option>
                            </select>
                            {customUnits[dimensionKey] === 'cm' && (
                              <span className="mt-1 inline-block text-[11px] font-medium text-amber-600">{t.mappingConvertHint}</span>
                            )}
                          </label>
                        )}
                      </div>
                    )
                  })}
                </div>
                <div className="rounded-md border border-slate-200 bg-slate-50 p-3" data-testid="mapping-preview">
                  <div className="mb-2 text-sm font-semibold text-slate-700">{t.mappingPreview}</div>
                  <div className="max-h-[420px] overflow-auto">
                    <table className="min-w-full border-collapse text-xs">
                      <thead className="sticky top-0 bg-slate-100">
                        <tr>
                          {Object.keys(importRows[0] ?? {}).map((col) => (
                            <th key={col} className="border border-slate-200 px-2 py-1 text-left font-semibold text-slate-700 whitespace-nowrap">{col}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {importRows.slice(0, 5).map((row, rowIndex) => (
                          <tr key={rowIndex} className="odd:bg-white even:bg-slate-50">
                            {Object.keys(importRows[0] ?? {}).map((col) => (
                              <td key={col} className="border border-slate-200 px-2 py-1 text-slate-700 whitespace-nowrap">
                                {row[col] === undefined || row[col] === null ? '' : String(row[col])}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
              <div className="mt-6 flex flex-wrap items-center justify-end gap-3">
                {(customUnits.length === 'cm' || customUnits.width === 'cm' || customUnits.height === 'cm') && (
                  <span className="mr-auto text-xs font-semibold text-amber-600" data-testid="mapping-convert-hint">
                    {t.mappingConvertHint}
                  </span>
                )}
                <button
                  className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 focus:outline-none"
                  type="button"
                  onClick={() => setShowMappingModal(false)}
                >
                  {t.mappingCancel}
                </button>
                <button
                  className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
                  type="button"
                  data-testid="confirm-mapping"
                  onClick={confirmMappingImport}
                >
                  {t.mappingConfirm}
                </button>
              </div>
            </div>
          </div>
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
                <label className="field-label">{t.label}<input className="field-input mt-1 text-center font-bold" maxLength={2} value={editForm.label ?? ''} onChange={(event) => setEditForm((current) => ({ ...current, label: event.target.value.toUpperCase() }))} /></label>
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
                <label className="flex items-center gap-2"><input checked={editForm.stackable} type="checkbox" onChange={(event) => setEditForm((current) => ({ ...current, stackable: event.target.checked }))} />{t.stackable}</label>
              </div>
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
        <CustomContainerDialog
          currentSelectedId={selectedContainerId}
          onClose={() => {
            setShowCustomContainerDialog(false)
            fetchCustomContainers()
          }}
          onSelect={(container) => {
            setSelectedContainerId(container.id)
            setShowCustomContainerDialog(false)
            fetchCustomContainers()
          }}
        />
      )}
    </main>
  )
}

export default Workbench
