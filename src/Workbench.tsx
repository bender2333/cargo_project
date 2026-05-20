import { useMemo, useState } from 'react'
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
import { parseCargoRows } from './lib/importCargo'
import { calculatePacking } from './lib/packing'
import type { CargoItem, Locale, PackingLayer } from './types'

const colors = ['#f59e0b', '#0ea5e9', '#22c55e', '#ef4444', '#8b5cf6', '#14b8a6']

const copy = {
  en: {
    nav: ['EasyCargo', 'Shipments & Reports', 'Cargo items', 'Cargo spaces', 'Users', 'Licenses'],
    shipment: 'Enter shipment name',
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
    containerConfig: 'Container parameters',
    containerType: 'Container type',
    customContainer: 'Custom container',
    maxWeight: 'Max payload kg',
    doorGap: 'Door gap mm',
    topGap: 'Top gap mm',
    sideGap: 'Side gap mm',
    importExcel: 'Import XLSX',
    exportExcel: 'Export XLSX',
    importIssue: 'Import issue',
    importWarning: 'Import warning',
    load: 'Load',
    view2d: '2D',
    view3d: '3D',
    isoView: 'Iso',
    topView: 'Top',
    frontView: 'Front',
    sideView: 'Side',
    results: 'Results',
    loaded: 'Loaded',
    volumeUse: 'Volume utilization',
    weightUse: 'Weight utilization',
    containerVolume: 'Container volume',
    volume: 'Volume',
    qty: 'qty',
    unloaded: 'Unloaded cargo',
    layers: 'Layer-by-layer placement',
    details: 'Details',
    diagnostics: 'Diagnostics',
    history: 'History',
    savePlan: 'Save plan',
    restore: 'Restore',
    noHistory: 'No saved plans',
    allLayers: 'All layers',
    currentLayer: 'Current layer',
    showLayer: 'Show layer',
    layerStats: 'Layer stats',
    supportedBy: 'Supported by',
    planned: 'Planned',
    placed: 'Placed',
    unplacedCount: 'Unplaced',
    failureReason: 'Failure reason',
    noFailure: 'None',
    label: 'Label',
    buy: 'Buy',
    signOut: 'Sign out',
    language: '中文',
  },
  zh: {
    nav: ['EasyCargo', '装箱报告', '货物项目', '货柜空间', '用户', '许可证'],
    shipment: '输入装运名称',
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
    containerConfig: '货柜参数',
    containerType: '货柜类型',
    customContainer: '自定义柜型',
    maxWeight: '最大载重 kg',
    doorGap: '柜门预留 mm',
    topGap: '顶部余量 mm',
    sideGap: '左右预留 mm',
    importExcel: '导入 XLSX',
    exportExcel: '导出 XLSX',
    importIssue: '导入问题',
    importWarning: '导入提醒',
    load: '装箱',
    view2d: '2D',
    view3d: '3D',
    isoView: '轴测',
    topView: '俯视',
    frontView: '正视',
    sideView: '侧视',
    results: '结果',
    loaded: '已装入',
    volumeUse: '体积利用率',
    weightUse: '重量利用率',
    containerVolume: '货柜体积',
    volume: '体积',
    qty: '数量',
    unloaded: '未装入货物',
    layers: '逐层添加货物',
    details: '明细表',
    diagnostics: '合规与诊断',
    history: '历史方案',
    savePlan: '保存方案',
    restore: '恢复',
    noHistory: '暂无历史方案',
    allLayers: '全部层',
    currentLayer: '当前层',
    showLayer: '显示层',
    layerStats: '当前层统计',
    supportedBy: '支撑来源',
    planned: '计划',
    placed: '已装',
    unplacedCount: '未装',
    failureReason: '失败原因',
    noFailure: '无',
    label: '标识',
    buy: '购买',
    signOut: '退出',
    language: 'English',
  },
}

const initialCargo: CargoItem[] = [
  {
    id: 'sample-1',
    name: 'Carton A',
    label: 'A',
    length: 600,
    width: 400,
    height: 350,
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
type ResultTab = 'layers' | 'details' | 'diagnostics' | 'history'

const emptyForm: CargoForm = {
  name: 'Carton B',
  label: 'B',
  length: 800,
  width: 500,
  height: 450,
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

function Workbench() {
  const [locale, setLocale] = useState<Locale>('en')
  const t = copy[locale]
  const [selectedContainerId, setSelectedContainerId] = useState(containers[0].id)
  const [containerOverrides, setContainerOverrides] = useState(() => Object.fromEntries(containers.map((container) => [container.id, container])))
  const [customContainer, setCustomContainer] = useState(customContainerDefaults)
  const [cargoItems, setCargoItems] = useState<CargoItem[]>(initialCargo)
  const [form, setForm] = useState<CargoForm>(emptyForm)
  const [hasCalculated, setHasCalculated] = useState(true)
  const [activeLayerId, setActiveLayerId] = useState('all')
  const [workspaceView, setWorkspaceView] = useState<WorkspaceView>('3d')
  const [sceneViewMode, setSceneViewMode] = useState<SceneViewMode>('iso')
  const [planViewMode, setPlanViewMode] = useState<PlanViewMode>('top')
  const [activeResultTab, setActiveResultTab] = useState<ResultTab>('layers')
  const [historyPlans, setHistoryPlans] = useState<HistoryPlan[]>(() => readHistoryPlans(localStorage))
  const [importMessages, setImportMessages] = useState<string[]>([])
  const [selectedBoxId, setSelectedBoxId] = useState<string | null>(null)

  const selectedContainer = selectedContainerId === 'custom'
    ? customContainer
    : containerOverrides[selectedContainerId] ?? containers[0]
  const renderingContainer = effectiveContainer(selectedContainer)
  const result = useMemo(() => calculatePacking(selectedContainer, cargoItems), [cargoItems, selectedContainer])
  const activeLayer = result.layers.find((layer) => layer.id === activeLayerId)
  const visibleBoxes = hasCalculated
    ? result.placed.filter((box) => activeLayerId === 'all' || String(box.physicalLayer) === activeLayerId)
    : []

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
      id: crypto.randomUUID(),
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

  const importExcel = async (file: File | null) => {
    if (!file) return
    const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array' })
    const sheet = workbook.Sheets[workbook.SheetNames[0]]
    const rows = XLSX.utils.sheet_to_json<Record<string, string | number>>(sheet)
    const imported = parseCargoRows(rows, { colors })
    setImportMessages([
      ...imported.errors.map((issue) => `${t.importIssue} row ${issue.row}: ${issue.message}`),
      ...imported.warnings.map((issue) => `${t.importWarning} row ${issue.row}: ${issue.message}`),
    ])
    if (imported.items.length > 0) {
      setCargoItems(imported.items)
      setHasCalculated(false)
    }
  }

  const exportExcel = () => {
    const rows = buildExportPlanRows(cargoItems, result)
    const sheet = XLSX.utils.json_to_sheet(rows)
    const workbook = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(workbook, sheet, 'Packing Plan')
    XLSX.writeFile(workbook, 'packing-plan.xlsx')
  }

  const saveCurrentPlan = () => {
    const next = createHistoryPlan(selectedContainer, cargoItems, result)
    setHistoryPlans(saveHistoryPlan(localStorage, next))
    setActiveResultTab('history')
  }

  const restorePlan = (plan: HistoryPlan) => {
    setSelectedContainerId(plan.containerId)
    if (plan.containerId === 'custom') {
      setCustomContainer(plan.container)
    } else {
      setContainerOverrides((current) => ({ ...current, [plan.containerId]: plan.container }))
    }
    setCargoItems(plan.cargoItems)
    setActiveLayerId('all')
    setSelectedBoxId(null)
    setHasCalculated(true)
  }

  return (
    <main className="min-h-screen bg-[#e6e6e6] text-[#3f3f3f]">
      <header className="flex h-10 items-stretch border-b border-[#a9a9a9] bg-[#d0d0d0] text-sm">
        {t.nav.map((item, index) => (
          <button className={`border-r border-[#b7b7b7] px-4 text-left ${index === 0 ? 'bg-[#eeeeee] font-semibold text-[#6b6b6b]' : 'hover:bg-[#eeeeee]'}`} key={item} type="button">
            {item}
          </button>
        ))}
        <div className="ml-auto flex items-center gap-3 px-4">
          <button className="rounded border border-[#999] bg-white px-2 py-1" type="button" onClick={() => setLocale(locale === 'en' ? 'zh' : 'en')}>
            {t.language}
          </button>
          <span className="rounded-full bg-[#ffb020] px-2 py-1 text-white">?</span>
          <span>yvonne</span>
          <button className="bg-[#f3b21a] px-5 py-2 font-semibold text-white" type="button">{t.buy}</button>
          <button className="text-[#2f2f2f]" type="button">{t.signOut}</button>
        </div>
      </header>

      <section className="grid min-h-[calc(100vh-40px)] grid-cols-[390px_1fr_280px] max-xl:grid-cols-[340px_1fr] max-lg:grid-cols-1">
        <aside className="border-r border-[#bcbcbc] bg-[#f2f2f2]">
          <div className="flex h-14 items-center gap-4 bg-[#686868] px-4 text-white">
            <button className="text-3xl leading-none" type="button" aria-label="Open menu">≡</button>
            <input className="w-full bg-transparent text-sm italic outline-none placeholder:text-white" placeholder={t.shipment} aria-label="Shipment name" />
          </div>
          <div className="flex items-center justify-between bg-[#b0b4b7] pl-4">
            <strong className="bg-[#f29ca8] px-4 py-3 text-sm">{t.group}</strong>
            <span className="flex-1 px-4 text-sm italic text-white">{t.note}</span>
          </div>
          <section className="border-b border-[#c8c8c8] p-4">
            <h2 className="mb-2 text-sm font-bold">{t.containerConfig}</h2>
            <label className="field-label">{t.containerType}
              <select className="field-input mt-1" value={selectedContainerId} onChange={(event) => setSelectedContainerId(event.target.value)}>
                {containers.map((container) => <option key={container.id} value={container.id}>{container.label}</option>)}
                <option value="custom">{t.customContainer}</option>
              </select>
            </label>
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
          </section>
          <form className="space-y-3 p-4" onSubmit={addCargo}>
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
            <button className="w-full border border-[#9b9b9b] bg-white px-3 py-2 text-left font-semibold hover:bg-[#fafafa]" type="submit">{t.add}</button>
          </form>
          <div className="border-t border-[#c8c8c8] p-4">
            <div className="mb-2 flex items-center justify-between gap-2">
              <h2 className="text-sm font-bold">{t.cargoItems}</h2>
              <div className="flex gap-2 text-xs">
                <label className="cursor-pointer border border-[#b8b8b8] bg-white px-2 py-1">{t.importExcel}<input className="hidden" accept=".xlsx,.xls,.csv" type="file" onChange={(event) => void importExcel(event.target.files?.[0] ?? null)} /></label>
                <button className="border border-[#b8b8b8] bg-white px-2 py-1" type="button" onClick={exportExcel}>{t.exportExcel}</button>
              </div>
            </div>
            {importMessages.length > 0 && (
              <div className="mb-2 space-y-1 border border-[#d7b7b7] bg-white p-2 text-xs">
                {importMessages.map((message) => <p key={message}>{message}</p>)}
              </div>
            )}
            <div className="space-y-2">
              {cargoItems.map((item) => (
                <button className={`w-full border p-3 text-left text-sm ${result.placed.some((box) => box.cargoId === item.id && box.id === selectedBoxId) ? 'border-[#f3b21a] bg-[#fff7df]' : 'border-[#c9c9c9] bg-white'}`} key={item.id} type="button" onClick={() => setSelectedBoxId(result.placed.find((box) => box.cargoId === item.id)?.id ?? null)}>
                  <div className="flex items-center justify-between gap-2">
                    <span className="flex items-center gap-2 font-semibold"><span className="grid h-6 w-6 place-items-center rounded bg-[#222] text-xs text-white">{item.label}</span><span className="h-3 w-3" style={{ backgroundColor: item.color }} />{item.name}</span>
                  </div>
                  <p className="mt-1 text-xs text-[#666]">{item.length} x {item.width} x {item.height} mm, {item.weight} kg, {t.qty} {item.quantity}</p>
                </button>
              ))}
            </div>
          </div>
        </aside>

        <section className="relative min-h-[650px] bg-[#d8d8d8]">
          <div className="absolute left-5 top-24 z-10 flex gap-2 rounded bg-white/75 p-2 text-sm shadow">
            <button className={`border px-3 py-1 ${workspaceView === '3d' ? 'border-[#f3b21a] bg-white font-bold' : 'border-[#bbbbbb] bg-[#eeeeee]'}`} type="button" onClick={() => setWorkspaceView('3d')}>
              {t.view3d}
            </button>
            <button className={`border px-3 py-1 ${workspaceView === '2d' ? 'border-[#f3b21a] bg-white font-bold' : 'border-[#bbbbbb] bg-[#eeeeee]'}`} type="button" onClick={() => setWorkspaceView('2d')}>
              {t.view2d}
            </button>
            {workspaceView === '2d' && (
              <>
                {[
                  { id: 'top' as const, label: t.topView },
                  { id: 'front' as const, label: t.frontView },
                  { id: 'side' as const, label: t.sideView },
                ].map((view) => (
                  <button className={`border px-3 py-1 ${planViewMode === view.id ? 'border-[#f3b21a] bg-white font-bold' : 'border-[#bbbbbb] bg-[#eeeeee]'}`} key={view.id} type="button" onClick={() => setPlanViewMode(view.id)}>
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
                  <button className={`border px-3 py-1 ${sceneViewMode === view.id ? 'border-[#f3b21a] bg-white font-bold' : 'border-[#bbbbbb] bg-[#eeeeee]'}`} key={view.id} type="button" onClick={() => setSceneViewMode(view.id)}>
                    {view.label}
                  </button>
                ))}
              </>
            )}
          </div>
          <div className="absolute left-5 top-5 z-10 rounded bg-white/75 px-4 py-3 text-sm shadow">
            <strong>{selectedContainer.label}</strong>
            <div>{renderingContainer.length.toLocaleString()} x {renderingContainer.width.toLocaleString()} x {renderingContainer.height.toLocaleString()} mm</div>
          </div>
          <div className="absolute right-6 top-5 z-10 grid grid-cols-3 gap-5 rounded bg-white/70 px-5 py-3 text-center text-sm shadow">
            <div><strong>{t.weight}</strong><div>{result.usedWeight.toLocaleString()} kg</div></div>
            <div><strong>{t.volume}</strong><div>{formatCubicMeters(result.usedVolume)}</div></div>
            <div><strong>{t.loaded}</strong><div>{result.placedCount}/{result.totalCargoCount}</div></div>
          </div>
          {workspaceView === '3d' ? (
            <ContainerScene activeLayerId={activeLayerId} boxes={hasCalculated ? result.placed : []} container={renderingContainer} selectedBoxId={selectedBoxId} viewMode={sceneViewMode} onSelectBox={setSelectedBoxId} />
          ) : (
            <ContainerPlan2D activeLayerId={activeLayerId} boxes={result.placed} container={renderingContainer} mode={planViewMode} selectedBoxId={selectedBoxId} onSelectBox={setSelectedBoxId} />
          )}
          <button className="absolute bottom-10 right-10 grid h-32 w-32 place-items-center rounded-full border-8 border-white bg-[#686868] text-3xl font-semibold text-white shadow-xl hover:bg-[#4c4c4c]" type="button" onClick={() => setHasCalculated(true)}>{t.load}</button>
        </section>

        <aside className="border-l border-[#bcbcbc] bg-[#ececec] max-xl:col-span-2 max-lg:col-span-1">
          <div className="border-b border-[#bebebe] bg-[#d0d0d0] p-3">
            <div className="grid grid-cols-3 gap-1 text-xs font-bold">
              {[
                { id: 'layers' as const, label: t.layers },
                { id: 'details' as const, label: t.details },
                { id: 'diagnostics' as const, label: t.diagnostics },
                { id: 'history' as const, label: t.history },
              ].map((tab) => (
                <button className={`border px-2 py-2 ${activeResultTab === tab.id ? 'border-[#f3b21a] bg-white' : 'border-[#b8b8b8] bg-[#eeeeee]'}`} key={tab.id} type="button" onClick={() => setActiveResultTab(tab.id)}>
                  {tab.label}
                </button>
              ))}
            </div>

            {activeResultTab === 'layers' && (
              <div className="mt-3">
                <select className="w-full border border-[#aaa] bg-white p-2" value={activeLayerId} onChange={(event) => setActiveLayerId(event.target.value)}>
                  <option value="all">{t.allLayers}</option>
                  {result.layers.map((layer) => <option key={layer.id} value={layer.id}>{layerName(layer, locale)}: {layer.count}</option>)}
                </select>
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
              </div>
            )}

            {activeResultTab === 'details' && (
              <div className="mt-3 max-h-[240px] overflow-auto border border-[#c6c6c6] bg-white">
                <table className="w-full text-left text-xs">
                  <thead className="sticky top-0 bg-[#eeeeee]">
                    <tr>
                      <th className="p-2">{t.label}</th>
                      <th className="p-2">{t.name}</th>
                      <th className="p-2">{t.planned}</th>
                      <th className="p-2">{t.placed}</th>
                      <th className="p-2">{t.unplacedCount}</th>
                      <th className="p-2">{t.layers}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.labelStats.map((item) => (
                      <tr className="border-t border-[#dddddd]" key={`${item.label}-${item.name}`}>
                        <td className="p-2 font-bold">{item.label}</td>
                        <td className="p-2">{item.name}</td>
                        <td className="p-2">{item.planned}</td>
                        <td className="p-2">{item.placed}</td>
                        <td className="p-2">{item.unplaced}</td>
                        <td className="p-2">{item.layers.join(', ') || '-'}</td>
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
                    <p>{diagnostic.message}</p>
                  </div>
                ))}
                {result.unplaced.map((item) => (
                  <div className="border border-[#d7b7b7] bg-white p-2" key={item.cargoId}>
                    <strong>{item.label} {item.name}</strong>
                    <p>{t.failureReason}: {item.reason || t.noFailure}</p>
                  </div>
                ))}
              </div>
            )}

            {activeResultTab === 'history' && (
              <div className="mt-3 space-y-2 text-xs">
                <button className="w-full border border-[#9b9b9b] bg-white px-3 py-2 text-left font-semibold" type="button" onClick={saveCurrentPlan}>
                  {t.savePlan}
                </button>
                {historyPlans.length === 0 && <p className="border border-[#c6c6c6] bg-white p-2">{t.noHistory}</p>}
                {historyPlans.map((plan) => (
                  <div className="border border-[#c6c6c6] bg-white p-2" key={plan.id}>
                    <strong>{new Date(plan.createdAt).toLocaleString()}</strong>
                    <p>{plan.placedCount}/{plan.totalCargoCount} · {plan.layerCount} {t.layers}</p>
                    <p>{plan.labelSummary}</p>
                    <button className="mt-2 border border-[#9b9b9b] bg-[#eeeeee] px-2 py-1" type="button" onClick={() => restorePlan(plan)}>
                      {t.restore}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="max-h-[320px] overflow-auto">
            {[...containers, customContainer].map((container) => (
              <button className={`block w-full border-b border-[#d1d1d1] px-3 py-4 text-left hover:bg-white ${container.id === selectedContainer.id ? 'bg-white' : ''}`} key={container.id} type="button" onClick={() => setSelectedContainerId(container.id)}>
                <div className="mb-2 ml-auto h-6 w-28 bg-[#5f5f5f]" />
                <strong>{container.label}</strong>
                <p className="text-xs">{container.length.toLocaleString()} x {container.width.toLocaleString()} x {container.height.toLocaleString()} mm {container.maxWeight.toLocaleString()} kg</p>
              </button>
            ))}
          </div>
          <div className="m-3 border border-[#c9c9c9] bg-white p-3 text-sm">
            <h2 className="font-bold">{t.results}</h2>
            <p>{t.loaded}: {result.placedCount} / {result.totalCargoCount}</p>
            <p>{t.volumeUse}: {result.volumeUtilization.toFixed(1)}%</p>
            <p>{t.weightUse}: {result.weightUtilization.toFixed(1)}%</p>
            <p>{t.containerVolume}: {formatCubicMeters(getContainerVolume(selectedContainer))}</p>
            <div className="mt-3 border-t pt-2">
              <strong>{t.showLayer}</strong>
              {visibleBoxes.slice(0, 10).map((box) => (
                <button className={`mt-1 block w-full rounded px-2 py-1 text-left text-xs ${selectedBoxId === box.id ? 'bg-[#fff0bd]' : 'bg-[#f6f6f6]'}`} key={box.id} type="button" onClick={() => setSelectedBoxId(box.id)}>
                  <b>{box.label}</b> {box.name} #{box.index} x:{Math.round(box.x)} y:{Math.round(box.y)} z:{Math.round(box.z)}
                  <br />{layerName(result.layers.find((layer) => layer.physicalLayer === box.physicalLayer) ?? result.layers[0], locale)} · {box.supportType}
                </button>
              ))}
            </div>
            {result.unplaced.length > 0 && (
              <div className="mt-3 border-t pt-2">
                <strong>{t.unloaded}</strong>
                {result.unplaced.map((item) => <p className="text-xs" key={item.cargoId}>{item.name} x {item.quantity}: {item.reason}</p>)}
              </div>
            )}
          </div>
        </aside>
      </section>
    </main>
  )
}

export default Workbench
