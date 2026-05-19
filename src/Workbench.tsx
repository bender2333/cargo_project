import { useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import * as XLSX from 'xlsx'
import { ContainerScene } from './components/ContainerScene'
import { containers, formatCubicMeters, getContainerVolume } from './data/containers'
import { calculatePacking } from './lib/packing'
import type { CargoItem, LayerSpec, Locale } from './types'

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
    importExcel: 'Import XLSX',
    exportExcel: 'Export XLSX',
    load: 'Load',
    results: 'Results',
    loaded: 'Loaded',
    volumeUse: 'Volume utilization',
    weightUse: 'Weight utilization',
    containerVolume: 'Container volume',
    volume: 'Volume',
    qty: 'qty',
    unloaded: 'Unloaded cargo',
    layers: 'Layer-by-layer placement',
    allLayers: 'All layers',
    currentLayer: 'Current layer',
    showLayer: 'Show layer',
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
    importExcel: '导入 XLSX',
    exportExcel: '导出 XLSX',
    load: '装箱',
    results: '结果',
    loaded: '已装入',
    volumeUse: '体积利用率',
    weightUse: '重量利用率',
    containerVolume: '货柜体积',
    volume: '体积',
    qty: '数量',
    unloaded: '未装入货物',
    layers: '逐层添加货物',
    allLayers: '全部层',
    currentLayer: '当前层',
    showLayer: '显示层',
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

type CargoForm = Omit<CargoItem, 'id'>

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

function buildLayers(boxes: ReturnType<typeof calculatePacking>['placed'], locale: Locale): LayerSpec[] {
  const groups = new Map<number, typeof boxes>()
  boxes.forEach((box) => {
    const key = Math.round(box.z)
    groups.set(key, [...(groups.get(key) ?? []), box])
  })
  return [...groups.entries()]
    .sort(([a], [b]) => a - b)
    .map(([z, layerBoxes], index) => ({
      id: String(z),
      name: locale === 'zh' ? `第${index + 1}层` : `Layer ${index + 1}`,
      z,
      minZ: Math.min(...layerBoxes.map((box) => box.z)),
      maxZ: Math.max(...layerBoxes.map((box) => box.z + box.height)),
      count: layerBoxes.length,
    }))
}

function Workbench() {
  const [locale, setLocale] = useState<Locale>('en')
  const t = copy[locale]
  const [selectedContainerId, setSelectedContainerId] = useState(containers[0].id)
  const [cargoItems, setCargoItems] = useState<CargoItem[]>(initialCargo)
  const [form, setForm] = useState<CargoForm>(emptyForm)
  const [hasCalculated, setHasCalculated] = useState(true)
  const [activeLayerId, setActiveLayerId] = useState('all')
  const [selectedBoxId, setSelectedBoxId] = useState<string | null>(null)

  const selectedContainer = containers.find((container) => container.id === selectedContainerId) ?? containers[0]
  const result = useMemo(() => calculatePacking(selectedContainer, cargoItems), [cargoItems, selectedContainer])
  const layers = useMemo(() => buildLayers(result.placed, locale), [locale, result.placed])
  const visibleBoxes = hasCalculated
    ? result.placed.filter((box) => activeLayerId === 'all' || Math.round(box.z).toString() === activeLayerId)
    : []

  const updateNumber = (field: keyof Pick<CargoForm, 'length' | 'width' | 'height' | 'weight' | 'quantity'>, value: string) => {
    setForm((current) => ({ ...current, [field]: Number(value) || 0 }))
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
    const imported = rows.map((row, index): CargoItem => ({
      id: crypto.randomUUID(),
      label: String(row.label ?? row.Label ?? nextLabel(index)).toUpperCase().slice(0, 2),
      name: String(row.name ?? row.Name ?? row.description ?? row.Description ?? `Cargo ${index + 1}`),
      length: Number(row.length ?? row.Length ?? row['Length mm'] ?? 0),
      width: Number(row.width ?? row.Width ?? row['Width mm'] ?? 0),
      height: Number(row.height ?? row.Height ?? row['Height mm'] ?? 0),
      weight: Number(row.weight ?? row.Weight ?? row['Weight kg'] ?? 0),
      quantity: Math.max(1, Number(row.quantity ?? row.Quantity ?? 1)),
      color: String(row.color ?? row.Color ?? colors[index % colors.length]),
      canRotate: String(row.canRotate ?? row.Rotate ?? 'true') !== 'false',
      stackable: String(row.stackable ?? row.Stackable ?? 'true') !== 'false',
    })).filter((item) => item.length > 0 && item.width > 0 && item.height > 0)
    setCargoItems(imported)
    setHasCalculated(false)
  }

  const exportExcel = () => {
    const rows = cargoItems.map((item) => ({
      label: item.label,
      name: item.name,
      length: item.length,
      width: item.width,
      height: item.height,
      weight: item.weight,
      quantity: item.quantity,
      color: item.color,
      canRotate: item.canRotate,
      stackable: item.stackable,
    }))
    const sheet = XLSX.utils.json_to_sheet(rows)
    const workbook = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(workbook, sheet, 'Cargo Items')
    XLSX.writeFile(workbook, 'cargo-items.xlsx')
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
                <label className="cursor-pointer border border-[#b8b8b8] bg-white px-2 py-1">{t.importExcel}<input className="hidden" accept=".xlsx,.xls" type="file" onChange={(event) => void importExcel(event.target.files?.[0] ?? null)} /></label>
                <button className="border border-[#b8b8b8] bg-white px-2 py-1" type="button" onClick={exportExcel}>{t.exportExcel}</button>
              </div>
            </div>
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
          <div className="absolute left-5 top-5 z-10 rounded bg-white/75 px-4 py-3 text-sm shadow">
            <strong>{selectedContainer.label}</strong>
            <div>{selectedContainer.length.toLocaleString()} x {selectedContainer.width.toLocaleString()} x {selectedContainer.height.toLocaleString()} mm</div>
          </div>
          <div className="absolute right-6 top-5 z-10 grid grid-cols-3 gap-5 rounded bg-white/70 px-5 py-3 text-center text-sm shadow">
            <div><strong>{t.weight}</strong><div>{result.usedWeight.toLocaleString()} kg</div></div>
            <div><strong>{t.volume}</strong><div>{formatCubicMeters(result.usedVolume)}</div></div>
            <div><strong>{t.loaded}</strong><div>{result.placedCount}/{result.totalCargoCount}</div></div>
          </div>
          <ContainerScene boxes={visibleBoxes} container={selectedContainer} selectedBoxId={selectedBoxId} onSelectBox={setSelectedBoxId} />
          <button className="absolute bottom-10 right-10 grid h-32 w-32 place-items-center rounded-full border-8 border-white bg-[#686868] text-3xl font-semibold text-white shadow-xl hover:bg-[#4c4c4c]" type="button" onClick={() => setHasCalculated(true)}>{t.load}</button>
        </section>

        <aside className="border-l border-[#bcbcbc] bg-[#ececec] max-xl:col-span-2 max-lg:col-span-1">
          <div className="border-b border-[#bebebe] bg-[#d0d0d0] p-3">
            <h2 className="font-bold">{t.layers}</h2>
            <select className="mt-2 w-full border border-[#aaa] bg-white p-2" value={activeLayerId} onChange={(event) => setActiveLayerId(event.target.value)}>
              <option value="all">{t.allLayers}</option>
              {layers.map((layer) => <option key={layer.id} value={layer.id}>{layer.name}: {layer.count}</option>)}
            </select>
            <div className="mt-2 grid grid-cols-2 gap-2">
              {layers.map((layer) => (
                <button className={`border px-2 py-1 text-left text-xs ${activeLayerId === layer.id ? 'border-[#f3b21a] bg-white' : 'border-[#bbb] bg-[#eee]'}`} key={layer.id} type="button" onClick={() => setActiveLayerId(layer.id)}>
                  {layer.name}<br />{Math.round(layer.minZ)}-{Math.round(layer.maxZ)} mm
                </button>
              ))}
            </div>
          </div>
          <div className="max-h-[320px] overflow-auto">
            {containers.map((container) => (
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
