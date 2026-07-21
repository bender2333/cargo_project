import { useMemo, useRef, useState, useEffect } from 'react'
import type { FormEvent, DragEvent as ReactDragEvent } from 'react'
import * as XLSX from 'xlsx'
import { ContainerScene } from './components/ContainerScene'
import type { SceneViewMode } from './components/ContainerScene'
import { ContainerPlan2D } from './components/ContainerPlan2D'
import type { PlanViewMode } from './components/ContainerPlan2D'
import { ManualPlacement2D } from './components/ManualPlacement2D'
import { PlaybackPanel } from './components/PlaybackPanel'
import { LoadingStepsPanel } from './components/LoadingStepsPanel'
import { ImportMappingForm, type ImportMappingValue } from './components/ImportMappingForm'
import { ExportColumnsEditor } from './components/ExportColumnsEditor'
import { CenterOfGravityPanel } from './components/CenterOfGravityPanel'
import { ContainerComparisonPanel } from './components/ContainerComparisonPanel'
import { buildPlaybackSequence, visibleBoxesAt } from './lib/playback'
import { buildLoadingTaskGroups } from './lib/loadingTaskGroups'
import { buildLoadingSheetModel } from './lib/loadingSheet'
import { exportLoadingSheetPdf } from './lib/exportLoadingSheet'
import { buildManualPackingResult } from './lib/manualSteps'
import { usePlaybackController } from './hooks/usePlaybackController'
import type { PlaybackSpeed } from './hooks/usePlaybackController'
import { computeCenterOfGravity } from './lib/centerOfGravity'
import { compareContainers } from './lib/containerCompare'
import { computeRemainingCapacity } from './lib/remainingCapacity'
import { suggestFillItems } from './lib/fillSuggestion'
import { buildStandardCargoItem, STANDARD_BOXES, STANDARD_BOX_MAX_PER_CLICK } from './data/standardBoxes'
import { FillSuggestionPanel } from './components/FillSuggestionPanel'
import { ReleaseNotesButton } from './components/ReleaseNotesButton'
import { buildCogOverlay } from './lib/cogVisual'
import { deriveCogOverlayState } from './lib/cogView'
import { DEFAULT_VEHICLE_PROFILE } from './data/vehicleProfiles'
import type { VehicleProfileId } from './data/vehicleProfiles'
import {
  addBox as manualAddBox,
  buildPool as manualBuildPool,
  commit as manualCommit,
  dryRunRotation as manualDryRunRotation,
  emptyHistory as manualEmptyHistory,
  isBlockingManualIssue,
  makeManualBox,
  redo as manualRedo,
  removeBox as manualRemoveBox,
  rotateBoxDown90 as manualRotateBoxDown90,
  rotateBoxLeft90 as manualRotateBoxLeft90,
  rotateBoxRight90 as manualRotateBoxRight90,
  rotateBoxUp90 as manualRotateBoxUp90,
  setBoxPosition as manualSetBoxPosition,
  toPlacedBoxes as manualToPlacedBoxes,
  undo as manualUndo,
  validateBox as manualValidateBox,
  validateDraft as manualValidateDraft,
} from './lib/manualPlacement'
import type { ManualDraft, ManualHistory, ManualRotationDirection, OrientationKey, ValidationIssue } from './lib/manualPlacement'
import { containers, effectiveContainer, formatCubicMeters, getContainerVolume } from './data/containers'
import { buildExportPlanRows, buildExportRowsFromTemplate, EXPORT_FIELD_KEYS } from './lib/exportPlan'
import { createClientId } from './lib/clientId'
import { parseCargoRows, parseCargoRowsWithTemplate } from './lib/importCargo'
import type { ImportCargoRow } from './lib/importCargo'
import { deleteImportTemplate, readImportTemplates, saveImportTemplate, updateImportTemplate } from './lib/importTemplates'
import type { ImportTemplatePayload } from './lib/importTemplates'
import { saveLastImportConfig } from './lib/lastImportConfig'
import { deleteExportTemplate, readExportTemplates, saveExportTemplate, updateExportTemplate } from './lib/exportTemplates'
import type { ExportTemplatePayload } from './lib/exportTemplates'
import { deleteCustomCargo, readCustomCargo, saveCustomCargo, updateCustomCargo } from './lib/customCargo'
import { normalizeCargoLabelColors } from './lib/labels'
import { calculatePacking } from './lib/packing'
import { isGapFillBox } from './lib/placementSource'
import { clearPlacementOnContainerChange } from './lib/containerChange'
import {
  deriveClearanceAnnotations,
  measureBoxClearance,
} from './lib/measurement'
import { quickPlaceCargo } from './lib/quickPlace'
import { buildReviewChecklist } from './lib/reviewChecklist'
import type { ReviewChecklist } from './lib/reviewChecklist'
import { createManualOperationNotice } from './lib/manualFeedback'
import type { ManualOperationNotice } from './lib/manualFeedback'
import {
  DEFAULT_PLACEMENT_SETTINGS,
  loadPlacementSettings,
  savePlacementSettings,
  type PlacementSettings,
} from './lib/placementSettings'
import type { CargoItem, ContainerSpec, LoadingMode, Locale, PackingDiagnostic, PackingLayer, PackingResult, ImportTemplate, ImportTemplateUnits, ImportTemplateDefaults, ExportTemplate } from './types'
import { readCustomContainers } from './api/customContainers'
import {
  deleteHistoryPlan as deleteHistoryPlanRequest,
  readHistoryPlans,
  saveHistoryPlan as saveHistoryPlanRequest,
} from './api/historyPlans'
import type { HistoryPlan } from './api/historyPlans'
import type { User } from './lib/auth'
import { UserManagement } from './components/UserManagement'
import { DebugPanel } from './components/DebugPanel'
import { excelStyleLabel } from './lib/excelStyleLabel'
import { buildCargoDebugSnapshot } from './lib/debugSnapshot'

type CustomContainerDialogComponent = typeof import('./components/CustomContainerDialog')['CustomContainerDialog']
const colors = ['#f59e0b', '#0ea5e9', '#22c55e', '#ef4444', '#8b5cf6', '#14b8a6']
type WorksheetCell = string | number | boolean | null | undefined

const TEMPLATE_MAPPING_FIELDS = ['label', 'name', 'length', 'width', 'height', 'weight', 'quantity', 'color', 'canRotate', 'stackable', 'maxStackLayers', 'groundOnly'] as const
const TEMPLATE_DIMENSION_FIELDS = new Set(['length', 'width', 'height'])

function importMappingValueFromTemplate(template: ImportTemplate): ImportMappingValue {
  return {
    mapping: { ...template.mapping, dimensions: template.combinedColumn || template.mapping.dimensions || '' },
    units: {
      length: template.units.length,
      width: template.units.width,
      height: template.units.height,
    },
    headerRow: template.headerRow ?? 1,
    startRow: template.startRow ?? 2,
    dimensionMode: template.dimensionMode ?? 'separate',
    combinedColumn: template.combinedColumn || template.mapping.dimensions || '',
    dimensionOrder: template.dimensionOrder ?? ['length', 'width', 'height'],
    defaults: template.defaultValues ?? { quantity: 1, canRotate: true, stackable: true },
  }
}

function mappedColumnsForTemplateValue(value: ImportMappingValue): string[] {
  const columns: string[] = []
  if (value.dimensionMode === 'combined') {
    columns.push(value.combinedColumn || value.mapping.dimensions || '')
  }
  TEMPLATE_MAPPING_FIELDS.forEach((field) => {
    if (value.dimensionMode === 'combined' && TEMPLATE_DIMENSION_FIELDS.has(field)) return
    columns.push(value.mapping[field] ?? '')
  })
  return Array.from(new Set(columns.map((column) => column.trim()).filter(Boolean)))
}

function missingMappedColumns(value: ImportMappingValue, availableColumns: string[]): string[] {
  const present = new Set(availableColumns)
  return mappedColumnsForTemplateValue(value).filter((column) => !present.has(column))
}

const copy = {
  en: {
    nav: ['Workbench', 'History', 'Cargo library', 'Template manager', 'Users'],
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
    maxStackLayers: 'Max stack layers',
    groundOnly: 'Ground only',
    globalMaxStackLayers: 'Global default max stack layers',
    maxStackLayersOwn: 'own',
    maxStackLayersGlobal: 'global default',
    maxStackLayersUnlimited: 'unlimited',
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
    cargoLibrary: 'Cargo library',
    cargoLibraryEmpty: 'No saved cargo yet',
    cargoLibrarySave: 'Save cargo',
    cargoLibraryUpdate: 'Update cargo',
    cargoLibraryUse: 'Add to workbench',
    cargoLibraryEdit: 'Edit',
    cargoLibraryDelete: 'Delete',
    cargoLibraryNoticeSaved: 'Cargo saved',
    cargoLibraryNoticeUpdated: 'Cargo updated',
    cargoLibraryNoticeDeleted: 'Cargo deleted',
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
    downloadImportTemplate: 'Download import template',
    exportExcel: 'Export XLSX',
    exportView: 'Export view',
    exportLoadingSheetPdf: 'Export loading sheet PDF',
    importIssue: 'Import issue',
    importWarning: 'Import warning',
    importParseFailed: 'Import parse failed',
    importFileTooLarge: 'File larger than 5 MB is not allowed',
    importFileUnreadable: 'File could not be read as a workbook',
    importNoData: 'No usable data found',
    importSuccess: 'Import success',
    importMappedFields: 'Mapped fields',
    importConvertedRows: 'Rows converted from cm',
    importSkippedRows: 'Skipped non-data rows',
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
    templateManager: 'Template manager',
    templateLabel: 'Import template',
    templateNone: 'No template',
    templateName: 'Template name',
    templateSave: 'Save template',
    templateSaved: 'Template saved',
    templateUpdated: 'Template updated',
    templateDeleted: 'Template deleted',
    templateEmpty: 'No import templates yet',
    templateEdit: 'Edit',
    templateDelete: 'Delete',
    templateUpdate: 'Update template',
    templateNew: 'New template',
    templateCreate: 'Create template',
    templateLoadSample: 'Load sample headers',
    templateSampleLoaded: 'Sample columns',
    exportTemplateManager: 'Export templates',
    exportTemplateDefault: 'Default columns',
    exportTemplateEmpty: 'No export templates yet',
    exportColumnHeader: 'Column header',
    exportColumnUnit: 'Unit',
    exportAddColumn: 'Add column…',
    exportNoColumns: 'No columns selected',
    templateHeaderRow: 'Header row',
    templateStartRow: 'Start row',
    templateDefaultLabel: 'Default label',
    templateDefaultQuantity: 'Default quantity',
    templateDefaultColor: 'Default color',
    templateDefaultRotate: 'Default rotatable',
    templateDefaultStackable: 'Default stackable',
    templateDefaultMaxStackLayers: 'Default max stack layers',
    templateDefaultGroundOnly: 'Default ground only',
    templateDimensionMode: 'Dimension mode',
    templateDimensionSeparate: 'Separate L/W/H columns',
    templateDimensionCombined: 'Combined size column',
    templateCombinedColumn: 'Combined size column',
    templateHelpHeaderRow: 'The Excel row number that contains the real column titles, starting from 1. If row 1 is a merged title, the real header is often row 2.',
    templateHelpStartRow: 'The row where actual cargo data begins, starting from 1. It is usually the header row plus 1.',
    templateHelpDimensionMode: 'Separate mode maps length, width, and height to different columns. Combined mode reads all three dimensions from one cell, such as 530*305*310.',
    templateHelpCombinedColumn: 'The column that contains a combined length x width x height value. Separators such as *, x, and × are detected automatically.',
    templateDimensionOrder: 'Split order',
    templateDimensionOrderLWH: 'LWH',
    templateDimensionOrderLHW: 'LHW',
    templateDimensionOrderWLH: 'WLH',
    templateDimensionOrderWHL: 'WHL',
    templateDimensionOrderHLW: 'HLW',
    templateDimensionOrderHWL: 'HWL',
    mappingRequiredHint: 'Please configure required fields',
    mappingMissingLength: 'Missing: length column',
    mappingMissingWidth: 'Missing: width column',
    mappingMissingHeight: 'Missing: height column',
    mappingMissingDimensions: 'Missing: combined size column',
    mappingMissingDimensionOrder: 'Missing: split order',
    mappingMissingQuantity: 'Missing: quantity column or default',
    mappingConfirmReady: 'All required fields configured',
    templateHelpLabelColumn: 'Choose the source column used as the cargo label. Labels flow through calculation, display, export, and loading steps. Leave blank to auto-assign A/B/C.',
    mappingFieldLabel: 'Cargo label',
    mappingFieldName: 'Cargo name',
    mappingFieldLength: 'Length',
    mappingFieldWidth: 'Width',
    mappingFieldHeight: 'Height',
    mappingFieldWeight: 'Unit weight',
    mappingFieldQuantity: 'Quantity',
    mappingFieldGroundOnly: 'Ground only',
    load: 'Load',
    view2d: '2D',
    view3d: '3D',
    isoView: 'Iso',
    resetView: 'Reset view',
    playbackTab: 'Playback',
    loadingStepsTab: 'Stage Plan',
    cogTab: 'Balance',
    compareTab: 'Compare',
    fillTab: 'Fill',
    reviewChecklistTab: 'Review checklist',
    playbackResetNotice: 'Playback restarted because the plan changed.',
    gridSnap: '50mm snap',
    gridSnapOff: 'Free move',
    edgeSnap: 'Edge snap',
    edgeSnapOff: 'No edge snap',
    snapSettings: 'Snap settings',
    snapSettingsClose: 'Close snap settings',
    snapEnabled: 'Snap enabled',
    snapDisabled: 'Snap disabled',
    placementSettings: 'Placement settings',
    placementSettingsClose: 'Close placement settings',
    surfaceSnap: 'Surface snap',
    zSnap: 'Z snap',
    gridStep: 'Grid step',
    edgeTolerance: 'Edge tolerance',
    zStep: 'Z step',
    allowOverhang: 'Allow partial overhang',
    minSupport: 'Minimum support',
    warnSupport: 'Warn below',
    settingsStored: 'Saved for current user/browser.',
    resetPlacementSettings: 'Reset settings',
    ruler: 'Ruler',
    rulerOff: 'Ruler off',
    measurementList: 'Measurements',
    measurementDelete: 'Delete',
    measurementPending: 'Select the second point to lock the line.',
    clearanceTitle: 'Clearance',
    clearanceFront: 'Front',
    clearanceDoor: 'Door',
    clearanceLeft: 'Left',
    clearanceRight: 'Right',
    clearanceFloor: 'Floor',
    clearanceTop: 'Top',
    clearanceNearestX: 'Nearest length gap',
    clearanceNearestY: 'Nearest width gap',
    clearanceNearestZ: 'Nearest height gap',
    hoverTooltipLabel: 'Label',
    hoverTooltipSize: 'Size',
    hoverTooltipPosition: 'Position',
    hoverTooltipOrientation: 'Orientation',
    topView: 'Top',
    frontView: 'Front',
    sideView: 'Side',
    results: 'Results',
    loaded: 'Loaded',
    cargoTypes: 'Cargo types',
    volumeUse: 'Volume utilization',
    volumeCbmDetail: 'CBM used / net space',
    weightUse: 'Weight utilization',
    containerVolume: 'Container volume',
    volume: 'Volume',
    qty: 'qty',
    unloaded: 'Unloaded cargo',
    layers: 'Layer view',
    details: 'Details',
    originalSize: 'Original size',
    actualSize: 'Actual size',
    workStep: 'Step',
    placementNote: 'Placement note',
    mixedPlacementGapFill: 'Mixed gap-fill',
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
    autoMode: 'Auto placement',
    manualMode: 'Manual placement',
    placementPool: 'Placement pool',
    poolRemaining: 'Remaining',
    quickPlace: 'Quick place',
    quickPlaceNoSpace: 'No valid quick placement found',
    manualIssues: 'Validation issues',
    maximizeManual: 'Maximize workspace',
    restoreManual: 'Restore workspace',
    dismissNotice: 'Dismiss',
    remainingVolumeLabel: 'Volume used',
    remainingWeightLabel: 'Weight used',
    remainingFloorLabel: 'Floor used',
    remainingLabel: 'left',
    manualNoIssues: 'No validation issues',
    manualKeyboardHelp: 'Keyboard help',
    manualKeyboardHelpItems: [
      'Drag: move on X/Y plane',
      'Shift + drag: move on Z axis',
      'Middle mouse: pan camera; right mouse: rotate camera; wheel: zoom',
      'Arrow keys: move X/Y by 10 mm',
      'PageUp/PageDown: move Z by 10 mm',
      'Modifiers: Shift = 100 mm, Ctrl/Cmd = 1 mm',
      'R: rotate right 90°, Shift + R: rotate down 90°',
      'M: toggle clearance ruler',
      'Delete: remove, Esc: clear selection',
    ],
    autoKeyboardHelp: 'Keyboard help',
    autoKeyboardHelpItems: [
      'M: toggle clearance ruler',
      'Ctrl/Cmd + Z: undo',
      'Ctrl/Cmd + Y: redo',
    ],
    containerChangedNotice: 'Container changed. Recalculate to refresh the automatic placement.',
    manualIssueBoundary: 'exceeds the effective container bounds',
    manualIssueOverlap: 'overlaps another cargo box',
    manualIssueFloating: 'is floating and needs at least 50% base support',
    manualIssueRotationDisabled: 'rotation is disabled for this cargo',
    manualIssueStacking: 'is stacked on non-stackable cargo',
    manualIssueMaxStackLayers: 'exceeds max stack layers',
    orientationDiagram: 'Orientation',
    reviewChecklistEmpty: 'No review items.',
    reviewChecklistExportJson: 'Export JSON',
    reviewChecklistExportExcel: 'Export XLSX',
    poolEmpty: 'All cargo has been placed.',
    continueManually: 'Continue manually',
    modeManual3D: '3D Review',
  },
  zh: {
    nav: ['工作台', '历史方案', '货物管理', '模板管理', '用户管理'],
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
    maxStackLayers: '最大堆叠层数',
    groundOnly: '必须落地',
    globalMaxStackLayers: '全局默认最大堆叠层数',
    maxStackLayersOwn: '货物自带',
    maxStackLayersGlobal: '全局兜底',
    maxStackLayersUnlimited: '不限制',
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
    cargoLibrary: '货物管理',
    cargoLibraryEmpty: '暂无已保存货物',
    cargoLibrarySave: '保存货物',
    cargoLibraryUpdate: '更新货物',
    cargoLibraryUse: '加入当前工作台',
    cargoLibraryEdit: '编辑',
    cargoLibraryDelete: '删除',
    cargoLibraryNoticeSaved: '货物已保存',
    cargoLibraryNoticeUpdated: '货物已更新',
    cargoLibraryNoticeDeleted: '货物已删除',
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
    downloadImportTemplate: '下载导入模板',
    exportExcel: '导出 XLSX',
    exportView: '导出视图',
    exportLoadingSheetPdf: '导出作业分解图 PDF',
    importIssue: '导入问题',
    importWarning: '导入提醒',
    importParseFailed: '导入解析失败',
    importFileTooLarge: '文件大于 5 MB，已拒绝导入',
    importFileUnreadable: '无法解析为工作簿',
    importNoData: '未找到可用数据',
    importSuccess: '导入成功',
    importMappedFields: '识别字段',
    importConvertedRows: '厘米换算行数',
    importSkippedRows: '跳过非数据行',
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
    templateManager: '导入模板管理',
    templateLabel: '导入模板',
    templateNone: '不使用模板',
    templateName: '模板名称',
    templateSave: '保存模板',
    templateSaved: '模板已保存',
    templateUpdated: '模板已更新',
    templateDeleted: '模板已删除',
    templateEmpty: '暂无导入模板',
    templateEdit: '编辑',
    templateDelete: '删除',
    templateUpdate: '更新模板',
    templateNew: '新建模板',
    templateCreate: '创建模板',
    templateLoadSample: '加载样本表头',
    templateSampleLoaded: '样本列',
    exportTemplateManager: '导出模板',
    exportTemplateDefault: '默认列',
    exportTemplateEmpty: '暂无导出模板',
    exportColumnHeader: '列表头',
    exportColumnUnit: '单位',
    exportAddColumn: '添加列…',
    exportNoColumns: '未选择任何列',
    templateHeaderRow: '表头行',
    templateStartRow: '数据起始行',
    templateDimensionOrder: '拆分顺序',
    templateDimensionOrderLWH: '长宽高',
    templateDimensionOrderLHW: '长高宽',
    templateDimensionOrderWLH: '宽长高',
    templateDimensionOrderWHL: '宽高长',
    templateDimensionOrderHLW: '高长宽',
    templateDimensionOrderHWL: '高宽长',
    mappingRequiredHint: '请配置必填项',
    mappingMissingLength: '缺少：长度列',
    mappingMissingWidth: '缺少：宽度列',
    mappingMissingHeight: '缺少：高度列',
    mappingMissingDimensions: '缺少：合并尺寸列',
    mappingMissingDimensionOrder: '缺少：拆分顺序',
    mappingMissingQuantity: '缺少：数量列或默认值',
    mappingConfirmReady: '必填项已配置完成',
    templateDefaultLabel: '默认标识',
    templateDefaultQuantity: '默认数量',
    templateDefaultColor: '默认颜色',
    templateDefaultRotate: '默认可旋转',
    templateDefaultStackable: '默认可堆叠',
    templateDefaultMaxStackLayers: '默认最大堆叠层数',
    templateDefaultGroundOnly: '默认必须落地',
    templateDimensionMode: '尺寸模式',
    templateDimensionSeparate: '长宽高分列',
    templateDimensionCombined: '合并尺寸列',
    templateCombinedColumn: '合并尺寸列',
    templateHelpHeaderRow: 'Excel 中真正的列标题所在行号（从 1 开始）。如果第 1 行是合并标题，真表头通常在第 2 行。',
    templateHelpStartRow: '实际货物数据从哪一行开始（从 1 开始）。通常是表头行 + 1。',
    templateHelpDimensionMode: '分列：长、宽、高在不同列。合并：长宽高写在同一格，例如 530*305*310。',
    templateHelpCombinedColumn: '包含“长 x 宽 x 高”合并值的列名。系统会自动识别 *、x、× 等分隔符。',
    templateHelpLabelColumn: '用哪一列的值作为货物标签。标签贯穿计算、显示、导出和装柜步骤。留空则自动分配 A/B/C。',
    mappingFieldLabel: '货物标识',
    mappingFieldName: '货物名称',
    mappingFieldLength: '长度',
    mappingFieldWidth: '宽度',
    mappingFieldHeight: '高度',
    mappingFieldWeight: '单件重量',
    mappingFieldQuantity: '数量',
    mappingFieldGroundOnly: '必须落地',
    load: '装箱',
    view2d: '2D',
    view3d: '3D',
    isoView: '轴测',
    resetView: '重置视角',
    playbackTab: '作业回放',
    loadingStepsTab: '装柜步骤',
    cogTab: '装载重心',
    compareTab: '柜型对比',
    fillTab: '补装建议',
    reviewChecklistTab: '复核清单',
    playbackResetNotice: '方案变更，作业回放已重置。',
    gridSnap: '50mm 网格',
    gridSnapOff: '自由移动',
    edgeSnap: '边缘吸附',
    edgeSnapOff: '关闭边缘吸附',
    snapSettings: '吸附设置',
    snapSettingsClose: '关闭吸附设置',
    snapEnabled: '开启吸附',
    snapDisabled: '关闭吸附',
    placementSettings: '排布设置',
    placementSettingsClose: '关闭排布设置',
    surfaceSnap: '上表面吸附',
    zSnap: 'Z 轴吸附',
    gridStep: '网格步长',
    edgeTolerance: '边缘容差',
    zStep: 'Z 轴步长',
    allowOverhang: '允许部分悬空',
    minSupport: '最低支撑',
    warnSupport: '低于提示',
    settingsStored: '已按当前用户/浏览器保存。',
    resetPlacementSettings: '重置配置',
    ruler: '尺规',
    rulerOff: '关闭尺规',
    measurementList: '测量线',
    measurementDelete: '删除',
    measurementPending: '请选择第二个点以固定测量线。',
    clearanceTitle: '余量测量',
    clearanceFront: '前端',
    clearanceDoor: '门口',
    clearanceLeft: '左侧',
    clearanceRight: '右侧',
    clearanceFloor: '底部',
    clearanceTop: '顶部',
    clearanceNearestX: '最近长度间距',
    clearanceNearestY: '最近宽度间距',
    clearanceNearestZ: '最近高度间距',
    hoverTooltipLabel: '标签',
    hoverTooltipSize: '尺寸',
    hoverTooltipPosition: '位置',
    hoverTooltipOrientation: '朝向',
    topView: '俯视',
    frontView: '正视',
    sideView: '侧视',
    results: '结果',
    loaded: '已装载',
    cargoTypes: '货物品类',
    volumeUse: '体积利用率',
    volumeCbmDetail: '已装 CBM / 净空间',
    weightUse: '重量利用率',
    containerVolume: '货柜体积',
    volume: '体积',
    qty: '数量',
    unloaded: '未装入货物',
    layers: '分层查看',
    details: '明细表',
    originalSize: '原始尺寸',
    actualSize: '实际朝向',
    workStep: '步骤',
    placementNote: '放置说明',
    mixedPlacementGapFill: '混合填缝',
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
    autoMode: '自动排布',
    manualMode: '手动排布',
    placementPool: '待放置池',
    poolRemaining: '剩余',
    quickPlace: '一键放置',
    quickPlaceNoSpace: '未找到可用的一键放置位置',
    manualIssues: '校验问题',
    maximizeManual: '最大化工作区',
    restoreManual: '退出最大化',
    dismissNotice: '关闭',
    remainingVolumeLabel: '体积占用',
    remainingWeightLabel: '重量占用',
    remainingFloorLabel: '占地占用',
    remainingLabel: '剩余',
    manualNoIssues: '当前无校验问题',
    manualKeyboardHelp: '键盘帮助',
    manualKeyboardHelpItems: [
      '拖拽：在 X/Y 平面移动',
      'Shift + 拖拽：沿 Z 轴移动',
      '中键：平移视角；右键：旋转视角；滚轮：缩放',
      '方向键：X/Y 每次移动 10 mm',
      'PageUp/PageDown：Z 轴每次移动 10 mm',
      '修饰键：Shift = 100 mm，Ctrl/Cmd = 1 mm',
      'R：向右旋转 90°，Shift + R：向下旋转 90°',
      'M：尺规开关',
      'Delete：删除，Esc：取消选中',
    ],
    autoKeyboardHelp: '键盘帮助',
    autoKeyboardHelpItems: [
      'M：尺规开关',
      'Ctrl/Cmd + Z：撤销',
      'Ctrl/Cmd + Y：重做',
    ],
    containerChangedNotice: '已更换货柜，请重新计算以刷新自动排布。',
    manualIssueBoundary: '超出有效货柜边界',
    manualIssueOverlap: '与其他货物发生碰撞',
    manualIssueFloating: '处于悬空状态，底面至少需要 50% 支撑',
    manualIssueRotationDisabled: '该货物禁止旋转',
    manualIssueStacking: '堆叠在不可堆叠货物上',
    manualIssueMaxStackLayers: '超过最大堆叠层数',
    orientationDiagram: '朝向示意',
    reviewChecklistEmpty: '暂无复核事项。',
    reviewChecklistExportJson: '导出 JSON',
    reviewChecklistExportExcel: '导出 XLSX',
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

function rotateManualDraft(draft: ManualDraft, boxId: string, direction: ManualRotationDirection): ManualDraft {
  switch (direction) {
    case 'left':
      return manualRotateBoxLeft90(draft, boxId)
    case 'down':
      return manualRotateBoxDown90(draft, boxId)
    case 'up':
      return manualRotateBoxUp90(draft, boxId)
    case 'right':
    default:
      return manualRotateBoxRight90(draft, boxId)
  }
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

function defaultProjectName(locale: Locale) {
  const now = new Date()
  const pad = (value: number) => String(value).padStart(2, '0')
  const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}`
  return locale === 'zh' ? `装箱方案-${stamp}` : `Packing plan-${stamp}`
}

function containerPlacementKey(container: ContainerSpec) {
  const effective = effectiveContainer(container)
  return [
    container.id,
    effective.length,
    effective.width,
    effective.height,
    container.maxWeight,
    container.doorGap,
    container.topGap,
    container.sideGap,
  ].join(':')
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
  const [projectName, setProjectName] = useState(() => defaultProjectName(locale))
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
  const [placementSettings, setPlacementSettings] = useState<PlacementSettings>(() => loadPlacementSettings(currentUser?.id ?? null))
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
  const [placementMode, setPlacementMode] = useState<'auto' | 'manual'>('auto')
  const [manualHistory, setManualHistory] = useState<ManualHistory>(() => manualEmptyHistory())
  const [manualSelectedId, setManualSelectedId] = useState<string | null>(null)
  const [manualHelpOpen, setManualHelpOpen] = useState(false)
  const [autoHelpOpen, setAutoHelpOpen] = useState(false)
  const [manualNotice, setManualNotice] = useState<ManualOperationNotice | null>(null)
  const [containerChangeNotice, setContainerChangeNotice] = useState('')
  const [customContainerLoadFailed, setCustomContainerLoadFailed] = useState(false)
  const [rotationNotice, setRotationNotice] = useState('')
  const previousContainerKeyRef = useRef<string | null>(null)
  const previousAutoPlacedCountRef = useRef(0)
  const suppressContainerChangeNoticeRef = useRef(false)
  
  // Backend integrated states
  const [customContainers, setCustomContainers] = useState<ContainerSpec[]>([])
  const [showCustomContainerDialog, setShowCustomContainerDialog] = useState(false)
  const [CustomContainerDialog, setCustomContainerDialog] = useState<CustomContainerDialogComponent | null>(null)
  const [customContainerDialogLoadFailed, setCustomContainerDialogLoadFailed] = useState(false)
  const [historyPlans, setHistoryPlans] = useState<HistoryPlan[]>([])
  const [historyLoadFailed, setHistoryLoadFailed] = useState(false)
  const historyRequestIdRef = useRef(0)
  const [customCargoItems, setCustomCargoItems] = useState<CargoItem[]>([])
  const [cargoLibraryForm, setCargoLibraryForm] = useState<CargoForm>(emptyForm)
  const [editingLibraryCargoId, setEditingLibraryCargoId] = useState<string | null>(null)
  const [cargoLibraryNotice, setCargoLibraryNotice] = useState('')
  const [recentErrors, setRecentErrors] = useState<string[]>([])

  useEffect(() => {
    setPlacementSettings(loadPlacementSettings(currentUser?.id ?? null))
  }, [currentUser?.id])

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
  const [customMapping, setCustomMapping] = useState<Record<string, string>>({
    label: '',
    name: '',
    length: '',
    width: '',
    height: '',
    weight: '',
    quantity: '',
    color: '',
    canRotate: '',
    stackable: '',
    maxStackLayers: '',
    groundOnly: '',
    dimensions: '',
  })
  type DimensionUnit = 'auto' | 'mm' | 'cm'
  const [customUnits, setCustomUnits] = useState<Record<'length' | 'width' | 'height', DimensionUnit>>({
    length: 'auto',
    width: 'auto',
    height: 'auto',
  })
  const [templateDimensionMode, setTemplateDimensionMode] = useState<'separate' | 'combined'>('separate')
  const [templateCombinedColumn, setTemplateCombinedColumn] = useState('')
  const [templateDimensionOrder, setTemplateDimensionOrder] = useState<Array<'length' | 'width' | 'height'>>(['length', 'width', 'height'])
  const LAST_USED_TEMPLATE_KEY = 'cargo_last_used_template_id'
  const [importTemplates, setImportTemplates] = useState<ImportTemplate[]>([])
  const [selectedImportTemplateId, setSelectedImportTemplateId] = useState('')
  const [templateName, setTemplateName] = useState('')
  const [templateHeaderRow, setTemplateHeaderRow] = useState(1)
  const [templateStartRow, setTemplateStartRow] = useState(2)
  const [templateDefaults, setTemplateDefaults] = useState<ImportTemplateDefaults>({ quantity: 1, canRotate: true, stackable: true })
  const [templateSaveNotice, setTemplateSaveNotice] = useState('')
  const [missingImportColumns, setMissingImportColumns] = useState<string[]>([])
  const [editingImportTemplateId, setEditingImportTemplateId] = useState('')
  const [editingImportTemplateDraft, setEditingImportTemplateDraft] = useState<ImportTemplatePayload | null>(null)
  const [newImportTemplateDraft, setNewImportTemplateDraft] = useState<ImportTemplatePayload | null>(null)
  const [exportTemplates, setExportTemplates] = useState<ExportTemplate[]>([])
  const [selectedExportTemplateId, setSelectedExportTemplateId] = useState('')
  const [editingExportTemplateId, setEditingExportTemplateId] = useState('')
  const [editingExportTemplateDraft, setEditingExportTemplateDraft] = useState<ExportTemplatePayload | null>(null)
  const [newExportTemplateDraft, setNewExportTemplateDraft] = useState<ExportTemplatePayload | null>(null)
  // Header candidates for the standalone template manager mapping dropdowns,
  // loaded from a sample workbook (the manager page has no live import file).
  const [templateSampleRows, setTemplateSampleRows] = useState<ImportCargoRow[]>([])
  const { canConfirm: canConfirmMapping, missingFieldsHint } = useMemo(() => {
    const isCombined = templateDimensionMode === 'combined'
    const missing: string[] = []
    let canConfirm = true
    if (isCombined) {
      if (!templateCombinedColumn) {
        missing.push(t.mappingMissingDimensions)
        canConfirm = false
      }
    } else {
      if (!customMapping.length) {
        missing.push(t.mappingMissingLength)
        canConfirm = false
      }
      if (!customMapping.width) {
        missing.push(t.mappingMissingWidth)
        canConfirm = false
      }
      if (!customMapping.height) {
        missing.push(t.mappingMissingHeight)
        canConfirm = false
      }
    }
    const hasQuantity = customMapping.quantity !== '' || (templateDefaults.quantity ?? 0) > 0
    if (!hasQuantity) {
      missing.push(t.mappingMissingQuantity)
      canConfirm = false
    }
    return {
      canConfirm,
      missingFieldsHint: missing.length > 0 ? `${t.mappingRequiredHint}: ${missing.join(', ')}` : t.mappingConfirmReady,
    }
  }, [templateDimensionMode, customMapping.length, customMapping.width, customMapping.height, customMapping.quantity, templateCombinedColumn, templateDefaults.quantity, t])
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
    try {
      setCustomContainers(await readCustomContainers())
      setCustomContainerLoadFailed(false)
    } catch (err) {
      console.error(err)
      setCustomContainerLoadFailed(true)
    }
  }

  const fetchHistory = async () => {
    const requestId = ++historyRequestIdRef.current
    try {
      const plans = await readHistoryPlans()
      if (requestId !== historyRequestIdRef.current) return
      setHistoryPlans(plans)
      setHistoryLoadFailed(false)
    } catch (err) {
      if (requestId !== historyRequestIdRef.current) return
      console.error(err)
      setHistoryLoadFailed(true)
    }
  }

  const fetchImportTemplates = async () => {
    try {
      setImportTemplates(await readImportTemplates())
    } catch (err) {
      console.error(err)
    }
  }

  const fetchExportTemplates = async () => {
    try {
      setExportTemplates(await readExportTemplates())
    } catch (err) {
      console.error(err)
    }
  }

  const fetchCustomCargo = async () => {
    try {
      setCustomCargoItems(await readCustomCargo())
    } catch (err) {
      console.error(err)
    }
  }

  const deleteHistoryPlan = async (id: string) => {
    if (!confirm(locale === 'zh' ? '确认删除该历史方案吗？' : 'Are you sure you want to delete this plan?')) {
      return
    }
    try {
      await deleteHistoryPlanRequest(id)
      await fetchHistory()
    } catch (err) {
      console.error(err)
      alert(locale === 'zh' ? '删除失败' : 'Failed to delete')
    }
  }

  useEffect(() => {
    // Let StrictMode cancel its development-only trial mount before requests start.
    const requestTimer = window.setTimeout(() => {
      void fetchHistory()
      void fetchCustomContainers()
      void fetchImportTemplates()
      void fetchExportTemplates()
      void fetchCustomCargo()
    }, 0)

    return () => window.clearTimeout(requestTimer)
  }, [])

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
  const defaultMaxStackLayers = placementSettings.defaultMaxStackLayers
  const calculateCurrentPacking = () => calculatePacking(selectedContainer, displayCargoItems, { loadingMode, defaultMaxStackLayers })
  const [calculatedResult, setCalculatedResult] = useState<PackingResult>(() =>
    calculatePacking(containers[0], normalizeCargoLabelColors(initialCargo), { loadingMode: 'quantity' }),
  )
  const result = hasCalculated ? calculatedResult : emptyPackingResult(selectedContainer, displayCargoItems)
  const detailRows = useMemo(
    () => buildExportPlanRows(displayCargoItems, result, { defaultMaxStackLayers }),
    [defaultMaxStackLayers, displayCargoItems, result],
  )
  const currentContainerKey = useMemo(() => containerPlacementKey(selectedContainer), [selectedContainer])

  const markPlacementDirty = () => {
    setHasCalculated(false)
    setContainerChangeNotice('')
  }

  const calculateAndShowPlacement = () => {
    setCalculatedResult(calculateCurrentPacking())
    setHasCalculated(true)
    setContainerChangeNotice('')
  }

  const showCalculatedPlacement = (nextResult: PackingResult) => {
    setCalculatedResult(nextResult)
    setHasCalculated(true)
    setContainerChangeNotice('')
  }

  useEffect(() => {
    const previousKey = previousContainerKeyRef.current
    if (suppressContainerChangeNoticeRef.current) {
      suppressContainerChangeNoticeRef.current = false
      previousContainerKeyRef.current = currentContainerKey
      previousAutoPlacedCountRef.current = placementMode === 'auto' && hasCalculated ? result.placedCount : 0
      return
    }
    if (clearPlacementOnContainerChange({
      previousKey,
      nextKey: currentContainerKey,
      placementMode,
      hasCalculated,
      placedCount: previousAutoPlacedCountRef.current,
    })) {
      setHasCalculated(false)
      setSelectedBoxId(null)
      setActiveLayerId('all')
      setContainerChangeNotice(t.containerChangedNotice)
    }
    previousContainerKeyRef.current = currentContainerKey
    previousAutoPlacedCountRef.current = placementMode === 'auto' && hasCalculated ? result.placedCount : 0
  }, [currentContainerKey, hasCalculated, placementMode, result.placedCount, t.containerChangedNotice])

  const manualDraft = manualHistory.present
  const manualPool = useMemo(
    () => manualBuildPool(displayCargoItems, manualDraft),
    [displayCargoItems, manualDraft],
  )
  const manualIssues = useMemo(
    () => manualValidateDraft(manualDraft, renderingContainer, placementSettings.supportPolicy),
    [manualDraft, renderingContainer, placementSettings.supportPolicy],
  )
  const manualInvalidBoxIds = useMemo(() => {
    const ids = new Set<string>()
    for (const issue of manualIssues) {
      if (isBlockingManualIssue(issue)) ids.add(issue.boxId)
    }
    return ids
  }, [manualIssues])
  const manualPlacedBoxes = useMemo(
    () => manualToPlacedBoxes(manualDraft, manualInvalidBoxIds),
    [manualDraft, manualInvalidBoxIds],
  )
  const manualResult = useMemo(
    () => buildManualPackingResult(manualPlacedBoxes, renderingContainer),
    [manualPlacedBoxes, renderingContainer],
  )
  const manualCapacity = useMemo(
    () => computeRemainingCapacity(manualPlacedBoxes, renderingContainer),
    [manualPlacedBoxes, renderingContainer],
  )
  const commitManual = (nextDraft: ManualDraft) => {
    setManualHistory((current) => manualCommit(current, nextDraft))
  }

  const notifyManualRejected = (
    operation: 'move' | 'drop' | 'rotate',
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
    const box = manualDraft.boxes.find((b) => b.id === id)
    const clampedX = box ? Math.max(0, Math.min(renderingContainer.length - box.length, x)) : x
    const clampedY = box ? Math.max(0, Math.min(renderingContainer.width - box.width, y)) : y
    const clampedZ = (z !== undefined && box) ? Math.max(0, Math.min(renderingContainer.height - box.height, z)) : z
    const nextDraft = manualSetBoxPosition(manualDraft, id, clampedX, clampedY, clampedZ)
    const issues = manualValidateBox(nextDraft, id, renderingContainer, placementSettings.supportPolicy)
    if (issues.some(isBlockingManualIssue)) {
      notifyManualRejected('move', id, undefined, issues)
      return
    }
    setManualNotice(null)
    commitManual(nextDraft)
  }

  const handleManualDropFromPool = (cargoId: string, dropX: number, dropY: number, dropZ?: number) => {
    const cargoItem = displayCargoItems.find((item) => item.id === cargoId)
    if (!cargoItem) return
    const used = manualDraft.boxes.filter((box) => box.cargoId === cargoId).length
    if (used >= cargoItem.quantity) {
      notifyManualRejected('drop', undefined, cargoId, undefined, 'quantity-limit')
      return
    }
    const boxId = `manual-${cargoId}-${Date.now()}-${used + 1}`
    // ContainerScene's onDrop already produces top-left corner via resolveDropTarget; the legacy
    // ManualPlacement2D drop path passes the cursor centre, so we centre-shift only when no z
    // was supplied (3D pool drop always passes z).
    const supplyZ = typeof dropZ === 'number'
    const x = supplyZ ? dropX : Math.max(0, dropX - cargoItem.length / 2)
    const y = supplyZ ? dropY : Math.max(0, dropY - cargoItem.width / 2)
    const newBox = makeManualBox({
      id: boxId,
      cargoId,
      label: cargoItem.label ?? cargoItem.name,
      color: cargoItem.color,
      length: cargoItem.length,
      width: cargoItem.width,
      height: cargoItem.height,
      weight: cargoItem.weight,
      canRotate: cargoItem.canRotate,
      stackable: cargoItem.stackable,
      maxStackLayers: cargoItem.maxStackLayers,
      x,
      y,
      z: supplyZ ? dropZ : 0,
    })
    const nextDraft = manualAddBox(manualDraft, newBox)
    const issues = manualValidateBox(nextDraft, boxId, renderingContainer, placementSettings.supportPolicy)
    if (issues.some(isBlockingManualIssue)) {
      notifyManualRejected('drop', boxId, cargoId, issues)
      return
    }
    setManualNotice(null)
    commitManual(nextDraft)
    setManualSelectedId(boxId)
  }

  const handleQuickPlaceCargo = (cargoId: string) => {
    const cargoItem = displayCargoItems.find((item) => item.id === cargoId)
    if (!cargoItem) return
    const result = quickPlaceCargo({
      cargo: cargoItem,
      draft: manualDraft,
      container: renderingContainer,
      createId: () => `manual-${cargoId}-${Date.now()}-${manualDraft.boxes.length + 1}`,
      supportPolicy: placementSettings.supportPolicy,
    })
    if (!result.ok) {
      if (result.reason === 'quantity-limit') {
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
    commitManual(result.nextDraft)
    setManualSelectedId(result.box.id)
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
    const dry = manualDryRunRotation(manualDraft, boxId, renderingContainer, direction, placementSettings.supportPolicy)
    if (!dry.ok) {
      setRotationNotice(buildRotationNotice(dry, renderingContainer, locale))
      notifyManualRejected('rotate', boxId, undefined, dry.issues)
      return
    }
    const nextDraft = rotateManualDraft(manualDraft, boxId, direction)
    setRotationNotice('')
    setManualNotice(null)
    commitManual(nextDraft)
  }

  const handleManualDeleteBox = (boxId: string) => {
    commitManual(manualRemoveBox(manualDraft, boxId))
    setManualSelectedId(null)
  }

  const handleContinueManually = () => {
    const nextDraft = {
      boxes: result.placed.map((box) => {
        const cargo = displayCargoItems.find((item) => item.id === box.cargoId)
        return makeManualBox({
          id: `manual-${box.id}`,
          cargoId: box.cargoId,
          label: box.label,
          color: box.color,
          length: box.length,
          width: box.width,
          height: box.height,
          weight: box.weight,
          canRotate: cargo?.canRotate ?? true,
          stackable: cargo?.stackable ?? box.stackable,
          maxStackLayers: cargo?.maxStackLayers ?? box.maxStackLayers,
          x: box.x,
          y: box.y,
          z: box.z,
        })
      }),
    }
    setManualHistory((current) => manualCommit(current, nextDraft))
    setManualSelectedId(null)
    setPlacementMode('manual')
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

      if ((event.key === 'r' || event.key === 'R') && placementMode === 'manual' && manualSelectedId) {
        event.preventDefault()
        const direction: ManualRotationDirection = event.shiftKey ? 'down' : 'right'
        const dry = manualDryRunRotation(manualDraft, manualSelectedId, renderingContainer, direction, placementSettings.supportPolicy)
        if (!dry.ok) {
          setRotationNotice(buildRotationNotice(dry, renderingContainer, locale))
          setManualNotice(createManualOperationNotice({
            operation: 'rotate',
            boxId: manualSelectedId,
            issues: dry.issues,
            locale,
          }))
          return
        }
        const nextDraft = rotateManualDraft(manualDraft, manualSelectedId, direction)
        setRotationNotice('')
        setManualNotice(null)
        setManualHistory((current) => manualCommit(current, nextDraft))
        return
      }

      if (event.key === 'm' || event.key === 'M') {
        event.preventDefault()
        setClearanceEnabled((enabled) => !enabled)
        return
      }

      if (event.key === 'Escape') {
        setManualSelectedId(null)
        return
      }
    }

    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [placementMode, manualSelectedId, manualDraft, renderingContainer, locale, placementSettings.supportPolicy])

  useEffect(() => {
    if (!manualNotice) return
    const timer = window.setTimeout(() => setManualNotice(null), 5000)
    return () => window.clearTimeout(timer)
  }, [manualNotice])

  const activeLayer = result.layers.find((layer) => layer.id === activeLayerId)
  const layerHasGapFill = (physicalLayer: number) => result.placed.some((box) => box.physicalLayer === physicalLayer && isGapFillBox(box))
  const activeStepsResult = placementMode === 'manual'
    ? (manualResult.placed.length > 0 ? manualResult : null)
    : (hasCalculated ? result : null)
  const playbackSequence = useMemo(() => buildPlaybackSequence(activeStepsResult), [activeStepsResult])
  const playbackAvailable = playbackSequence.total > 0
  const playback = usePlaybackController(playbackSequence)
  const playbackActive = playbackAvailable && activeResultTab === 'playback'
  const loadingTaskGroups = useMemo(() => buildLoadingTaskGroups(activeStepsResult), [activeStepsResult])
  const loadingStepsAvailable = loadingTaskGroups.length > 0
  const activeLoadingGroup = loadingTaskGroups[Math.max(0, Math.min(activeLoadingGroupIndex, loadingTaskGroups.length - 1))] ?? null
  const activeLoadingGroupBoxIds = useMemo(() => activeLoadingGroup ? new Set(activeLoadingGroup.boxIds) : undefined, [activeLoadingGroup])
  const loadingStepsActive = loadingStepsAvailable && activeResultTab === 'loadingSteps'
  const visibleAutoBoxes = useMemo(() => {
    if (playbackActive) return visibleBoxesAt(playbackSequence, playback.cursor)
    return hasCalculated ? result.placed : []
  }, [playbackActive, playbackSequence, playback.cursor, hasCalculated, result.placed])
  const visibleManualBoxes = useMemo(() => {
    if (placementMode === 'manual' && playbackActive) return visibleBoxesAt(playbackSequence, playback.cursor)
    return manualPlacedBoxes
  }, [manualPlacedBoxes, placementMode, playback.cursor, playbackActive, playbackSequence])
  const visibleBoxes = hasCalculated
    ? result.placed.filter((box) => (activeLayerId === 'all' || String(box.physicalLayer) === activeLayerId) && (activeLabelId === 'all' || box.label === activeLabelId))
    : []

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

  const cogResult = useMemo(() => computeCenterOfGravity(visibleAutoBoxes.length > 0 ? visibleAutoBoxes : result.placed, selectedContainer), [result.placed, visibleAutoBoxes, selectedContainer])
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
      ? buildCogOverlay(cogResult, selectedContainer, vehicleProfile)
      : null),
    [cogViewState.showOverlay, placementMode, cogResult, selectedContainer, vehicleProfile],
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
    () => suggestFillItems(hasCalculated ? result : null, selectedContainer),
    [hasCalculated, result, selectedContainer],
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
      result,
      measurements: [],
      cog: cogResult,
      manualIssues,
      locale,
    }),
    [result, cogResult, manualIssues, locale],
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
        placedBoxes: result.placed,
        visibleBoxes: visibleAutoBoxes,
        unplaced: result.unplaced,
        diagnostics: result.diagnostics,
        layersCount: result.layers.length,
        placedCount: result.placedCount,
        totalCargoCount: result.totalCargoCount,
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
      result.diagnostics,
      result.layers.length,
      result.placed,
      result.placedCount,
      result.totalCargoCount,
      result.unplaced,
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
    setCargoItems((current) => [...current, item])
    markPlacementDirty()
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
    setCargoItems((current) => [...current, ...additions])
    markPlacementDirty()
  }
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

  const updateMaxStackLayers = (value: string) => {
    const parsed = Math.floor(Number(value) || 0)
    setForm((current) => ({ ...current, maxStackLayers: parsed > 0 ? parsed : undefined }))
  }

  const updateEditMaxStackLayers = (value: string) => {
    const parsed = Math.floor(Number(value) || 0)
    setEditForm((current) => ({ ...current, maxStackLayers: parsed > 0 ? parsed : undefined }))
  }

  const updateLibraryNumber = (field: keyof Pick<CargoForm, 'length' | 'width' | 'height' | 'weight' | 'quantity'>, value: string) => {
    setCargoLibraryForm((current) => ({ ...current, [field]: Number(value) || 0 }))
  }

  const updateLibraryMaxStackLayers = (value: string) => {
    const parsed = Math.floor(Number(value) || 0)
    setCargoLibraryForm((current) => ({ ...current, maxStackLayers: parsed > 0 ? parsed : undefined }))
  }

  const updateDefaultMaxStackLayers = (value: string) => {
    const parsed = Math.floor(Number(value) || 0)
    setPlacementSettings((current) => ({ ...current, defaultMaxStackLayers: parsed > 0 ? parsed : undefined }))
    markPlacementDirty()
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
      maxStackLayers: form.stackable ? form.maxStackLayers : undefined,
      groundOnly: form.groundOnly ?? false,
    }
    setCargoItems((items) => [...items, next])
    setForm((current) => ({
      ...current,
      name: `Carton ${nextLabel(cargoItems.length + 2)}`,
      label: nextLabel(cargoItems.length + 1),
      color: colors[(cargoItems.length + 1) % colors.length],
    }))
    markPlacementDirty()
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
      label: (editForm.label || editingCargo.label || nextLabel(cargoItems.length)).toUpperCase().slice(0, 2),
      quantity: Math.max(1, Math.floor(editForm.quantity)),
      maxStackLayers: editForm.stackable ? editForm.maxStackLayers : undefined,
      groundOnly: editForm.groundOnly ?? false,
    }

    setCargoItems((items) => items.map((item) => item.id === editingCargo.id ? nextCargo : item))
    setEditingCargo(null)
    setSelectedBoxId(null)
    markPlacementDirty()
  }

  const importMessagesFor = (imported: ReturnType<typeof parseCargoRowsWithTemplate>) => [
    `${t.importSuccess}: ${imported.summary.importedRows}`,
    `${t.importMappedFields}: ${imported.summary.mappedFields.join(', ') || '-'}`,
    `${t.importConvertedRows}: ${imported.summary.convertedCentimeterRows}`,
    `${t.importSkippedRows}: ${imported.summary.skippedRows}`,
    ...imported.errors.map((issue) => `${t.importIssue} row ${issue.row}: ${translateImportIssue(issue, locale)}`),
    ...imported.warnings.map((issue) => `${t.importWarning} row ${issue.row}: ${translateImportIssue(issue, locale)}`),
  ]

  const applyImportedCargo = (imported: ReturnType<typeof parseCargoRowsWithTemplate>) => {
    setImportMessages(importMessagesFor(imported))
    if (imported.items.length > 0) {
      setCargoItems(imported.items)
      setSelectedBoxId(null)
      markPlacementDirty()
    }
    setActiveResultTab('importLog')
  }

  const rememberSelectedImportTemplate = (templateId: string) => {
    if (!templateId) return
    try {
      localStorage.setItem(LAST_USED_TEMPLATE_KEY, templateId)
    } catch { /* ignore */ }
  }

  const confirmMappingImport = () => {
    const imported = parseCargoRowsWithTemplate(importRows, {
      mapping: customMapping,
      units: customUnits,
      headerRow: templateHeaderRow,
      startRow: templateStartRow,
      mergeRows: 'none',
      dimensionMode: templateDimensionMode,
      combinedColumn: templateCombinedColumn,
      dimensionOrder: templateDimensionOrder,
      defaultValues: templateDefaults,
    }, { colors })
    applyImportedCargo(imported)
    setMissingImportColumns([])
    setShowMappingModal(false)
    // Persist the raw mapping the user confirmed. The import dialog no longer
    // auto-loads it on open; named template selection is now explicit.
    saveLastImportConfig(currentUser?.id ?? null, {
      mapping: customMapping,
      units: customUnits,
      headerRow: templateHeaderRow,
      startRow: templateStartRow,
      dimensionMode: templateDimensionMode,
      combinedColumn: templateCombinedColumn,
      dimensionOrder: templateDimensionOrder,
      defaults: templateDefaults,
    })
    if (imported.items.length > 0) rememberSelectedImportTemplate(selectedImportTemplateId)
    setActiveNav('report')
  }

  const applyImportTemplate = (templateId: string) => {
    setSelectedImportTemplateId(templateId)
    setMissingImportColumns([])
    const template = importTemplates.find((item) => item.id === templateId)
    if (!template) {
      setCustomMapping({
        label: '',
        name: '',
        length: '',
        width: '',
        height: '',
        weight: '',
        quantity: '',
        color: '',
        canRotate: '',
        stackable: '',
        maxStackLayers: '',
        groundOnly: '',
        dimensions: '',
      })
      setCustomUnits({ length: 'auto', width: 'auto', height: 'auto' })
      setTemplateHeaderRow(1)
      setTemplateStartRow(2)
      setTemplateDimensionMode('separate')
      setTemplateCombinedColumn('')
      setTemplateDefaults({ quantity: 1, canRotate: true, stackable: true })
      setTemplateName('')
      setTemplateDimensionOrder(['length', 'width', 'height'])
      return
    }
    const next = importMappingValueFromTemplate(template)
    setCustomMapping(next.mapping)
    setCustomUnits(next.units)
    setTemplateHeaderRow(next.headerRow)
    setTemplateStartRow(next.startRow)
    setTemplateDimensionMode(next.dimensionMode)
    setTemplateCombinedColumn(next.combinedColumn)
    setTemplateDefaults(next.defaults)
    setTemplateName(template.name)
    setTemplateDimensionOrder(next.dimensionOrder)
    setMissingImportColumns(missingMappedColumns(next, importColumnsForHeaderRow(importRows, next.headerRow)))
  }


  const importMappingValue: ImportMappingValue = {
    mapping: customMapping,
    units: customUnits,
    headerRow: templateHeaderRow,
    startRow: templateStartRow,
    dimensionMode: templateDimensionMode,
    combinedColumn: templateCombinedColumn,
    dimensionOrder: templateDimensionOrder,
    defaults: templateDefaults,
  }

  const handleImportMappingChange = (next: ImportMappingValue) => {
    setCustomMapping(next.mapping)
    setCustomUnits(next.units)
    setTemplateHeaderRow(next.headerRow)
    setTemplateStartRow(next.startRow)
    setTemplateDimensionMode(next.dimensionMode)
    setTemplateCombinedColumn(next.combinedColumn)
    setTemplateDimensionOrder(next.dimensionOrder)
    setTemplateDefaults(next.defaults)
    setMissingImportColumns(selectedImportTemplateId
      ? missingMappedColumns(next, importColumnsForHeaderRow(importRows, next.headerRow))
      : [])
  }

  const libraryFormCargo = (): CargoItem => ({
    ...cargoLibraryForm,
    id: editingLibraryCargoId ?? createClientId(),
    name: cargoLibraryForm.name.trim() || (locale === 'zh' ? '库货物' : 'Library cargo'),
    label: (cargoLibraryForm.label || nextLabel(customCargoItems.length)).toUpperCase().slice(0, 2),
    quantity: 1,
    maxStackLayers: cargoLibraryForm.stackable ? cargoLibraryForm.maxStackLayers : undefined,
    groundOnly: cargoLibraryForm.groundOnly ?? false,
  })

  const saveLibraryCargo = async (event: FormEvent) => {
    event.preventDefault()
    const item = libraryFormCargo()
    const saved = editingLibraryCargoId
      ? await updateCustomCargo(editingLibraryCargoId, item)
      : await saveCustomCargo(item)
    if (!saved) {
      alert(locale === 'zh' ? '保存货物失败' : 'Failed to save cargo')
      return
    }
    setCargoLibraryNotice(editingLibraryCargoId ? t.cargoLibraryNoticeUpdated : t.cargoLibraryNoticeSaved)
    setEditingLibraryCargoId(null)
    setCargoLibraryForm(emptyForm)
    await fetchCustomCargo()
  }

  const editLibraryCargo = (item: CargoItem) => {
    setEditingLibraryCargoId(item.id)
    setCargoLibraryForm({
      name: item.name,
      label: item.label,
      length: item.length,
      width: item.width,
      height: item.height,
      weight: item.weight,
      quantity: 1,
      color: item.color,
      canRotate: item.canRotate,
      stackable: item.stackable,
      maxStackLayers: item.maxStackLayers,
      groundOnly: item.groundOnly ?? false,
    })
  }

  const removeLibraryCargo = async (id: string) => {
    const ok = await deleteCustomCargo(id)
    if (!ok) {
      alert(locale === 'zh' ? '删除货物失败' : 'Failed to delete cargo')
      return
    }
    setCargoLibraryNotice(t.cargoLibraryNoticeDeleted)
    if (editingLibraryCargoId === id) {
      setEditingLibraryCargoId(null)
      setCargoLibraryForm(emptyForm)
    }
    await fetchCustomCargo()
  }

  const addLibraryCargoToWorkbench = (item: CargoItem) => {
    setCargoItems((current) => [...current, { ...item, id: createClientId(), quantity: Math.max(1, item.quantity || 1) }])
    markPlacementDirty()
    setActiveNav('overview')
  }

  const handleSaveImportTemplate = async () => {
    const name = templateName.trim()
    if (!name) return

    const selected = importTemplates.find((t) => t.id === selectedImportTemplateId)
    const isUpdate = !!(selectedImportTemplateId && selected && name === selected.name)

    const payload = {
      name,
      mapping: customMapping,
      units: customUnits as ImportTemplateUnits,
      headerRow: templateHeaderRow,
      startRow: templateStartRow,
      mergeRows: 'none' as const,
      dimensionMode: templateDimensionMode,
      combinedColumn: templateCombinedColumn || customMapping.dimensions || '',
      dimensionOrder: templateDimensionOrder,
      defaultValues: templateDefaults,
    }

    const saved = isUpdate
      ? await updateImportTemplate(selected.id, payload)
      : await saveImportTemplate(payload)

    if (!saved) {
      alert(locale === 'zh' ? '保存模板失败' : 'Failed to save template')
      return
    }

    if (isUpdate) {
      setImportTemplates((current) => current.map((item) => item.id === saved.id ? saved : item))
    } else {
      setImportTemplates((current) => [saved, ...current.filter((item) => item.id !== saved.id)])
    }
    setSelectedImportTemplateId(saved.id)
    // Saving records the chosen template for telemetry/local continuity, but
    // the next import starts from "None" and waits for explicit template selection.
    try {
      localStorage.setItem(LAST_USED_TEMPLATE_KEY, saved.id)
    } catch { /* ignore */ }
    setEditingImportTemplateId('')
    setEditingImportTemplateDraft(null)
    const noticeText = isUpdate ? t.templateUpdated : t.templateSaved
    setTemplateSaveNotice(`${noticeText}: ${saved.name}`)
    setImportMessages((messages) => [`${noticeText}: ${saved.name}`, ...messages])
  }

  const createBlankImportTemplateDraft = (): ImportTemplatePayload => ({
    name: '',
    mapping: {
      label: '',
      name: '',
      length: '',
      width: '',
      height: '',
      weight: '',
      quantity: '',
    },
    units: {
      length: 'auto',
      width: 'auto',
      height: 'auto',
    },
    headerRow: 1,
    startRow: 2,
    mergeRows: 'none',
    dimensionMode: 'separate',
    combinedColumn: '',
    dimensionOrder: templateDimensionOrder,
    defaultValues: { quantity: 1, canRotate: true, stackable: true },
  })

  const editImportTemplate = (template: ImportTemplate) => {
    setEditingImportTemplateId(template.id)
    setEditingImportTemplateDraft({
      name: template.name,
      mapping: { ...template.mapping },
      units: { ...template.units },
      headerRow: template.headerRow,
      startRow: template.startRow,
      mergeRows: template.mergeRows,
      dimensionMode: template.dimensionMode ?? 'separate',
      combinedColumn: template.combinedColumn || template.mapping.dimensions || '',
      dimensionOrder: template.dimensionOrder ?? ['length', 'width', 'height'],
      defaultValues: template.defaultValues,
    })
    setTemplateDimensionOrder(template.dimensionOrder ?? ['length', 'width', 'height'])
  }

  const saveEditedImportTemplate = async () => {
    const template = importTemplates.find((item) => item.id === editingImportTemplateId)
    const draft = editingImportTemplateDraft
    const name = draft?.name.trim()
    if (!template || !draft || !name) return

    const updated = await updateImportTemplate(template.id, {
      name,
      mapping: draft.mapping,
      units: draft.units,
      headerRow: draft.headerRow,
      startRow: draft.startRow,
      mergeRows: draft.mergeRows,
      dimensionMode: draft.dimensionMode,
      combinedColumn: draft.combinedColumn || draft.mapping.dimensions || '',
      dimensionOrder: draft.dimensionOrder,
      defaultValues: draft.defaultValues,
    })
    if (!updated) {
      alert(locale === 'zh' ? '更新模板失败' : 'Failed to update template')
      return
    }
    setImportTemplates((current) => current.map((item) => item.id === updated.id ? updated : item))
    setTemplateSaveNotice(`${t.templateUpdated}: ${updated.name}`)
    if (selectedImportTemplateId === updated.id) {
      setTemplateName(updated.name)
    }
    setEditingImportTemplateId('')
    setEditingImportTemplateDraft(null)
  }

  const loadTemplateSampleHeaders = async (file: File | null) => {
    if (!file) return
    try {
      const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array' })
      const sheet = workbook.Sheets[workbook.SheetNames[0]]
      setTemplateSampleRows(sheet ? XLSX.utils.sheet_to_json<WorksheetCell[]>(sheet, { header: 1, raw: true }) : [])
    } catch (error) {
      console.error('[template-sample]', error)
      setTemplateSampleRows([])
    }
  }

  // Adapt the persisted ImportTemplatePayload draft to/from the shared mapping
  // form value shape (defaultValues <-> defaults, undefined row fallbacks).
  const draftToMappingValue = (draft: ImportTemplatePayload): ImportMappingValue => ({
    mapping: draft.mapping,
    units: draft.units,
    headerRow: draft.headerRow ?? 1,
    startRow: draft.startRow ?? 2,
    dimensionMode: draft.dimensionMode ?? 'separate',
    combinedColumn: draft.combinedColumn || draft.mapping.dimensions || '',
    dimensionOrder: draft.dimensionOrder ?? ['length', 'width', 'height'],
    defaults: draft.defaultValues ?? {},
  })

  const applyMappingValueToDraft = (draft: ImportTemplatePayload, next: ImportMappingValue): ImportTemplatePayload => ({
    ...draft,
    mapping: next.mapping,
    units: next.units,
    headerRow: next.headerRow,
    startRow: next.startRow,
    dimensionMode: next.dimensionMode,
    combinedColumn: next.combinedColumn,
    dimensionOrder: next.dimensionOrder,
    defaultValues: next.defaults,
  })

  const saveNewImportTemplate = async () => {
    const draft = newImportTemplateDraft
    const name = draft?.name.trim()
    if (!draft || !name) return
    const saved = await saveImportTemplate({
      name,
      mapping: draft.mapping,
      units: draft.units,
      headerRow: draft.headerRow,
      startRow: draft.startRow,
      mergeRows: draft.mergeRows,
      dimensionMode: draft.dimensionMode,
      combinedColumn: draft.combinedColumn || draft.mapping.dimensions || '',
      dimensionOrder: draft.dimensionOrder,
      defaultValues: draft.defaultValues,
    })
    if (!saved) {
      alert(locale === 'zh' ? '创建模板失败' : 'Failed to create template')
      return
    }
    setImportTemplates((current) => [saved, ...current.filter((item) => item.id !== saved.id)])
    setSelectedImportTemplateId(saved.id)
    setTemplateName(saved.name)
    setTemplateSaveNotice(`${t.templateSaved}: ${saved.name}`)
    setNewImportTemplateDraft(null)
  }

  const removeImportTemplate = async (id: string) => {
    const ok = await deleteImportTemplate(id)
    if (!ok) {
      alert(locale === 'zh' ? '删除模板失败' : 'Failed to delete template')
      return
    }
    setImportTemplates((current) => current.filter((item) => item.id !== id))
    if (selectedImportTemplateId === id) {
      setSelectedImportTemplateId('')
      setTemplateName('')
    }
    if (editingImportTemplateId === id) {
      setEditingImportTemplateId('')
      setEditingImportTemplateDraft(null)
    }
    setTemplateSaveNotice(t.templateDeleted)
  }

  const createBlankExportTemplate = (): ExportTemplatePayload => ({
    name: '',
    columns: EXPORT_FIELD_KEYS.map((field) => ({ field, header: field })),
  })

  const saveNewExportTemplate = async () => {
    const draft = newExportTemplateDraft
    const name = draft?.name.trim()
    if (!draft || !name) return
    const saved = await saveExportTemplate({ name, columns: draft.columns })
    if (!saved) {
      alert(locale === 'zh' ? '创建导出模板失败' : 'Failed to create export template')
      return
    }
    setExportTemplates((current) => [saved, ...current.filter((item) => item.id !== saved.id)])
    setSelectedExportTemplateId(saved.id)
    setNewExportTemplateDraft(null)
    setTemplateSaveNotice(`${t.templateSaved}: ${saved.name}`)
  }

  const editExportTemplate = (template: ExportTemplate) => {
    setEditingExportTemplateId(template.id)
    setEditingExportTemplateDraft({ name: template.name, columns: template.columns.map((col) => ({ ...col })) })
  }

  const saveEditedExportTemplate = async () => {
    const draft = editingExportTemplateDraft
    const name = draft?.name.trim()
    if (!draft || !name || !editingExportTemplateId) return
    const updated = await updateExportTemplate(editingExportTemplateId, { name, columns: draft.columns })
    if (!updated) {
      alert(locale === 'zh' ? '更新导出模板失败' : 'Failed to update export template')
      return
    }
    setExportTemplates((current) => current.map((item) => item.id === updated.id ? updated : item))
    setEditingExportTemplateId('')
    setEditingExportTemplateDraft(null)
    setTemplateSaveNotice(`${t.templateUpdated}: ${updated.name}`)
  }

  const removeExportTemplate = async (id: string) => {
    const ok = await deleteExportTemplate(id)
    if (!ok) {
      alert(locale === 'zh' ? '删除导出模板失败' : 'Failed to delete export template')
      return
    }
    setExportTemplates((current) => current.filter((item) => item.id !== id))
    if (selectedExportTemplateId === id) setSelectedExportTemplateId('')
    if (editingExportTemplateId === id) {
      setEditingExportTemplateId('')
      setEditingExportTemplateDraft(null)
    }
    setTemplateSaveNotice(t.templateDeleted)
  }

  const canAutoMap = (row: ImportCargoRow): boolean => {
    if (Array.isArray(row)) return false
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
      maxStackLayers: ['maxstacklayers', 'max stack layers', '最大堆叠层数', '最大堆疊層數', '堆叠层数', '堆疊層數'],
      groundOnly: ['groundonly', 'ground only', '必须落地', '落地', '不可上托', '不可堆叠在上'],
    }[fieldKey] || []
    return columns.find(col => candidates.some(cand => col.toLowerCase().includes(cand.toLowerCase()))) || ''
  }

  const importColumnsForHeaderRow = (rows: ImportCargoRow[], headerRow: number): string[] => {
    if (rows.some(Array.isArray)) {
      const header = rows[Math.max(0, headerRow - 1)]
      return Array.isArray(header)
        ? header.map((cell) => String(cell ?? '').trim()).filter(Boolean)
        : []
    }
    return Object.keys(rows[0] ?? {})
  }

  const importPreviewRows = (rows: ImportCargoRow[], headerRow: number, startRow: number): Record<string, string | number | boolean | null | undefined>[] => {
    if (!rows.some(Array.isArray)) return rows.filter((row): row is Record<string, string | number | boolean | null | undefined> => !Array.isArray(row))
    const columns = importColumnsForHeaderRow(rows, headerRow)
    return rows.slice(Math.max(headerRow, startRow - 1)).filter(Array.isArray).map((row) => {
      const next: Record<string, string | number | boolean | null | undefined> = {}
      columns.forEach((column, index) => {
        next[column] = row[index]
      })
      return next
    })
  }

  const downloadImportTemplate = () => {
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

    const rowKeys = importColumnsForHeaderRow(rows, 1)
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
      setImportMessages([
        `${t.importSuccess}: ${imported.summary.importedRows}`,
        `${t.importMappedFields}: ${imported.summary.mappedFields.join(', ') || '-'}`,
        `${t.importConvertedRows}: ${imported.summary.convertedCentimeterRows}`,
        `${t.importSkippedRows}: ${imported.summary.skippedRows}`,
        ...imported.errors.map((issue) => `${t.importIssue} row ${issue.row}: ${translateImportIssue(issue, locale)}`),
        ...imported.warnings.map((issue) => `${t.importWarning} row ${issue.row}: ${translateImportIssue(issue, locale)}`),
      ])
      if (imported.items.length > 0) {
        setCargoItems(imported.items)
        setSelectedBoxId(null)
        markPlacementDirty()
      } else if (imported.errors.length === 0) {
        setImportMessages((prev) => [...prev, locale === 'zh'
          ? '未识别到可导入的货物行，建议使用模板管理器手动映射列'
          : 'No cargo rows were recognized. Try mapping columns manually with the template manager.'])
      }
      setActiveResultTab('importLog')
      setActiveNav('report')
    } else {
      setImportRows(rows)
      const initialMap: Record<string, string> = {
        label: '',
        name: '',
        length: '',
        width: '',
        height: '',
        weight: '',
        quantity: '',
        color: '',
        canRotate: '',
        stackable: '',
        maxStackLayers: '',
        groundOnly: '',
        dimensions: '',
      }
      const requiredFields = ['label', 'name', 'length', 'width', 'height', 'weight', 'quantity', 'color', 'canRotate', 'stackable', 'maxStackLayers', 'groundOnly', 'dimensions']
      requiredFields.forEach((fieldKey) => {
        initialMap[fieldKey] = preSelectCol(fieldKey, rowKeys)
      })
      setCustomMapping(initialMap)
      setSelectedImportTemplateId('')
      setTemplateName('')
      setTemplateSaveNotice('')
      setTemplateHeaderRow(1)
      setTemplateStartRow(2)
      setTemplateDimensionMode('separate')
      setTemplateCombinedColumn('')
      setTemplateDefaults({ quantity: 1, canRotate: true, stackable: true })
      setTemplateDimensionOrder(['length', 'width', 'height'])
      setMissingImportColumns([])
      setShowMappingModal(true)
    }
  }

  const exportExcel = () => {
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

  const exportPlaybackInstructions = () => {
    if (!playbackAvailable) return
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

  const exportLoadingSheet = () => {
    if (!loadingStepsAvailable || !activeStepsResult) return
    const model = buildLoadingSheetModel(activeStepsResult, renderingContainer)
    const prefix = filenameSlug(shipmentName)
    const blob = exportLoadingSheetPdf({
      model,
      boxes: activeStepsResult.placed,
      container: renderingContainer,
      locale,
      title: shipmentName || projectName,
    })
    downloadBlob(blob, `${prefix ? `${prefix}-` : ''}loading-sheet.pdf`)
  }

  const exportReviewChecklistJson = () => {
    const prefix = filenameSlug(shipmentName)
    downloadBlob(
      new Blob([JSON.stringify(reviewChecklist, null, 2)], { type: 'application/json;charset=utf-8' }),
      `${prefix ? `${prefix}-` : ''}review-checklist.json`,
    )
  }

  const exportReviewChecklistExcel = () => {
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
      defaultMaxStackLayers,
    }

    try {
      await saveHistoryPlanRequest({
        projectName,
        shipmentName,
        loadingMode,
        data: planData,
      })
      await fetchHistory()
      setActiveNav('history')
    } catch (err) {
      console.error(err)
      alert(locale === 'zh' ? '保存历史方案失败' : 'Failed to save plan')
    }
  }

  const restorePlan = (plan: HistoryPlan) => {
    suppressContainerChangeNoticeRef.current = true
    setProjectName(plan.projectName || defaultProjectName(locale))
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
    setPlacementSettings((current) => ({ ...current, defaultMaxStackLayers: plan.defaultMaxStackLayers }))
    showCalculatedPlacement(calculatePacking(plan.container, normalizeCargoLabelColors(plan.cargoItems), {
      loadingMode: plan.loadingMode || 'quantity',
      defaultMaxStackLayers: plan.defaultMaxStackLayers,
    }))
    setActiveLayerId('all')
    setActiveLabelId('all')
    setSelectedBoxId(null)
    setActiveResultTab('layers')
    setActiveNav('overview')
  }

  const deleteCargo = (cargoId: string) => {
    setCargoItems((items) => items.filter((item) => item.id !== cargoId))
    markPlacementDirty()
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
    markPlacementDirty()
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

  const cargoLibraryPanel = (
    <div className="rounded-lg border border-[#c6c6c6] bg-white p-4" data-testid="cargo-library">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-lg font-bold">{t.cargoLibrary}</h3>
        {cargoLibraryNotice && <span className="text-xs font-semibold text-[#047857]">{cargoLibraryNotice}</span>}
      </div>
      <form className="grid gap-2 text-sm md:grid-cols-6" onSubmit={saveLibraryCargo}>
        <label>{t.name}<input className="field-input mt-1" value={cargoLibraryForm.name} onChange={(event) => setCargoLibraryForm((current) => ({ ...current, name: event.target.value }))} /></label>
        <label>{t.group}<input className="field-input mt-1" value={cargoLibraryForm.label ?? ''} onChange={(event) => setCargoLibraryForm((current) => ({ ...current, label: event.target.value.toUpperCase().slice(0, 2) }))} /></label>
        <label>{t.length}<input className="field-input mt-1" type="number" value={cargoLibraryForm.length} onChange={(event) => updateLibraryNumber('length', event.target.value)} /></label>
        <label>{t.width}<input className="field-input mt-1" type="number" value={cargoLibraryForm.width} onChange={(event) => updateLibraryNumber('width', event.target.value)} /></label>
        <label>{t.height}<input className="field-input mt-1" type="number" value={cargoLibraryForm.height} onChange={(event) => updateLibraryNumber('height', event.target.value)} /></label>
        <label>{t.weight}<input className="field-input mt-1" type="number" value={cargoLibraryForm.weight} onChange={(event) => updateLibraryNumber('weight', event.target.value)} /></label>
        <label>{t.color}<input className="mt-1 h-10 w-full border border-[#aaa] bg-white" type="color" value={cargoLibraryForm.color} onChange={(event) => setCargoLibraryForm((current) => ({ ...current, color: event.target.value }))} /></label>
        <label className="flex items-center gap-2 pt-7"><input checked={cargoLibraryForm.canRotate} type="checkbox" onChange={(event) => setCargoLibraryForm((current) => ({ ...current, canRotate: event.target.checked }))} />{t.rotate}</label>
        <label className="flex items-center gap-2 pt-7"><input checked={cargoLibraryForm.stackable} type="checkbox" onChange={(event) => setCargoLibraryForm((current) => ({ ...current, stackable: event.target.checked, maxStackLayers: event.target.checked ? current.maxStackLayers : undefined }))} />{t.stackable}</label>
        <label className="flex items-center gap-2 pt-7"><input checked={cargoLibraryForm.groundOnly ?? false} type="checkbox" onChange={(event) => setCargoLibraryForm((current) => ({ ...current, groundOnly: event.target.checked }))} />{t.groundOnly}</label>
        {cargoLibraryForm.stackable && (
          <label>{t.maxStackLayers}<input className="field-input mt-1" min={1} type="number" value={cargoLibraryForm.maxStackLayers ?? ''} onChange={(event) => updateLibraryMaxStackLayers(event.target.value)} /></label>
        )}
        <div className="flex items-end gap-2 md:col-span-2">
          <button className="archive-button success w-full" data-testid="cargo-library-add" type="submit">
            {editingLibraryCargoId ? t.cargoLibraryUpdate : t.cargoLibrarySave}
          </button>
          {editingLibraryCargoId && (
            <button className="archive-button secondary" type="button" onClick={() => { setEditingLibraryCargoId(null); setCargoLibraryForm(emptyForm) }}>
              {t.cancel}
            </button>
          )}
        </div>
      </form>
      {customCargoItems.length === 0 ? (
        <p className="mt-3 text-sm text-[#64748b]">{t.cargoLibraryEmpty}</p>
      ) : (
        <div className="mt-4 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
          {customCargoItems.map((item) => (
            <article className="rounded border border-[#d1d5db] bg-[#f8fafc] p-3 text-sm" data-testid={`cargo-library-row-${item.id}`} key={item.id}>
              <div className="mb-2 flex items-start gap-2">
                <span className="inline-flex h-8 w-8 items-center justify-center rounded font-bold text-white" style={{ backgroundColor: item.color }}>{item.label}</span>
                <div>
                  <strong>{item.name}</strong>
                  <p className="text-xs text-[#64748b]">{item.length} x {item.width} x {item.height} mm · {item.weight} kg</p>
                  <p className="text-xs text-[#64748b]">{item.canRotate ? t.rotate : `${t.rotate}: off`} · {item.stackable ? t.stackable : `${t.stackable}: off`}{item.maxStackLayers ? ` · ${t.maxStackLayers}: ${item.maxStackLayers}` : ''}{item.groundOnly ? ` · ${t.groundOnly}` : ''}</p>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <button className="archive-button px-2 py-1 text-xs" data-testid={`cargo-library-use-${item.id}`} type="button" onClick={() => addLibraryCargoToWorkbench(item)}>{t.cargoLibraryUse}</button>
                <button className="archive-button secondary px-2 py-1 text-xs" data-testid={`cargo-library-edit-${item.id}`} type="button" onClick={() => editLibraryCargo(item)}>{t.cargoLibraryEdit}</button>
                <button className="archive-button px-2 py-1 text-xs text-red-700" data-testid={`cargo-library-delete-${item.id}`} type="button" onClick={() => void removeLibraryCargo(item.id)}>{t.cargoLibraryDelete}</button>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  )

  const templateManagerPanel = (
    <div className="rounded-lg border border-[#c6c6c6] bg-white p-4" data-testid="template-manager-list">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-lg font-bold">{t.templateManager}</h3>
        <div className="flex flex-wrap items-center gap-2">
          {templateSaveNotice && <span className="text-xs font-semibold text-[#047857]">{templateSaveNotice}</span>}
          <label className="archive-button secondary cursor-pointer px-3 py-1.5 text-xs">
            {t.templateLoadSample}
            <input
              className="hidden"
              type="file"
              accept=".xlsx,.xls,.csv"
              data-testid="template-manager-sample-input"
              onChange={(event) => { void loadTemplateSampleHeaders(event.target.files?.[0] ?? null); event.target.value = '' }}
            />
          </label>
          <button
            className="archive-button success px-3 py-1.5 text-xs"
            data-testid="template-manager-new"
            type="button"
            onClick={() => setNewImportTemplateDraft(createBlankImportTemplateDraft())}
          >
            {t.templateNew}
          </button>
        </div>
      </div>
      {templateSampleRows.length > 0 && (
        <p className="mb-3 text-xs font-semibold text-[#047857]" data-testid="template-manager-sample-status">
          {t.templateSampleLoaded}: {importColumnsForHeaderRow(templateSampleRows, 1).length}
        </p>
      )}
      {newImportTemplateDraft && (
        <div className="mb-4 grid gap-2 rounded border border-[#93c5fd] bg-[#eff6ff] p-3 text-sm" data-testid="template-manager-new-form">
          <label className="text-xs font-semibold text-[#475569]">
            {t.templateName}
            <input
              className="field-input mt-1"
              data-testid="template-manager-new-name"
              value={newImportTemplateDraft.name}
              onChange={(event) => setNewImportTemplateDraft((current) => current ? { ...current, name: event.target.value } : current)}
            />
          </label>
          <ImportMappingForm
            value={draftToMappingValue(newImportTemplateDraft)}
            onChange={(next) => setNewImportTemplateDraft((current) => current ? applyMappingValueToDraft(current, next) : current)}
            availableColumns={importColumnsForHeaderRow(templateSampleRows, newImportTemplateDraft.headerRow ?? 1)}
            labels={t}
            testIdPrefix="tm-new-"
          />
          <div className="flex flex-wrap gap-2">
            <button className="archive-button success px-2 py-1 text-xs" data-testid="template-manager-new-save" type="button" onClick={() => void saveNewImportTemplate()} disabled={!newImportTemplateDraft.name.trim()}>{t.templateCreate}</button>
            <button className="archive-button secondary px-2 py-1 text-xs" type="button" onClick={() => setNewImportTemplateDraft(null)}>{t.cancel}</button>
          </div>
        </div>
      )}
      {importTemplates.length === 0 ? (
        <p className="text-sm text-[#64748b]">{t.templateEmpty}</p>
      ) : (
        <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
          {importTemplates.map((template) => (
            <article className="rounded border border-[#d1d5db] bg-[#f8fafc] p-3 text-sm" data-testid={`template-manager-row-${template.id}`} key={template.id}>
              {editingImportTemplateId === template.id && editingImportTemplateDraft ? (
                <div className="grid gap-2">
                  <label className="text-xs font-semibold text-[#475569]">
                    {t.templateName}
                    <input
                      className="field-input mt-1"
                      data-testid={`template-manager-name-${template.id}`}
                      value={editingImportTemplateDraft.name}
                      onChange={(event) => setEditingImportTemplateDraft((current) => current ? { ...current, name: event.target.value } : current)}
                    />
                  </label>
                  <ImportMappingForm
                    value={draftToMappingValue(editingImportTemplateDraft)}
                    onChange={(next) => setEditingImportTemplateDraft((current) => current ? applyMappingValueToDraft(current, next) : current)}
                    availableColumns={importColumnsForHeaderRow(templateSampleRows, editingImportTemplateDraft.headerRow ?? 1)}
                    labels={t}
                    testIdPrefix={`tm-edit-${template.id}-`}
                  />
                  <div className="flex flex-wrap gap-2">
                    <button className="archive-button success px-2 py-1 text-xs" data-testid={`template-manager-save-${template.id}`} type="button" onClick={() => void saveEditedImportTemplate()}>{t.templateUpdate}</button>
                    <button className="archive-button secondary px-2 py-1 text-xs" type="button" onClick={() => { setEditingImportTemplateId(''); setEditingImportTemplateDraft(null) }}>{t.cancel}</button>
                  </div>
                </div>
              ) : (
                <>
                  <strong>{template.name}</strong>
                  <p className="mt-1 text-xs text-[#64748b]">
                    {t.templateHeaderRow}: {template.headerRow ?? 1} · {t.templateStartRow}: {template.startRow ?? 2} · {t.templateDimensionMode}: {template.dimensionMode ?? 'separate'}
                  </p>
                  <p className="mt-1 truncate text-xs text-[#64748b]">
                    {Object.entries(template.mapping).filter(([, value]) => value).map(([key, value]) => `${key}:${value}`).join(', ') || '-'}
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button className="archive-button secondary px-2 py-1 text-xs" data-testid={`template-manager-edit-${template.id}`} type="button" onClick={() => editImportTemplate(template)}>{t.templateEdit}</button>
                    <button className="archive-button px-2 py-1 text-xs text-red-700" data-testid={`template-manager-delete-${template.id}`} type="button" onClick={() => void removeImportTemplate(template.id)}>{t.templateDelete}</button>
                  </div>
                </>
              )}
            </article>
          ))}
        </div>
      )}
    </div>
  )

  const exportTemplateManagerPanel = (
    <div className="mt-4 rounded-lg border border-[#c6c6c6] bg-white p-4" data-testid="export-template-list">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-lg font-bold">{t.exportTemplateManager}</h3>
        <button
          className="archive-button success px-3 py-1.5 text-xs"
          data-testid="export-template-new"
          type="button"
          onClick={() => setNewExportTemplateDraft(createBlankExportTemplate())}
        >
          {t.templateNew}
        </button>
      </div>
      {newExportTemplateDraft && (
        <div className="mb-4 grid gap-2 rounded border border-[#93c5fd] bg-[#eff6ff] p-3 text-sm" data-testid="export-template-new-form">
          <label className="text-xs font-semibold text-[#475569]">
            {t.templateName}
            <input
              className="field-input mt-1"
              data-testid="export-template-new-name"
              value={newExportTemplateDraft.name}
              onChange={(event) => setNewExportTemplateDraft((current) => current ? { ...current, name: event.target.value } : current)}
            />
          </label>
          <ExportColumnsEditor
            columns={newExportTemplateDraft.columns}
            onChange={(columns) => setNewExportTemplateDraft((current) => current ? { ...current, columns } : current)}
            labels={t}
            testIdPrefix="ex-new-"
          />
          <div className="flex flex-wrap gap-2">
            <button className="archive-button success px-2 py-1 text-xs" data-testid="export-template-new-save" type="button" onClick={() => void saveNewExportTemplate()} disabled={!newExportTemplateDraft.name.trim()}>{t.templateCreate}</button>
            <button className="archive-button secondary px-2 py-1 text-xs" type="button" onClick={() => setNewExportTemplateDraft(null)}>{t.cancel}</button>
          </div>
        </div>
      )}
      {exportTemplates.length === 0 ? (
        <p className="text-sm text-[#64748b]">{t.exportTemplateEmpty}</p>
      ) : (
        <div className="grid gap-2 md:grid-cols-2">
          {exportTemplates.map((template) => (
            <article className="rounded border border-[#d1d5db] bg-[#f8fafc] p-3 text-sm" data-testid={`export-template-row-${template.id}`} key={template.id}>
              {editingExportTemplateId === template.id && editingExportTemplateDraft ? (
                <div className="grid gap-2">
                  <label className="text-xs font-semibold text-[#475569]">
                    {t.templateName}
                    <input
                      className="field-input mt-1"
                      data-testid={`export-template-name-${template.id}`}
                      value={editingExportTemplateDraft.name}
                      onChange={(event) => setEditingExportTemplateDraft((current) => current ? { ...current, name: event.target.value } : current)}
                    />
                  </label>
                  <ExportColumnsEditor
                    columns={editingExportTemplateDraft.columns}
                    onChange={(columns) => setEditingExportTemplateDraft((current) => current ? { ...current, columns } : current)}
                    labels={t}
                    testIdPrefix={`ex-edit-${template.id}-`}
                  />
                  <div className="flex flex-wrap gap-2">
                    <button className="archive-button success px-2 py-1 text-xs" data-testid={`export-template-save-${template.id}`} type="button" onClick={() => void saveEditedExportTemplate()}>{t.templateUpdate}</button>
                    <button className="archive-button secondary px-2 py-1 text-xs" type="button" onClick={() => { setEditingExportTemplateId(''); setEditingExportTemplateDraft(null) }}>{t.cancel}</button>
                  </div>
                </div>
              ) : (
                <>
                  <strong>{template.name}</strong>
                  <p className="mt-1 truncate text-xs text-[#64748b]">
                    {template.columns.map((col) => col.header || col.field).join(', ') || '-'}
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button className="archive-button secondary px-2 py-1 text-xs" data-testid={`export-template-edit-${template.id}`} type="button" onClick={() => editExportTemplate(template)}>{t.templateEdit}</button>
                    <button className="archive-button px-2 py-1 text-xs text-red-700" data-testid={`export-template-delete-${template.id}`} type="button" onClick={() => void removeExportTemplate(template.id)}>{t.templateDelete}</button>
                  </div>
                </>
              )}
            </article>
          ))}
        </div>
      )}
    </div>
  )

  return (
    <main className="min-h-screen bg-[#f4f7fb] text-[#1f2937]">
      <div className="mx-auto p-5 max-w-[1500px] xl:max-w-[1800px] 2xl:max-w-none 2xl:px-8">
        <header className={`mb-5 rounded-2xl bg-gradient-to-br from-[#2563eb] to-[#7c3aed] p-6 text-white ${workspaceMaximized ? 'hidden' : ''}`}>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h1 className="m-0 text-[30px] font-bold">{t.title}</h1>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-sm">
              {navItems.map((item) => (
                <button
                  className={`rounded-[10px] px-4 py-2 font-bold ${activeNav === item.target ? 'bg-white text-[#1d4ed8]' : 'bg-white/20 text-white hover:bg-white/30'}`}
                  key={item.target}
                  type="button"
                  data-testid={`nav-${item.target}`}
                  onClick={() => activateNav(item.target)}
                >
                  {item.label}
                </button>
              ))}
              {currentUser && (
                <div className="flex items-center gap-2 rounded-[10px] bg-white/10 px-3 py-1.5 border border-white/20 ml-2">
                  <span className="opacity-80 text-xs">{locale === 'zh' ? '用户' : 'User'}:</span>
                  <span className="font-bold text-xs">{currentUser.username}</span>
                  {currentUser.role === 'admin' && (
                    <button
                      onClick={() => activateNav('users')}
                      data-testid="user-management-shortcut"
                      className="rounded-[6px] bg-indigo-600 hover:bg-indigo-700 px-2 py-1 text-[11px] font-bold text-white transition-colors cursor-pointer animate-pulse"
                      type="button"
                    >
                      {locale === 'zh' ? '用户管理' : 'Users'}
                    </button>
                  )}
                  <button
                    onClick={onLogout}
                    className="rounded-[6px] bg-red-600 hover:bg-red-700 px-2 py-1 text-[11px] font-bold text-white transition-colors cursor-pointer"
                    type="button"
                  >
                    {locale === 'zh' ? '退出' : 'Logout'}
                  </button>
                </div>
              )}
              <ReleaseNotesButton locale={locale} userId={currentUser?.id ?? null} />
              <button className="rounded-[10px] bg-white px-4 py-2 font-bold text-[#1d4ed8]" type="button" onClick={() => setLocale(locale === 'en' ? 'zh' : 'en')}>
                {t.language}
              </button>
            </div>
          </div>
        </header>

        {activeNav === 'users' && currentUser?.role === 'admin' ? (
          <section className="archive-card overflow-hidden p-[18px]" data-testid="users-page">
            <UserManagement onBack={() => activateNav('overview')} />
          </section>
        ) : activeNav === 'history' ? (
          <section className="archive-card overflow-hidden p-[18px]" data-testid="history-page">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-xl font-bold">{t.historyPage}</h2>
                <p className="text-sm text-[#64748b]">
                  {historyLoadFailed ? (locale === 'zh' ? '历史方案加载失败' : 'Failed to load history plans') : t.noHistory}
                </p>
              </div>
              <div className="flex gap-2">
                <button className="archive-button success" type="button" onClick={saveCurrentPlan}>{t.savePlan}</button>
                <button className="archive-button secondary" type="button" onClick={() => activateNav('overview')}>{t.backToWorkbench}</button>
              </div>
            </div>
            {historyLoadFailed ? (
              <div className="flex items-center justify-between gap-3 border border-red-300 bg-red-50 p-3 text-red-700" data-testid="history-load-error">
                <span>{locale === 'zh' ? '历史方案加载失败' : 'Failed to load history plans'}</span>
                <button className="archive-button secondary" type="button" onClick={() => void fetchHistory()}>
                  {locale === 'zh' ? '重试' : 'Retry'}
                </button>
              </div>
            ) : historyPlans.length === 0 ? (
              <p className="border border-[#c6c6c6] bg-white p-3" data-testid="history-empty-state">{t.noHistory}</p>
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
        ) : activeNav === 'cargo-library' ? (
          <section className="archive-card overflow-hidden p-[18px]" data-testid="cargo-library-page">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-xl font-bold">{t.cargoLibrary}</h2>
              <button className="archive-button secondary" type="button" onClick={() => activateNav('overview')}>{t.backToWorkbench}</button>
            </div>
            {cargoLibraryPanel}
          </section>
        ) : activeNav === 'template-manager' ? (
          <section className="archive-card overflow-hidden p-[18px]" data-testid="template-manager-page">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-xl font-bold">{t.templateManager}</h2>
              <button className="archive-button secondary" type="button" onClick={() => activateNav('overview')}>{t.backToWorkbench}</button>
            </div>
            {templateManagerPanel}
            {exportTemplateManagerPanel}
          </section>
        ) : (
        <section className={sidebarCollapsed ? "flex gap-5 max-lg:flex-col" : "flex gap-5 max-lg:flex-col"} data-testid="workbench-layout">
          <aside className={`${sidebarCollapsed ? "w-[32px] shrink-0 overflow-hidden flex flex-col items-center" : "w-[340px] lg:w-[360px] shrink-0 space-y-4 max-lg:w-full"} ${workspaceMaximized ? 'hidden' : ''}`}>
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
              <button className="archive-button secondary text-left" type="button" onClick={() => activateNav('cargo-library')}>{t.nav[2]}</button>
              <button className="archive-button secondary text-left" type="button" onClick={() => activateNav('template-manager')}>{t.nav[3]}</button>
              {currentUser?.role === 'admin' && (
                <button className="archive-button secondary text-left" type="button" onClick={() => activateNav('users')}>{t.nav[4]}</button>
              )}
              <button
                className="archive-button secondary text-left"
                type="button"
                aria-expanded={placementSettingsOpen}
                data-testid="placement-settings-toggle"
                onClick={() => {
                  setPlacementSettingsOpen((open) => !open)
                  setSnapSettingsOpen(false)
                }}
              >
                {placementSettingsOpen ? t.placementSettingsClose : t.placementSettings}
              </button>
              {placementSettingsOpen && (
                <div className="border border-[#cbd5e1] bg-white px-3 py-2 text-xs text-[#334155] shadow-sm" data-testid="placement-settings-panel">
                  <div className="grid gap-3">
                    <label className="flex items-center gap-2 font-semibold">
                      <input
                        type="checkbox"
                        checked={placementSettings.supportPolicy.allowPartialOverhang}
                        onChange={(event) => setPlacementSettings((s) => ({
                          ...s,
                          supportPolicy: {
                            ...s.supportPolicy,
                            allowPartialOverhang: event.target.checked,
                            supportMode: event.target.checked ? 'field-review' : 'strict',
                          },
                        }))}
                      />
                      {t.allowOverhang}
                    </label>
                    <span className="text-[#64748b]">{t.settingsStored}</span>
                    <label className="flex flex-col gap-1">
                      <span className="font-semibold">{t.minSupport}</span>
                      <input
                        className="rounded border border-[#cbd5e1] px-2 py-1"
                        type="number"
                        min={0}
                        max={100}
                        value={Math.round(placementSettings.supportPolicy.minSupportRatio * 100)}
                        onChange={(event) => {
                          const next = Math.max(0, Math.min(100, Number(event.target.value))) / 100
                          setPlacementSettings((s) => ({
                            ...s,
                            supportPolicy: {
                              ...s.supportPolicy,
                              minSupportRatio: next,
                              warningSupportRatio: Math.max(next, s.supportPolicy.warningSupportRatio),
                            },
                          }))
                        }}
                      />
                    </label>
                    <label className="flex flex-col gap-1">
                      <span className="font-semibold">{t.warnSupport}</span>
                      <input
                        className="rounded border border-[#cbd5e1] px-2 py-1"
                        type="number"
                        min={0}
                        max={100}
                        value={Math.round(placementSettings.supportPolicy.warningSupportRatio * 100)}
                        onChange={(event) => {
                          const next = Math.max(0, Math.min(100, Number(event.target.value))) / 100
                          setPlacementSettings((s) => ({
                            ...s,
                            supportPolicy: {
                              ...s.supportPolicy,
                              warningSupportRatio: Math.max(s.supportPolicy.minSupportRatio, next),
                            },
                          }))
                        }}
                      />
                    </label>
                    <button
                      className="archive-button"
                      type="button"
                      onClick={() => setPlacementSettings((current) => ({
                        ...DEFAULT_PLACEMENT_SETTINGS,
                        defaultMaxStackLayers: current.defaultMaxStackLayers,
                      }))}
                    >
                      {t.resetPlacementSettings}
                    </button>
                  </div>
                </div>
              )}
              <button
                className="archive-button secondary text-left"
                type="button"
                aria-expanded={snapSettingsOpen}
                data-testid="snap-settings-toggle"
                onClick={() => {
                  setSnapSettingsOpen((open) => !open)
                  setPlacementSettingsOpen(false)
                }}
              >
                {snapSettingsOpen ? t.snapSettingsClose : t.snapSettings}
              </button>
              {snapSettingsOpen && (
                <div className="border border-[#cbd5e1] bg-white px-3 py-2 text-xs text-[#334155] shadow-sm" data-testid="snap-settings-panel">
                  <div className="grid gap-3">
                    <label className="flex items-center gap-2 font-semibold">
                      <input
                        type="checkbox"
                        checked={placementSettings.snapEnabled}
                        data-testid="toggle-snap"
                        onChange={(event) => setPlacementSettings((s) => ({ ...s, snapEnabled: event.target.checked }))}
                      />
                      {placementSettings.snapEnabled ? t.snapEnabled : t.snapDisabled}
                    </label>
                    <label className="flex items-center gap-2 font-semibold">
                      <input
                        type="checkbox"
                        checked={placementSettings.gridSnapEnabled}
                        data-testid="toggle-grid-snap"
                        onChange={(event) => setPlacementSettings((s) => ({ ...s, gridSnapEnabled: event.target.checked }))}
                      />
                      {placementSettings.gridSnapEnabled ? t.gridSnap : t.gridSnapOff}
                    </label>
                    <label className="flex items-center gap-2 font-semibold">
                      <input
                        type="checkbox"
                        checked={placementSettings.edgeSnapEnabled}
                        data-testid="toggle-edge-snap"
                        onChange={(event) => setPlacementSettings((s) => ({ ...s, edgeSnapEnabled: event.target.checked }))}
                      />
                      {placementSettings.edgeSnapEnabled ? t.edgeSnap : t.edgeSnapOff}
                    </label>
                    <label className="flex items-center gap-2 font-semibold">
                      <input
                        type="checkbox"
                        checked={placementSettings.surfaceSnapEnabled}
                        onChange={(event) => setPlacementSettings((s) => ({ ...s, surfaceSnapEnabled: event.target.checked }))}
                      />
                      {t.surfaceSnap}
                    </label>
                    <label className="flex items-center gap-2 font-semibold">
                      <input
                        type="checkbox"
                        checked={placementSettings.zSnapEnabled}
                        onChange={(event) => setPlacementSettings((s) => ({ ...s, zSnapEnabled: event.target.checked }))}
                      />
                      {t.zSnap}
                    </label>
                    <span className="text-[#64748b]">{t.settingsStored}</span>
                    {[
                      ['gridStepMm', t.gridStep, 1, 1000],
                      ['edgeToleranceMm', t.edgeTolerance, 0, 1000],
                      ['zStepMm', t.zStep, 1, 1000],
                    ].map(([key, label, min, max]) => (
                      <label key={String(key)} className="flex flex-col gap-1">
                        <span className="font-semibold">{label} (mm)</span>
                        <input
                          className="rounded border border-[#cbd5e1] px-2 py-1"
                          type="number"
                          min={Number(min)}
                          max={Number(max)}
                          value={Number(placementSettings[key as keyof Pick<PlacementSettings, 'gridStepMm' | 'edgeToleranceMm' | 'zStepMm'>])}
                          onChange={(event) => {
                            const value = Number(event.target.value)
                            if (!Number.isFinite(value)) return
                            setPlacementSettings((s) => ({ ...s, [key]: value }))
                          }}
                        />
                      </label>
                    ))}
                  </div>
                </div>
              )}
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
              <label className="flex items-center gap-2"><input checked={form.stackable} type="checkbox" onChange={(event) => setForm((current) => ({ ...current, stackable: event.target.checked, maxStackLayers: event.target.checked ? current.maxStackLayers : undefined }))} />{t.stackable}</label>
              <label className="flex items-center gap-2"><input checked={form.groundOnly ?? false} type="checkbox" onChange={(event) => setForm((current) => ({ ...current, groundOnly: event.target.checked }))} />{t.groundOnly}</label>
            </div>
            {form.stackable && (
              <label className="field-label" data-testid="max-stack-layers-field">
                {t.maxStackLayers}
                <input
                  className="field-input mt-1"
                  type="number"
                  min={1}
                  value={form.maxStackLayers ?? ''}
                  onChange={(event) => updateMaxStackLayers(event.target.value)}
                />
              </label>
            )}
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
                  <select aria-label={t.ruleSummary} className="field-input mt-1" value={loadingMode} onChange={(event) => {
                    setLoadingMode(event.target.value as LoadingMode)
                    markPlacementDirty()
                  }}>
                    <option value="volume">{t.volumeMode}</option>
                    <option value="weight">{t.weightMode}</option>
                    <option value="quantity">{t.quantityMode}</option>
                    <option value="input">{t.inputMode}</option>
                  </select>
                </label>
                <label className="field-label mt-3" data-testid="global-max-stack-layers-field">
                  {t.globalMaxStackLayers}
                  <input
                    className="field-input mt-1"
                    type="number"
                    min={1}
                    value={defaultMaxStackLayers ?? ''}
                    onChange={(event) => updateDefaultMaxStackLayers(event.target.value)}
                  />
                </label>
                <div className="mt-3 grid gap-2">
                  <div className="rounded-xl border border-[#e5e7eb] bg-[#f8fafc] px-3 py-2"><strong>{t.hardRules}</strong>: {t.boundaryRule}</div>
                  <div className="rounded-xl border border-[#e5e7eb] bg-[#f8fafc] px-3 py-2"><strong>{t.hardRules}</strong>: {t.payloadRule}</div>
                  <div className="rounded-xl border border-[#e5e7eb] bg-[#f8fafc] px-3 py-2">
                    <strong>{t.hardRules}</strong>: {t.supportRule}
                    <br />
                    <span className="text-[#64748b]">
                      {t.globalMaxStackLayers}: {defaultMaxStackLayers ?? t.maxStackLayersUnlimited}
                    </span>
                  </div>
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
                  {item.groundOnly && (
                    <p className="mt-1 text-xs text-[#64748b]">{t.groundOnly}</p>
                  )}
                  <p className="mt-1 text-xs text-[#64748b]">
                    {t.maxStackLayers}: {item.maxStackLayers
                      ? `${item.maxStackLayers} (${t.maxStackLayersOwn})`
                      : defaultMaxStackLayers
                        ? `${defaultMaxStackLayers} (${t.maxStackLayersGlobal})`
                        : t.maxStackLayersUnlimited}
                  </p>
                </div>
              ))}
            </div>
          </div>
          </div>
          )}
        </aside>

        <section className="flex-1 min-w-0 space-y-4" ref={workspaceRef}>
          <div className={`grid grid-cols-5 gap-3 max-xl:grid-cols-2 ${workspaceMaximized ? 'hidden' : ''}`} data-testid="archive-stat-grid">
            <div className="archive-stat"><div className="archive-stat-value">{result.placedCount}</div><div className="archive-stat-key">{t.loaded}</div></div>
            <div className="archive-stat"><div className="archive-stat-value">{Math.round(result.usedWeight)}</div><div className="archive-stat-key">{t.weight}</div></div>
            <div className="archive-stat"><div className="archive-stat-value">{result.weightUtilization.toFixed(1)}%</div><div className="archive-stat-key">{t.weightUse}</div></div>
            <div className="archive-stat"><div className="archive-stat-value">{result.volumeUtilization.toFixed(1)}%</div><div className="archive-stat-key">{t.volumeUse}</div><div className="text-xs text-[#64748b]">{formatCubicMeters(result.usedVolume)}{' / '}{formatCubicMeters(result.containerVolume)}</div></div>
          </div>

          <section
            className="archive-card overflow-hidden"
            data-testid="visual-workspace"
            data-workspace-maximized={workspaceMaximized ? 'true' : 'false'}
          >
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
                  <button className={`archive-tab ${sceneViewMode === view.id ? 'active' : ''}`} key={view.id} type="button" onClick={() => selectSceneView(view.id)}>
                    {view.label}
                  </button>
                ))}
                <button
                  className="archive-tab inline-flex items-center gap-2"
                  type="button"
                  aria-label={t.resetView}
                  data-testid="reset-view"
                  onClick={resetSceneView}
                >
                  <svg aria-hidden="true" className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2">
                    <path d="M3 12a9 9 0 0 1 15.3-6.4L21 8" />
                    <path d="M21 3v5h-5" />
                    <path d="M21 12a9 9 0 0 1-15.3 6.4L3 16" />
                    <path d="M3 21v-5h5" />
                  </svg>
                  {t.resetView}
                </button>
              </>
            )}
            <button
              className={`archive-tab inline-flex items-center gap-2 ${clearanceEnabled ? 'active' : ''}`}
              type="button"
              aria-pressed={clearanceEnabled}
              data-testid="toggle-clearance"
              onClick={() => setClearanceEnabled((enabled) => !enabled)}
            >
              <svg aria-hidden="true" className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2">
                <path d="M4 17 17 4l3 3L7 20z" />
                <path d="m14 7 3 3" />
                <path d="m11 10 2 2" />
                <path d="m8 13 3 3" />
              </svg>
              {t.clearanceTitle}
            </button>
            <button className="archive-button success" type="button" onClick={exportCurrentView}>
              {t.exportView}
            </button>
            </div>
            <div
              className={`relative w-full bg-gradient-to-b from-[#eef6ff] to-[#f8fafc] ${
                workspaceView === '3d'
                  ? 'min-h-[480px] xl:min-h-[640px] 2xl:min-h-[760px] h-[70vh] xl:h-[78vh]'
                  : 'aspect-[16/9] min-h-[420px] max-h-[85vh] xl:min-h-[560px]'
              }`}
              data-testid="visual-workspace-canvas"
            >
              {(containerChangeNotice || customContainerLoadFailed) && (
                <div className="absolute left-6 top-6 z-10 rounded-xl border border-[#facc15] bg-[#fefce8] px-4 py-3 text-sm font-semibold text-[#854d0e]" data-testid="container-change-notice">
                  {customContainerLoadFailed
                    ? (locale === 'zh' ? '柜型加载失败' : 'Container load failed')
                    : containerChangeNotice}
                </div>
              )}
              {placementMode === 'manual' ? (
                <div className="flex h-full w-full flex-col gap-3 p-4" data-testid="manual-workspace" data-workspace-maximized={workspaceMaximized ? 'true' : 'false'}>
                  {manualNotice && (
                    <div
                      className="rounded-xl border border-[#fbbf24] bg-[#fffbeb] p-3 text-xs font-semibold text-[#92400e]"
                      data-testid="manual-operation-notice"
                    >
                      <button
                        className="float-right text-base font-bold leading-none"
                        type="button"
                        aria-label={t.dismissNotice}
                        onClick={() => setManualNotice(null)}
                      >×</button>
                      {manualNotice.message}
                    </div>
                  )}
                  {rotationNotice && (
                    <div
                      className="rounded-xl border border-[#fbbf24] bg-[#fffbeb] p-3 text-xs font-semibold text-[#92400e]"
                      data-testid="rotation-notice"
                    >
                      <button
                        className="float-right text-base font-bold leading-none"
                        type="button"
                        aria-label={t.dismissNotice}
                        onClick={() => setRotationNotice('')}
                      >×</button>
                      {rotationNotice}
                    </div>
                  )}
                  {manualIssues.length > 0 && (
                    <div
                      className="rounded-xl border border-[#fecaca] bg-[#fef2f2] p-3 text-xs text-[#991b1b]"
                      data-testid="manual-issues"
                    >
                      <div className="mb-1 font-semibold">{t.manualIssues} ({manualIssues.length})</div>
                      <ul className="list-inside list-disc space-y-0.5">
                        {manualIssues.slice(0, 10).map((issue, index) => (
                          <li key={`${issue.boxId}-${issue.type}-${index}`}>{localizeManualIssue(issue, t)}</li>
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
                            data-remaining={entry.remaining}
                            onDragStart={(event) => handleManualPoolDragStart(event, entry.cargoId)}
                            onDragEnd={handleManualPoolDragEnd}
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
                            <div className="flex items-center gap-2">
                              <span className="min-w-0 flex-1 text-[#64748b]">{entry.length} x {entry.width} x {entry.height} mm</span>
                              <button
                                className="inline-grid h-7 w-7 shrink-0 place-items-center rounded border border-[#cbd5e1] bg-[#f8fafc] text-sm font-bold text-[#0f172a] hover:bg-[#e0f2fe] disabled:cursor-not-allowed disabled:opacity-40"
                                type="button"
                                aria-label={t.quickPlace}
                                title={t.quickPlace}
                                data-testid={`pool-quick-place-${entry.cargoId}`}
                                disabled={entry.remaining <= 0}
                                onClick={(event) => {
                                  event.stopPropagation()
                                  handleQuickPlaceCargo(entry.cargoId)
                                }}
                              >
                                →
                              </button>
                            </div>
                          </div>
                        ))
                      )}
                    </aside>
                    <div className="relative flex-1 overflow-hidden rounded-xl border border-[#e5e7eb] bg-white" data-testid="manual-view-container">
                      <button
                        className={`archive-tab absolute right-3 top-3 z-30 inline-flex items-center gap-2 bg-white/95 shadow-lg ${workspaceMaximized ? 'active' : ''}`}
                        type="button"
                        data-testid="maximize-workspace"
                        aria-pressed={workspaceMaximized}
                        onClick={() => setWorkspaceMaximized((current) => !current)}
                      >
                        {workspaceMaximized ? t.restoreManual : t.maximizeManual}
                      </button>
                      <div className="absolute left-3 top-3 z-30">
                        <button
                          className="archive-tab bg-white/95 shadow-lg"
                          type="button"
                          aria-expanded={manualHelpOpen}
                          data-testid="manual-keyboard-help"
                          onClick={() => setManualHelpOpen((current) => !current)}
                        >
                          {t.manualKeyboardHelp}
                        </button>
                        {manualHelpOpen && (
                          <div
                            className="mt-2 w-72 rounded-lg border border-[#cbd5e1] bg-white p-3 text-xs text-[#334155] shadow-xl"
                            data-testid="manual-keyboard-help-popover"
                          >
                            <ul className="list-inside list-disc space-y-1">
                              {t.manualKeyboardHelpItems.map((item) => (
                                <li key={item}>{item}</li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>
                      {workspaceView === '3d' ? (
                        <ContainerScene
                          activeLabelId={'all'}
                          activeLayerId={'all'}
                          boxes={visibleManualBoxes}
                          container={renderingContainer}
                          gridSnap={gridSnap}
                          edgeSnap={edgeSnap}
                          placementSettings={placementSettings}
                          invalidBoxIds={manualInvalidBoxIds}
                          manualEditable
                          poolDragInfo={poolDragInfo}
                          highlightBoxIds={loadingStepsActive ? activeLoadingGroupBoxIds : undefined}
                          resetViewTick={resetViewTick}
                          selectedBoxId={manualSelectedId}
                          selectedManualBoxId={manualSelectedId}
                          viewMode={sceneViewMode}
                          onClearSelection={() => setManualSelectedId(null)}
                          onHoverBox={setHoverInfo}
                          onManualDelete={handleManualDeleteBox}
                          onManualDropFromPool={handleManualDropFromPool}
                          onManualMove={handleManualMoveBox}
                          onManualOperationRejected={(operation, boxId, cargoId) => notifyManualRejected(operation, boxId, cargoId)}
                          onManualRotate={handleManualRotateBox}
                          clearanceEnabled={clearanceEnabled}
                          clearanceAnnotations={clearanceAnnotations}
                          onSelectBox={setManualSelectedId}
                        />
                      ) : (
                        <ManualPlacement2D
                          container={renderingContainer}
                          draft={manualDraft}
                          selectedBoxId={manualSelectedId}
                          issues={manualIssues}
                          viewMode={planViewMode}
                          placementSettings={placementSettings}
                          onSelectBox={setManualSelectedId}
                          onMoveBox={handleManualMoveBox}
                          onDropFromPool={handleManualDropFromPool}
                        />
                      )}
                    </div>
                  </div>
                </div>
              ) : workspaceView === '3d' ? (
                <>
                  <div className="relative h-full w-full" data-testid="auto-view-container">
                    <div className="absolute left-3 top-3 z-30">
                      <button
                        className="archive-tab bg-white/95 shadow-lg"
                        type="button"
                        aria-expanded={autoHelpOpen}
                        data-testid="auto-keyboard-help"
                        onClick={() => setAutoHelpOpen((current) => !current)}
                      >
                        {t.autoKeyboardHelp}
                      </button>
                      {autoHelpOpen && (
                        <div
                          className="mt-2 w-64 rounded-lg border border-[#cbd5e1] bg-white p-3 text-xs text-[#334155] shadow-xl"
                          data-testid="auto-keyboard-help-popover"
                        >
                          <ul className="list-inside list-disc space-y-1">
                            {t.autoKeyboardHelpItems.map((item) => (
                              <li key={item}>{item}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                    <button
                      className={`archive-tab absolute right-3 top-3 z-30 inline-flex items-center gap-2 bg-white/95 shadow-lg ${workspaceMaximized ? 'active' : ''}`}
                      type="button"
                      data-testid="maximize-workspace"
                      aria-pressed={workspaceMaximized}
                      onClick={() => setWorkspaceMaximized((current) => !current)}
                    >
                      {workspaceMaximized ? t.restoreManual : t.maximizeManual}
                    </button>
                    <ContainerScene activeLabelId={activeLabelId} activeLayerId={activeLayerId} boxes={visibleAutoBoxes} boxOpacityOverride={cogViewState.boxOpacity} clearanceAnnotations={clearanceAnnotations} clearanceEnabled={clearanceEnabled} cogOverlay={cogOverlay} container={renderingContainer} edgeSnap={edgeSnap} gridSnap={gridSnap} highlightBoxIds={loadingStepsActive ? activeLoadingGroupBoxIds : undefined} placementSettings={placementSettings} resetViewTick={resetViewTick} selectedBoxId={selectedBoxId} viewMode={sceneViewMode} onHoverBox={setHoverInfo} onSelectBox={setSelectedBoxId} />
                  </div>
                </>
              ) : (
                <>
                  <div className="relative h-full w-full" data-testid="auto-view-container">
                    <button
                      className={`archive-tab absolute right-3 top-3 z-30 inline-flex items-center gap-2 bg-white/95 shadow-lg ${workspaceMaximized ? 'active' : ''}`}
                      type="button"
                      data-testid="maximize-workspace"
                      aria-pressed={workspaceMaximized}
                      onClick={() => setWorkspaceMaximized((current) => !current)}
                    >
                      {workspaceMaximized ? t.restoreManual : t.maximizeManual}
                    </button>
                    <ContainerPlan2D activeLabelId={activeLabelId} activeLayerId={activeLayerId} boxes={visibleAutoBoxes} container={renderingContainer} highlightBoxIds={loadingStepsActive ? activeLoadingGroupBoxIds : undefined} mode={planViewMode} selectedBoxId={selectedBoxId} onSelectBox={setSelectedBoxId} />
                  </div>
                </>
              )}
              <button
                className="archive-button success absolute bottom-6 right-6"
                type="button"
                onClick={calculateAndShowPlacement}
              >
                {t.load}
              </button>
              {hoverInfo && (
                <div
                  className="pointer-events-none fixed z-50 rounded-lg border border-[#1e293b] bg-[#0f172a] px-3 py-2 text-xs text-white shadow-xl"
                  style={{ left: hoverInfo.clientX + 12, top: hoverInfo.clientY + 12 }}
                  data-testid="hover-tooltip"
                >
                  <div className="font-bold">{t.hoverTooltipLabel}: {hoverInfo.label}</div>
                  <div>{t.hoverTooltipSize}: {hoverInfo.length} × {hoverInfo.width} × {hoverInfo.height} mm</div>
                  <div>{t.hoverTooltipOrientation}: {hoverInfo.orientationKey}</div>
                  <div>{t.hoverTooltipPosition}: ({Math.round(hoverInfo.x)}, {Math.round(hoverInfo.y)}, {Math.round(hoverInfo.z)})</div>
                </div>
              )}
            </div>
          </section>

          <section className={`archive-card overflow-hidden ${workspaceMaximized ? 'hidden' : ''}`} ref={reportRef} data-testid="report-panel">
          <div className="border-b border-[#e5e7eb] p-[18px]">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3" data-testid="import-export-toolbar">
              <h2 className="text-lg font-bold">{t.results}</h2>
              <div className="flex flex-wrap gap-2 text-xs">
                <label className="cursor-pointer border border-[#b8b8b8] bg-white px-3 py-2 font-semibold">{t.importExcel}<input className="hidden" accept=".xlsx,.xls,.csv" type="file" onChange={(event) => {
                  const file = event.target.files?.[0] ?? null
                  event.currentTarget.value = ''
                  void importExcel(file)
                }} /></label>
                <button className="border border-[#b8b8b8] bg-white px-3 py-2 font-semibold" data-testid="download-import-template" type="button" onClick={downloadImportTemplate}>{t.downloadImportTemplate}</button>
                <select
                  className="border border-[#b8b8b8] bg-white px-3 py-2 font-semibold"
                  value={selectedExportTemplateId}
                  data-testid="export-template-select"
                  onChange={(event) => setSelectedExportTemplateId(event.target.value)}
                >
                  <option value="">{t.exportTemplateDefault}</option>
                  {exportTemplates.map((template) => (
                    <option key={template.id} value={template.id}>{template.name}</option>
                  ))}
                </select>
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
                { id: 'playback' as const, label: t.playbackTab },
                { id: 'loadingSteps' as const, label: t.loadingStepsTab },
                { id: 'cog' as const, label: t.cogTab },
                { id: 'compare' as const, label: t.compareTab },
                { id: 'fill' as const, label: t.fillTab },
                { id: 'reviewChecklist' as const, label: t.reviewChecklistTab },
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
                      {layerHasGapFill(layer.physicalLayer) && <><br />{t.mixedPlacementGapFill}</>}
                    </button>
                  ))}
                </div>
                {activeLayer && (
                  <div className="mt-3 border-t border-[#bebebe] pt-2 text-xs">
                    <strong>{t.layerStats}</strong>
                    <p>{activeLayer.count} {t.qty}, {activeLayer.weight.toLocaleString()} kg, {formatCubicMeters(activeLayer.volume)}</p>
                    <p>{activeLayer.labels.map((entry) => `${entry.label} x${entry.count}`).join(', ')}</p>
                    {layerHasGapFill(activeLayer.physicalLayer) && <p>{t.placementNote}: {t.mixedPlacementGapFill}</p>}
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
                          {box && <div>{box.name} · {layerName(result.layers.find((layer) => layer.physicalLayer === box.physicalLayer) ?? result.layers[0], locale)}{isGapFillBox(box) ? ` · ${t.mixedPlacementGapFill}` : ''}</div>}
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
                      <th className="p-2">{t.placementNote}</th>
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
                        <td className="p-2">{item.placementNote ? t.mixedPlacementGapFill : '-'}</td>
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

            {activeResultTab === 'playback' && (
              <div className="mt-3" data-testid="playback-tab-panel">
                <PlaybackPanel
                  available={playbackAvailable}
                  cursor={playback.cursor}
                  locale={locale}
                  playing={playback.playing}
                  sequence={playbackSequence}
                  speed={playback.speed}
                  onCursorChange={playback.setCursor}
                  onFinish={playback.finish}
                  onReset={playback.reset}
                  onSpeedChange={(next: PlaybackSpeed) => playback.setSpeed(next)}
                  onTogglePlay={playback.togglePlay}
                  onExport={exportPlaybackInstructions}
                />
              </div>
            )}

            {activeResultTab === 'loadingSteps' && (
              <div className="mt-3" data-testid="loading-steps-tab-panel">
                <LoadingStepsPanel
                  activeIndex={activeLoadingGroupIndex}
                  available={loadingStepsAvailable}
                  exportDisabled={!loadingStepsAvailable}
                  groups={loadingTaskGroups}
                  locale={locale}
                  playing={loadingGroupsPlaying}
                  onExportPdf={exportLoadingSheet}
                  onSelectGroup={(index) => {
                    const nextIndex = Math.max(0, Math.min(index, loadingTaskGroups.length - 1))
                    const group = loadingTaskGroups[nextIndex]
                    setActiveLoadingGroupIndex(nextIndex)
                    setLoadingGroupsPlaying(false)
                    if (group) {
                      setActiveLayerId(String(group.physicalLayer))
                      if (placementMode === 'manual') {
                        setManualSelectedId(group.boxIds[0] ?? null)
                      } else {
                        setSelectedBoxId(group.boxIds[0] ?? null)
                      }
                    }
                  }}
                  onTogglePlay={() => setLoadingGroupsPlaying((current) => !current)}
                />
              </div>
            )}

            {activeResultTab === 'cog' && (
              <div className="mt-3" data-testid="cog-tab-panel">
                <CenterOfGravityPanel
                  container={{ length: selectedContainer.length, width: selectedContainer.width, height: selectedContainer.height }}
                  locale={locale}
                  result={cogResult}
                  show3d={showCogOverlay}
                  vehicleProfile={vehicleProfile}
                  onToggle3d={toggleCogOverlay}
                  onVehicleProfileChange={setVehicleProfile}
                />
              </div>
            )}

            {activeResultTab === 'compare' && (
              <div className="mt-3" data-testid="compare-tab-panel">
                <ContainerComparisonPanel
                  candidates={compareCandidates}
                  hasCargo={displayCargoItems.length > 0}
                  locale={locale}
                  rows={compareRows}
                  selectedIds={compareSelection}
                  onApplyRecommended={(id) => {
                    setSelectedContainerId(id)
                    markPlacementDirty()
                  }}
                  onToggleCandidate={(id) => {
                    setCompareSelection((current) =>
                      current.includes(id)
                        ? current.filter((entry) => entry !== id)
                        : [...current, id],
                    )
                  }}
                />
              </div>
            )}

            {activeResultTab === 'fill' && (
              <div className="mt-3" data-testid="fill-tab-panel">
                <FillSuggestionPanel
                  available={hasCalculated}
                  locale={locale}
                  suggestions={fillSuggestions}
                  onAdd={handleAddFillCargo}
                  onAddAll={handleAddAllFillCargo}
                />
              </div>
            )}

            {activeResultTab === 'reviewChecklist' && (
              <div className="mt-3 space-y-3 text-xs" data-testid="review-checklist-panel">
                <div className="flex flex-wrap items-center gap-2">
                  <strong>{t.reviewChecklistTab}: {reviewChecklist.summary.total}</strong>
                  <span className="text-[#991b1b]">errors {reviewChecklist.summary.errorCount}</span>
                  <span className="text-[#92400e]">warnings {reviewChecklist.summary.warningCount}</span>
                  <button className="archive-button ml-auto" type="button" data-testid="export-review-json" onClick={exportReviewChecklistJson}>
                    {t.reviewChecklistExportJson}
                  </button>
                  <button className="archive-button" type="button" data-testid="export-review-excel" onClick={exportReviewChecklistExcel}>
                    {t.reviewChecklistExportExcel}
                  </button>
                </div>
                {reviewChecklist.items.length === 0 ? (
                  <p className="border border-[#c6c6c6] bg-white p-2">{t.reviewChecklistEmpty}</p>
                ) : (
                  reviewChecklist.items.map((item) => (
                    <div
                      className={`border bg-white p-2 ${item.severity === 'error' ? 'border-[#fecaca]' : item.severity === 'warning' ? 'border-[#fde68a]' : 'border-[#c6c6c6]'}`}
                      key={item.id}
                      data-testid="review-checklist-item"
                      data-source={item.source}
                      data-severity={item.severity}
                    >
                      <strong className="uppercase">{item.source} · {item.severity}</strong>
                      <p className="font-semibold">{item.title}</p>
                      <p>{item.detail}</p>
                    </div>
                  ))
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
              <div className="mb-4 grid gap-3 rounded-md border border-slate-200 bg-slate-50 p-3 text-sm md:grid-cols-[1fr_1fr_auto]" data-testid="import-template-controls">
                <label className="font-semibold text-slate-700">
                  {t.templateLabel}
                  <select
                    className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
                    value={selectedImportTemplateId}
                    data-testid="import-template-select"
                    onChange={(event) => applyImportTemplate(event.target.value)}
                  >
                    <option value="">{t.templateNone}</option>
                    {importTemplates.map((template) => (
                      <option key={template.id} value={template.id}>{template.name}</option>
                    ))}
                  </select>
                </label>
                <label className="font-semibold text-slate-700">
                  {t.templateName}
                  <input
                    className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
                    value={templateName}
                    data-testid="import-template-name"
                    onChange={(event) => setTemplateName(event.target.value)}
                  />
                </label>
                <button
                  className="self-end rounded-lg border border-indigo-200 bg-white px-4 py-2 text-sm font-semibold text-indigo-700 hover:bg-indigo-50 disabled:cursor-not-allowed disabled:opacity-50"
                  type="button"
                  data-testid="save-import-template"
                  disabled={!templateName.trim()}
                  onClick={handleSaveImportTemplate}
                >
                  {t.templateSave}
                </button>
                {templateSaveNotice && (
                  <div className="md:col-span-3 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-800" data-testid="template-save-status">
                    {templateSaveNotice}
                  </div>
                )}
              </div>
              <ImportMappingForm
                value={importMappingValue}
                onChange={handleImportMappingChange}
                availableColumns={importColumnsForHeaderRow(importRows, templateHeaderRow)}
                labels={t}
                missingColumns={missingImportColumns}
                previewSlot={(
                  <div className="rounded-md border border-slate-200 bg-slate-50 p-3" data-testid="mapping-preview">
                    <div className="mb-2 text-sm font-semibold text-slate-700">{t.mappingPreview}</div>
                    <div className="max-h-[420px] overflow-auto">
                      <table className="min-w-full border-collapse text-xs">
                        <thead className="sticky top-0 bg-slate-100">
                          <tr>
                            {importColumnsForHeaderRow(importRows, templateHeaderRow).map((col) => (
                              <th key={col} className="border border-slate-200 px-2 py-1 text-left font-semibold text-slate-700 whitespace-nowrap">{col}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {importPreviewRows(importRows, templateHeaderRow, templateStartRow).slice(0, 5).map((row, rowIndex) => (
                            <tr key={rowIndex} className="odd:bg-white even:bg-slate-50">
                              {importColumnsForHeaderRow(importRows, templateHeaderRow).map((col) => (
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
                )}
              />
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
                {!canConfirmMapping && (
                  <span className="mr-auto text-xs font-semibold text-amber-600" data-testid="mapping-missing-hint">
                    {missingFieldsHint}
                  </span>
                )}
                <button
                  className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                  type="button"
                  data-testid="confirm-mapping"
                  disabled={!canConfirmMapping}
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
              setSelectedContainerId(container.id)
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
