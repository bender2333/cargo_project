import { useMemo, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import * as XLSX from 'xlsx'
import { ContainerScene } from './components/ContainerScene'
import type { SceneViewMode } from './components/ContainerScene'
import { ContainerPlan2D } from './components/ContainerPlan2D'
import type { PlanViewMode } from './components/ContainerPlan2D'
import { containers, effectiveContainer, formatCubicMeters, getContainerVolume } from './data/containers'
import { buildExportPlanRows } from './lib/exportPlan'
import { createHistoryPlan, readHistoryPlans, saveHistoryPlan } from './lib/historyPlans'
import type { HistoryPlan } from './lib/historyPlans'
import { createClientId } from './lib/clientId'
import { parseCargoRows, parseCargoRowsWithMapping } from './lib/importCargo'
import { normalizeCargoLabelColors } from './lib/labels'
import { calculatePacking } from './lib/packing'
import type { CargoItem, LoadingMode, Locale, PackingDiagnostic, PackingLayer } from './types'

const colors = ['#f59e0b', '#0ea5e9', '#22c55e', '#ef4444', '#8b5cf6', '#14b8a6']

const copy = {
  en: {
    nav: ['EasyCargo', 'Shipments & Reports', 'Cargo items', 'Cargo spaces', 'History'],
    title: 'Cargo loading workspace',
    subtitle: 'Container packing, visual review, import/export, and local plan history',
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
  },
  zh: {
    nav: ['EasyCargo', '装箱报告', '货物项目', '货柜空间', '历史方案'],
    title: '货柜排箱装柜工作台',
    subtitle: '装箱计算、可视化复核、导入导出和本地历史方案',
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

function diagnosticMessage(diagnostic: PackingDiagnostic, locale: Locale) {
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

  if (diagnostic.id.startsWith('unplaced-')) {
    return diagnostic.message.replace('unplaced because', '未装入，原因：')
  }

  return diagnostic.message
}

function failureReason(reason: string, locale: Locale) {
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
  const [shipmentName, setShipmentName] = useState('')
  const [menuOpen, setMenuOpen] = useState(false)
  const [activeNav, setActiveNav] = useState<NavTarget>('overview')
  const [selectedContainerId, setSelectedContainerId] = useState(containers[0].id)
  const [loadingMode, setLoadingMode] = useState<LoadingMode>('volume')
  const [containerOverrides, setContainerOverrides] = useState(() => Object.fromEntries(containers.map((container) => [container.id, container])))
  const [customContainer, setCustomContainer] = useState(customContainerDefaults)
  const [cargoItems, setCargoItems] = useState<CargoItem[]>(initialCargo)
  const [form, setForm] = useState<CargoForm>(emptyForm)
  const [hasCalculated, setHasCalculated] = useState(true)
  const [activeLayerId, setActiveLayerId] = useState('all')
  const [activeLabelId, setActiveLabelId] = useState('all')
  const [workspaceView, setWorkspaceView] = useState<WorkspaceView>('3d')
  const [sceneViewMode, setSceneViewMode] = useState<SceneViewMode>('iso')
  const [freeViewEnabled, setFreeViewEnabled] = useState(false)
  const [planViewMode, setPlanViewMode] = useState<PlanViewMode>('top')
  const [activeResultTab, setActiveResultTab] = useState<ResultTab>('layers')
  const [historyPlans, setHistoryPlans] = useState<HistoryPlan[]>(() => readHistoryPlans(localStorage))
  const [importMessages, setImportMessages] = useState<string[]>([])
  const [selectedBoxId, setSelectedBoxId] = useState<string | null>(null)
  const [containerCollapsed, setContainerCollapsed] = useState(false)
  const [rulesCollapsed, setRulesCollapsed] = useState(false)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [draggedCargoId, setDraggedCargoId] = useState<string | null>(null)
  const [showMappingModal, setShowMappingModal] = useState(false)
  const [importRows, setImportRows] = useState<Record<string, any>[]>([])
  const [customMapping, setCustomMapping] = useState<Record<string, string>>({
    label: '',
    name: '',
    length: '',
    width: '',
    height: '',
    weight: '',
    quantity: '',
  })
  const workspaceRef = useRef<HTMLElement | null>(null)
  const reportRef = useRef<HTMLElement | null>(null)
  const cargoRef = useRef<HTMLFormElement | null>(null)
  const containerRef = useRef<HTMLElement | null>(null)

  const selectedContainer = selectedContainerId === 'custom'
    ? customContainer
    : containerOverrides[selectedContainerId] ?? containers[0]
  const renderingContainer = effectiveContainer(selectedContainer)
  const displayCargoItems = useMemo(() => normalizeCargoLabelColors(cargoItems), [cargoItems])
  const result = useMemo(() => calculatePacking(selectedContainer, displayCargoItems, { loadingMode }), [displayCargoItems, loadingMode, selectedContainer])
  const detailRows = useMemo(() => buildExportPlanRows(displayCargoItems, result), [displayCargoItems, result])
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

  const confirmMappingImport = () => {
    const imported = parseCargoRowsWithMapping(importRows, customMapping, { colors })
    setImportMessages([
      `${t.importSuccess}: ${imported.summary.importedRows}`,
      `${t.importMappedFields}: ${imported.summary.mappedFields.join(', ') || '-'}`,
      `${t.importConvertedRows}: ${imported.summary.convertedCentimeterRows}`,
      ...imported.errors.map((issue) => `${t.importIssue} row ${issue.row}: ${issue.message}`),
      ...imported.warnings.map((issue) => `${t.importWarning} row ${issue.row}: ${issue.message}`),
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

  const canAutoMap = (row: Record<string, any>): boolean => {
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
    let rows: Record<string, string | number>[] = []
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
        ...imported.errors.map((issue) => `${t.importIssue} row ${issue.row}: ${issue.message}`),
        ...imported.warnings.map((issue) => `${t.importWarning} row ${issue.row}: ${issue.message}`),
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

  const saveCurrentPlan = () => {
    const next = createHistoryPlan(selectedContainer, displayCargoItems, result, { shipmentName })
    setHistoryPlans(saveHistoryPlan(localStorage, next))
    setActiveNav('history')
  }

  const restorePlan = (plan: HistoryPlan) => {
    setShipmentName(plan.shipmentName)
    setSelectedContainerId(plan.containerId)
    if (plan.containerId === 'custom') {
      setCustomContainer(plan.container)
    } else {
      setContainerOverrides((current) => ({ ...current, [plan.containerId]: plan.container }))
    }
    setCargoItems(plan.cargoItems)
    setActiveLayerId('all')
    setActiveLabelId('all')
    setSelectedBoxId(null)
    setHasCalculated(true)
    setActiveResultTab('layers')
    setActiveNav('overview')
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

  const navTargets: NavTarget[] = ['overview', 'report', 'cargo', 'container', 'history']

  return (
    <main className="min-h-screen bg-[#f4f7fb] text-[#1f2937]">
      <div className="mx-auto max-w-[1500px] p-5">
        <header className="mb-5 rounded-2xl bg-gradient-to-br from-[#2563eb] to-[#7c3aed] p-6 text-white">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h1 className="m-0 text-[30px] font-bold">{t.title}</h1>
              <p className="m-0 mt-2 opacity-95">{t.subtitle}</p>
            </div>
            <div className="flex flex-wrap gap-2 text-sm">
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
                <button className="archive-button success" type="button" onClick={() => {
                  const next = createHistoryPlan(selectedContainer, displayCargoItems, result, { shipmentName })
                  setHistoryPlans(saveHistoryPlan(localStorage, next))
                }}>{t.savePlan}</button>
                <button className="archive-button secondary" type="button" onClick={() => activateNav('overview')}>{t.backToWorkbench}</button>
              </div>
            </div>
            {historyPlans.length === 0 ? (
              <p className="border border-[#c6c6c6] bg-white p-3">{t.noHistory}</p>
            ) : (
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {historyPlans.map((plan) => (
                  <article className="border border-[#c6c6c6] bg-white p-3 text-sm" key={plan.id}>
                    <strong>{plan.shipmentName}</strong>
                    <p>{t.shipmentName}: {plan.shipmentName}</p>
                    <p>{new Date(plan.createdAt).toLocaleString()}</p>
                    <p>{plan.placedCount}/{plan.totalCargoCount} · {plan.layerCount} {t.layers}</p>
                    <p>{plan.labelSummary}</p>
                    <button className="mt-3 border border-[#9b9b9b] bg-[#eeeeee] px-3 py-2" type="button" onClick={() => restorePlan(plan)}>
                      {t.restore}
                    </button>
                  </article>
                ))}
              </div>
            )}
          </section>
        ) : (
        <section className={sidebarCollapsed ? "grid grid-cols-[32px_1fr] gap-5" : "grid grid-cols-[minmax(340px,25%)_minmax(0,1fr)] gap-5 max-lg:grid-cols-1"} data-testid="workbench-layout">
          <aside className={sidebarCollapsed ? "w-[32px] overflow-hidden flex flex-col items-center" : "space-y-4"}>
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
              <button className="archive-button secondary text-left" type="button" onClick={() => activateNav('report')}>{t.nav[1]}</button>
              <button className="archive-button secondary text-left" type="button" onClick={() => activateNav('cargo')}>{t.nav[2]}</button>
              <button className="archive-button secondary text-left" type="button" onClick={() => activateNav('container')}>{t.nav[3]}</button>
              <button className="archive-button secondary text-left" type="button" onClick={() => activateNav('history')}>{t.nav[4]}</button>
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
                    <option value="custom">{t.customContainer}</option>
                  </select>
                </label>
                <div className="mt-3 max-h-[220px] overflow-auto border border-[#d1d1d1]">
                  {[...containers, customContainer].map((container) => (
                    <button className={`block w-full border-b border-[#d1d1d1] px-3 py-3 text-left hover:bg-white ${container.id === selectedContainer.id ? 'bg-white' : 'bg-[#f8fafc]'}`} key={container.id} type="button" onClick={() => setSelectedContainerId(container.id)}>
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

        <section className="space-y-4 max-2xl:col-span-1" ref={workspaceRef}>
          <div className="grid grid-cols-5 gap-3 max-xl:grid-cols-2" data-testid="archive-stat-grid">
            <div className="archive-stat"><div className="archive-stat-value">{result.placedCount}</div><div className="archive-stat-key">{t.loaded}</div></div>
            <div className="archive-stat"><div className="archive-stat-value">{Math.round(result.usedWeight)}</div><div className="archive-stat-key">{t.weight}</div></div>
            <div className="archive-stat"><div className="archive-stat-value">{result.volumeUtilization.toFixed(1)}%</div><div className="archive-stat-key">{t.volumeUse}</div></div>
            <div className="archive-stat"><div className="archive-stat-value">{result.weightUtilization.toFixed(1)}%</div><div className="archive-stat-key">{t.weightUse}</div></div>
            <div className="archive-stat"><div className="archive-stat-value">{result.labelStats.length}</div><div className="archive-stat-key">{t.cargoTypes}</div></div>
          </div>

          <section className="archive-card overflow-hidden" data-testid="visual-workspace">
            <div className="flex flex-wrap gap-2 border-b border-[#e5e7eb] p-[18px]">
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
            </div>
            <div className="relative h-[560px] bg-gradient-to-b from-[#eef6ff] to-[#f8fafc]">
              <div className="absolute left-5 top-5 z-10 rounded-xl bg-white/85 px-4 py-3 text-sm shadow">
                <strong>{selectedContainer.label}</strong>
                <div>{renderingContainer.length.toLocaleString()} x {renderingContainer.width.toLocaleString()} x {renderingContainer.height.toLocaleString()} mm</div>
              </div>
              {workspaceView === '3d' ? (
                <ContainerScene activeLabelId={activeLabelId} activeLayerId={activeLayerId} boxes={hasCalculated ? result.placed : []} container={renderingContainer} freeView={freeViewEnabled} selectedBoxId={selectedBoxId} viewMode={sceneViewMode} onSelectBox={setSelectedBoxId} />
              ) : (
                <ContainerPlan2D activeLabelId={activeLabelId} activeLayerId={activeLayerId} boxes={result.placed} container={renderingContainer} mode={planViewMode} selectedBoxId={selectedBoxId} onSelectBox={setSelectedBoxId} />
              )}
              <button className="archive-button success absolute bottom-6 right-6" type="button" onClick={() => setHasCalculated(true)}>{t.load}</button>
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
                        <td className="p-2">{item.failureReason ? failureReason(item.failureReason, locale) : t.noFailure}</td>
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
                    <p>{t.failureReason}: {failureReason(item.reason || t.noFailure, locale)}</p>
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
                {result.unplaced.map((item) => <p className="text-xs" key={item.cargoId}>{item.name} x {item.quantity}: {failureReason(item.reason, locale)}</p>)}
              </div>
            )}
          </div>
          </section>
        </section>
      </section>
        )}
        {showMappingModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" data-testid="mapping-modal">
            <div className="w-full max-w-lg rounded-xl border border-slate-200 bg-white p-6 shadow-2xl animate-in fade-in zoom-in duration-200">
              <div className="mb-4">
                <h3 className="text-xl font-bold text-slate-800">智能字段映射</h3>
                <p className="mt-1 text-sm text-slate-500">上传的 Excel 包含非标准列名，请手动关联关键字段以开始导入。</p>
              </div>
              <div className="space-y-4">
                {Object.keys(customMapping).map((fieldKey) => {
                  const labelMap: Record<string, string> = {
                    label: '货物标识 / 托盘代码 (Label)',
                    name: '货物名称 / 品名 (Name)',
                    length: '长度 (Length)',
                    width: '宽度 (Width)',
                    height: '高度 (Height)',
                    weight: '单件重量 (Weight)',
                    quantity: '数量 / 箱数 (Quantity)',
                  }
                  const excelColumns = Object.keys(importRows[0] ?? {})
                  return (
                    <label key={fieldKey} className="block text-sm font-semibold text-slate-700">
                      {labelMap[fieldKey] || fieldKey}
                      <select
                        className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                        value={customMapping[fieldKey]}
                        onChange={(e) => setCustomMapping(prev => ({ ...prev, [fieldKey]: e.target.value }))}
                        data-testid={`map-select-${fieldKey}`}
                      >
                        <option value="">-- 请选择数据列 --</option>
                        {excelColumns.map(col => (
                          <option key={col} value={col}>{col}</option>
                        ))}
                      </select>
                    </label>
                  )
                })}
              </div>
              <div className="mt-6 flex justify-end gap-3">
                <button
                  className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 focus:outline-none"
                  type="button"
                  onClick={() => setShowMappingModal(false)}
                >
                  取消
                </button>
                <button
                  className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
                  type="button"
                  data-testid="confirm-mapping"
                  onClick={confirmMappingImport}
                >
                  确认导入
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </main>
  )
}

export default Workbench
