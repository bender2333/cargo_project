import { useState } from 'react'
import type { FormEvent } from 'react'
import { createClientId } from '../lib/clientId'
import { excelStyleLabel } from '../lib/excelStyleLabel'
import type { CargoItem, Locale } from '../types'

type CargoLibraryDraft = Omit<CargoItem, 'id' | 'quantity'>

export type CargoLibraryPageLabels = {
  cargoLibrary: string
  backToWorkbench: string
  name: string
  group: string
  length: string
  width: string
  height: string
  weight: string
  color: string
  rotate: string
  stackable: string
  groundOnly: string
  maxStackLayers: string
  cancel: string
  cargoLibraryEmpty: string
  cargoLibrarySave: string
  cargoLibraryUpdate: string
  cargoLibraryUse: string
  cargoLibraryEdit: string
  cargoLibraryDelete: string
  cargoLibraryNoticeSaved: string
  cargoLibraryNoticeUpdated: string
  cargoLibraryNoticeDeleted: string
  cargoLibraryLoadFailed: string
  cargoLibraryRetry: string
}

export type CargoLibraryPageProps = {
  locale: Locale
  labels: CargoLibraryPageLabels
  items: readonly CargoItem[]
  loadFailed: boolean
  onRetry: () => void | Promise<void>
  onCreate: (item: CargoItem) => void | Promise<void>
  onUpdate: (id: string, item: CargoItem) => void | Promise<void>
  onDelete: (id: string) => void | Promise<void>
  onUseCargo: (item: CargoItem) => void
  onBack: () => void
}

function createEmptyDraft(): CargoLibraryDraft {
  return {
    name: 'Carton B',
    label: 'B',
    length: 400,
    width: 500,
    height: 600,
    weight: 24,
    color: '#0ea5e9',
    canRotate: true,
    stackable: true,
    maxStackLayers: undefined,
    groundOnly: false,
  }
}

function draftFromCargo(item: CargoItem): CargoLibraryDraft {
  return {
    name: item.name,
    label: item.label,
    length: item.length,
    width: item.width,
    height: item.height,
    weight: item.weight,
    color: item.color,
    canRotate: item.canRotate,
    stackable: item.stackable,
    maxStackLayers: item.maxStackLayers,
    groundOnly: item.groundOnly ?? false,
  }
}

export function CargoLibraryPage({
  locale,
  labels,
  items,
  loadFailed,
  onRetry,
  onCreate,
  onUpdate,
  onDelete,
  onUseCargo,
  onBack,
}: CargoLibraryPageProps) {
  const [draft, setDraft] = useState<CargoLibraryDraft>(createEmptyDraft)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [notice, setNotice] = useState('')

  const resetDraft = () => {
    setEditingId(null)
    setDraft(createEmptyDraft())
  }

  const updateNumber = (
    field: keyof Pick<CargoLibraryDraft, 'length' | 'width' | 'height' | 'weight'>,
    value: string,
  ) => {
    setDraft((current) => ({ ...current, [field]: Number(value) || 0 }))
  }

  const updateMaxStackLayers = (value: string) => {
    const parsed = Math.floor(Number(value) || 0)
    setDraft((current) => ({ ...current, maxStackLayers: parsed > 0 ? parsed : undefined }))
  }

  const cargoFromDraft = (): CargoItem => ({
    ...draft,
    id: editingId ?? createClientId(),
    name: draft.name.trim() || (locale === 'zh' ? '库货物' : 'Library cargo'),
    label: (draft.label || excelStyleLabel(items.length)).toUpperCase(),
    quantity: 1,
    maxStackLayers: draft.stackable ? draft.maxStackLayers : undefined,
    groundOnly: draft.groundOnly ?? false,
  })

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    const item = cargoFromDraft()
    setNotice('')
    try {
      if (editingId) {
        await onUpdate(editingId, item)
        setNotice(labels.cargoLibraryNoticeUpdated)
      } else {
        await onCreate(item)
        setNotice(labels.cargoLibraryNoticeSaved)
      }
      resetDraft()
    } catch (error) {
      console.error(error)
      alert(locale === 'zh' ? '保存货物失败' : 'Failed to save cargo')
    }
  }

  const handleEdit = (item: CargoItem) => {
    setEditingId(item.id)
    setDraft(draftFromCargo(item))
  }

  const handleDelete = async (id: string) => {
    setNotice('')
    try {
      await onDelete(id)
      setNotice(labels.cargoLibraryNoticeDeleted)
      if (editingId === id) resetDraft()
    } catch (error) {
      console.error(error)
      alert(locale === 'zh' ? '删除货物失败' : 'Failed to delete cargo')
    }
  }

  return (
    <section className="archive-card overflow-hidden p-[18px]" data-testid="cargo-library-page">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl font-bold">{labels.cargoLibrary}</h2>
        <button className="archive-button secondary" type="button" onClick={onBack}>{labels.backToWorkbench}</button>
      </div>
      <div className="rounded-lg border border-[#c6c6c6] bg-white p-4" data-testid="cargo-library">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-lg font-bold">{labels.cargoLibrary}</h3>
          {notice && <span className="text-xs font-semibold text-[#047857]">{notice}</span>}
        </div>
        <form className="grid gap-2 text-sm md:grid-cols-6" onSubmit={(event) => void handleSubmit(event)}>
          <label>{labels.name}<input className="field-input mt-1" value={draft.name} onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))} /></label>
          <label>{labels.group}<input className="field-input mt-1" maxLength={12} value={draft.label ?? ''} onChange={(event) => setDraft((current) => ({ ...current, label: event.target.value.toUpperCase() }))} /></label>
          <label>{labels.length}<input className="field-input mt-1" type="number" value={draft.length} onChange={(event) => updateNumber('length', event.target.value)} /></label>
          <label>{labels.width}<input className="field-input mt-1" type="number" value={draft.width} onChange={(event) => updateNumber('width', event.target.value)} /></label>
          <label>{labels.height}<input className="field-input mt-1" type="number" value={draft.height} onChange={(event) => updateNumber('height', event.target.value)} /></label>
          <label>{labels.weight}<input className="field-input mt-1" type="number" value={draft.weight} onChange={(event) => updateNumber('weight', event.target.value)} /></label>
          <label>{labels.color}<input className="mt-1 h-10 w-full border border-[#aaa] bg-white" type="color" value={draft.color} onChange={(event) => setDraft((current) => ({ ...current, color: event.target.value }))} /></label>
          <label className="flex items-center gap-2 pt-7"><input checked={draft.canRotate} type="checkbox" onChange={(event) => setDraft((current) => ({ ...current, canRotate: event.target.checked }))} />{labels.rotate}</label>
          <label className="flex items-center gap-2 pt-7"><input checked={draft.stackable} type="checkbox" onChange={(event) => setDraft((current) => ({ ...current, stackable: event.target.checked, maxStackLayers: event.target.checked ? current.maxStackLayers : undefined }))} />{labels.stackable}</label>
          <label className="flex items-center gap-2 pt-7"><input checked={draft.groundOnly ?? false} type="checkbox" onChange={(event) => setDraft((current) => ({ ...current, groundOnly: event.target.checked }))} />{labels.groundOnly}</label>
          {draft.stackable && (
            <label>{labels.maxStackLayers}<input className="field-input mt-1" min={1} type="number" value={draft.maxStackLayers ?? ''} onChange={(event) => updateMaxStackLayers(event.target.value)} /></label>
          )}
          <div className="flex items-end gap-2 md:col-span-2">
            <button className="archive-button success w-full" data-testid="cargo-library-add" type="submit">
              {editingId ? labels.cargoLibraryUpdate : labels.cargoLibrarySave}
            </button>
            {editingId && (
              <button className="archive-button secondary" type="button" onClick={resetDraft}>
                {labels.cancel}
              </button>
            )}
          </div>
        </form>
        {loadFailed ? (
          <div className="mt-3 flex items-center justify-between gap-3 border border-red-300 bg-red-50 p-3 text-sm text-red-700" data-testid="cargo-library-load-error">
            <span>{labels.cargoLibraryLoadFailed}</span>
            <button className="archive-button secondary" type="button" onClick={() => void onRetry()}>
              {labels.cargoLibraryRetry}
            </button>
          </div>
        ) : items.length === 0 ? (
          <p className="mt-3 text-sm text-[#64748b]" data-testid="cargo-library-empty-state">{labels.cargoLibraryEmpty}</p>
        ) : (
          <div className="mt-4 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
            {items.map((item) => (
              <article className="rounded border border-[#d1d5db] bg-[#f8fafc] p-3 text-sm" data-testid={`cargo-library-row-${item.id}`} key={item.id}>
                <div className="mb-2 flex items-start gap-2">
                  <span className="inline-flex h-8 w-8 items-center justify-center rounded font-bold text-white" style={{ backgroundColor: item.color }}>{item.label}</span>
                  <div>
                    <strong>{item.name}</strong>
                    <p className="text-xs text-[#64748b]">{item.length} x {item.width} x {item.height} mm · {item.weight} kg</p>
                    <p className="text-xs text-[#64748b]">{item.canRotate ? labels.rotate : `${labels.rotate}: off`} · {item.stackable ? labels.stackable : `${labels.stackable}: off`}{item.maxStackLayers ? ` · ${labels.maxStackLayers}: ${item.maxStackLayers}` : ''}{item.groundOnly ? ` · ${labels.groundOnly}` : ''}</p>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button className="archive-button px-2 py-1 text-xs" data-testid={`cargo-library-use-${item.id}`} type="button" onClick={() => onUseCargo(item)}>{labels.cargoLibraryUse}</button>
                  <button className="archive-button secondary px-2 py-1 text-xs" data-testid={`cargo-library-edit-${item.id}`} type="button" onClick={() => handleEdit(item)}>{labels.cargoLibraryEdit}</button>
                  <button className="archive-button px-2 py-1 text-xs text-red-700" data-testid={`cargo-library-delete-${item.id}`} type="button" onClick={() => void handleDelete(item.id)}>{labels.cargoLibraryDelete}</button>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    </section>
  )
}
