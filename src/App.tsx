import { useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { ContainerScene } from './components/ContainerScene'
import { containers, formatCubicMeters, getContainerVolume } from './data/containers'
import { calculatePacking } from './lib/packing'
import type { CargoItem } from './types'

const colors = ['#f59e0b', '#0ea5e9', '#22c55e', '#ef4444', '#8b5cf6', '#14b8a6']

const initialCargo: CargoItem[] = [
  {
    id: 'sample-1',
    name: 'Carton A',
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
  length: 800,
  width: 500,
  height: 450,
  weight: 24,
  quantity: 10,
  color: '#0ea5e9',
  canRotate: true,
  stackable: true,
}

function App() {
  const [selectedContainerId, setSelectedContainerId] = useState(containers[0].id)
  const [cargoItems, setCargoItems] = useState<CargoItem[]>(initialCargo)
  const [form, setForm] = useState<CargoForm>(emptyForm)
  const [hasCalculated, setHasCalculated] = useState(true)

  const selectedContainer = containers.find((container) => container.id === selectedContainerId) ?? containers[0]
  const result = useMemo(() => calculatePacking(selectedContainer, cargoItems), [cargoItems, selectedContainer])

  const updateNumber = (field: keyof Pick<CargoForm, 'length' | 'width' | 'height' | 'weight' | 'quantity'>, value: string) => {
    setForm((current) => ({ ...current, [field]: Number(value) || 0 }))
  }

  const addCargo = (event: FormEvent) => {
    event.preventDefault()
    const next: CargoItem = {
      ...form,
      id: crypto.randomUUID(),
      name: form.name.trim() || `Cargo ${cargoItems.length + 1}`,
      color: form.color || colors[cargoItems.length % colors.length],
      quantity: Math.max(1, Math.floor(form.quantity)),
    }
    setCargoItems((items) => [...items, next])
    setForm((current) => ({
      ...current,
      name: `Carton ${String.fromCharCode(67 + cargoItems.length)}`,
      color: colors[(cargoItems.length + 1) % colors.length],
    }))
    setHasCalculated(false)
  }

  const removeCargo = (id: string) => {
    setCargoItems((items) => items.filter((item) => item.id !== id))
    setHasCalculated(false)
  }

  const importCsv = async (file: File | null) => {
    if (!file) {
      return
    }
    const text = await file.text()
    const rows = text
      .split(/\r?\n/)
      .map((row) => row.trim())
      .filter(Boolean)
      .slice(1)

    const imported = rows
      .map((row, index): CargoItem | null => {
        const [name, length, width, height, weight, quantity, color] = row.split(',').map((cell) => cell.trim())
        if (!name || !length || !width || !height) {
          return null
        }
        return {
          id: crypto.randomUUID(),
          name,
          length: Number(length),
          width: Number(width),
          height: Number(height),
          weight: Number(weight) || 0,
          quantity: Math.max(1, Number(quantity) || 1),
          color: color || colors[index % colors.length],
          canRotate: true,
          stackable: true,
        }
      })
      .filter((item): item is CargoItem => Boolean(item))

    if (imported.length) {
      setCargoItems((items) => [...items, ...imported])
      setHasCalculated(false)
    }
  }

  const exportCsv = () => {
    const header = 'name,length,width,height,weight,quantity,color'
    const rows = cargoItems.map((item) =>
      [item.name, item.length, item.width, item.height, item.weight, item.quantity, item.color].join(','),
    )
    const blob = new Blob([[header, ...rows].join('\n')], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = 'cargo-items.csv'
    link.click()
    URL.revokeObjectURL(url)
  }

  const calculate = () => {
    setHasCalculated(true)
  }

  return (
    <main className="min-h-screen bg-[#e6e6e6] text-[#3f3f3f]">
      <header className="flex h-10 items-stretch border-b border-[#a9a9a9] bg-[#d0d0d0] text-sm">
        {['EasyCargo', 'Shipments & Reports', 'Cargo items', 'Cargo spaces', 'Users', 'Licenses'].map((item, index) => (
          <button
            className={`border-r border-[#b7b7b7] px-4 text-left ${index === 0 ? 'bg-[#eeeeee] font-semibold text-[#6b6b6b]' : 'hover:bg-[#eeeeee]'}`}
            key={item}
            type="button"
          >
            {item}
          </button>
        ))}
        <div className="ml-auto flex items-center gap-3 px-4">
          <span className="rounded-full bg-[#ffb020] px-2 py-1 text-white">?</span>
          <span>yvonne</span>
          <button className="bg-[#f3b21a] px-5 py-2 font-semibold text-white" type="button">
            Buy
          </button>
          <button className="text-[#2f2f2f]" type="button">
            Sign out
          </button>
        </div>
      </header>

      <section className="grid min-h-[calc(100vh-40px)] grid-cols-[390px_1fr_220px] max-xl:grid-cols-[340px_1fr] max-lg:grid-cols-1">
        <aside className="border-r border-[#bcbcbc] bg-[#f2f2f2]">
          <div className="flex h-14 items-center gap-4 bg-[#686868] px-4 text-white">
            <button className="text-3xl leading-none" type="button" aria-label="Open menu">
              ≡
            </button>
            <input
              className="w-full bg-transparent text-sm italic outline-none placeholder:text-white"
              placeholder="Enter shipment name"
              aria-label="Shipment name"
            />
          </div>

          <div className="flex items-center gap-2 border-b border-[#c8c8c8] bg-[#f7f7f7] p-3">
            <span className="grid h-9 w-9 place-items-center bg-[#f296a2] font-bold">1</span>
            <button className="grid h-9 w-9 place-items-center border border-[#bcbcbc] bg-white text-2xl" type="button">
              +
            </button>
          </div>

          <div className="flex items-center justify-between bg-[#b0b4b7] pl-4">
            <strong className="bg-[#f29ca8] px-4 py-3 text-sm">Group 1</strong>
            <span className="flex-1 px-4 text-sm italic text-white">- click to edit note</span>
          </div>

          <form className="space-y-3 p-4" onSubmit={addCargo}>
            <div>
              <label className="field-label" htmlFor="cargo-name">
                Name
              </label>
              <input
                id="cargo-name"
                className="field-input"
                value={form.name}
                onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
              />
            </div>
            <div className="grid grid-cols-3 gap-2">
              <label className="field-label">
                Length mm
                <input className="field-input mt-1" min="1" type="number" value={form.length} onChange={(event) => updateNumber('length', event.target.value)} />
              </label>
              <label className="field-label">
                Width mm
                <input className="field-input mt-1" min="1" type="number" value={form.width} onChange={(event) => updateNumber('width', event.target.value)} />
              </label>
              <label className="field-label">
                Height mm
                <input className="field-input mt-1" min="1" type="number" value={form.height} onChange={(event) => updateNumber('height', event.target.value)} />
              </label>
            </div>
            <div className="grid grid-cols-[1fr_1fr_56px] gap-2">
              <label className="field-label">
                Weight kg
                <input className="field-input mt-1" min="0" type="number" value={form.weight} onChange={(event) => updateNumber('weight', event.target.value)} />
              </label>
              <label className="field-label">
                Quantity
                <input className="field-input mt-1" min="1" type="number" value={form.quantity} onChange={(event) => updateNumber('quantity', event.target.value)} />
              </label>
              <label className="field-label">
                Color
                <input className="mt-1 h-10 w-full border border-[#a8a8a8]" type="color" value={form.color} onChange={(event) => setForm((current) => ({ ...current, color: event.target.value }))} />
              </label>
            </div>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <label className="flex items-center gap-2">
                <input checked={form.canRotate} type="checkbox" onChange={(event) => setForm((current) => ({ ...current, canRotate: event.target.checked }))} />
                Allow rotation
              </label>
              <label className="flex items-center gap-2">
                <input checked={form.stackable} type="checkbox" onChange={(event) => setForm((current) => ({ ...current, stackable: event.target.checked }))} />
                Stackable
              </label>
            </div>
            <button className="w-full border border-[#9b9b9b] bg-white px-3 py-2 text-left font-semibold hover:bg-[#fafafa]" type="submit">
              + Add cargo item
            </button>
          </form>

          <div className="border-t border-[#c8c8c8] p-4">
            <div className="mb-2 flex items-center justify-between gap-2">
              <h2 className="text-sm font-bold">Cargo items</h2>
              <div className="flex gap-2 text-xs">
                <label className="cursor-pointer border border-[#b8b8b8] bg-white px-2 py-1">
                  Import CSV
                  <input
                    className="hidden"
                    accept=".csv,text/csv"
                    type="file"
                    onChange={(event) => void importCsv(event.target.files?.[0] ?? null)}
                  />
                </label>
                <button className="border border-[#b8b8b8] bg-white px-2 py-1" type="button" onClick={exportCsv}>
                  Export CSV
                </button>
              </div>
            </div>
            <div className="space-y-2">
              {cargoItems.map((item) => (
                <div className="border border-[#c9c9c9] bg-white p-3 text-sm" key={item.id}>
                  <div className="flex items-center justify-between gap-2">
                    <span className="flex items-center gap-2 font-semibold">
                      <span className="h-3 w-3" style={{ backgroundColor: item.color }} />
                      {item.name}
                    </span>
                    <button className="text-[#8d1f2d]" type="button" onClick={() => removeCargo(item.id)}>
                      remove
                    </button>
                  </div>
                  <p className="mt-1 text-xs text-[#666]">
                    {item.length} x {item.width} x {item.height} mm, {item.weight} kg, qty {item.quantity}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </aside>

        <section className="relative min-h-[650px] bg-[#d8d8d8]">
          <div className="absolute left-5 top-5 z-10 rounded bg-white/75 px-4 py-3 text-sm shadow">
            <strong>{selectedContainer.label}</strong>
            <div>
              {selectedContainer.length.toLocaleString()} x {selectedContainer.width.toLocaleString()} x {selectedContainer.height.toLocaleString()} mm
            </div>
          </div>
          <div className="absolute right-6 top-5 z-10 grid grid-cols-3 gap-5 rounded bg-white/70 px-5 py-3 text-center text-sm shadow">
            <div>
              <strong>Weight</strong>
              <div>{result.usedWeight.toLocaleString()} kg</div>
            </div>
            <div>
              <strong>Volume</strong>
              <div>{formatCubicMeters(result.usedVolume)}</div>
            </div>
            <div>
              <strong>Free meters</strong>
              <div>{(Math.max(0, selectedContainer.length - (result.placed.at(-1)?.x ?? 0)) / 1000).toFixed(2)} m</div>
            </div>
          </div>
          <ContainerScene activeLayerId="all" boxes={hasCalculated ? result.placed : []} container={selectedContainer} viewMode="iso" />
          <button
            className="absolute bottom-10 right-10 grid h-32 w-32 place-items-center rounded-full border-8 border-white bg-[#686868] text-3xl font-semibold text-white shadow-xl hover:bg-[#4c4c4c]"
            type="button"
            onClick={calculate}
          >
            Load
          </button>
        </section>

        <aside className="border-l border-[#bcbcbc] bg-[#ececec] max-xl:col-span-2 max-lg:col-span-1">
          <div className="flex h-12 items-center justify-center border-b border-[#bebebe] bg-[#d0d0d0] text-2xl">☆</div>
          <div className="max-h-[520px] overflow-auto">
            {containers.map((container) => (
              <button
                className={`block w-full border-b border-[#d1d1d1] px-3 py-4 text-left hover:bg-white ${container.id === selectedContainer.id ? 'bg-white' : ''}`}
                key={container.id}
                type="button"
                onClick={() => setSelectedContainerId(container.id)}
              >
                <div className="mb-2 ml-auto h-6 w-28 bg-[#5f5f5f]" />
                <strong>{container.label}</strong>
                <p className="text-xs">
                  {container.length.toLocaleString()} x {container.width.toLocaleString()} x {container.height.toLocaleString()} mm {container.maxWeight.toLocaleString()} kg
                </p>
              </button>
            ))}
          </div>
          <div className="m-3 border border-[#c9c9c9] bg-white p-3 text-sm">
            <h2 className="font-bold">Results</h2>
            <p>Loaded: {result.placedCount} / {result.totalCargoCount}</p>
            <p>Volume utilization: {result.volumeUtilization.toFixed(1)}%</p>
            <p>Weight utilization: {result.weightUtilization.toFixed(1)}%</p>
            <p>Container volume: {formatCubicMeters(getContainerVolume(selectedContainer))}</p>
            {result.unplaced.length > 0 && (
              <div className="mt-3 border-t pt-2">
                <strong>Unloaded cargo</strong>
                {result.unplaced.map((item) => (
                  <p className="text-xs" key={item.cargoId}>
                    {item.name} x {item.quantity}: {item.reason}
                  </p>
                ))}
              </div>
            )}
          </div>
        </aside>
      </section>
    </main>
  )
}

export default App
