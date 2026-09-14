import type { FormEvent } from 'react'
import type { CargoForm } from '../workbenchHelpers'

type EditCargoDialogLabels = {
  editCargoTitle: string
  closeEditDialog: string
  name: string
  label: string
  length: string
  width: string
  height: string
  weight: string
  quantity: string
  color: string
  rotate: string
  stackable: string
  groundOnly: string
  maxStackLayers: string
  cancel: string
  saveChanges: string
}

type EditCargoDialogProps = {
  cargoName: string
  form: CargoForm
  labels: EditCargoDialogLabels
  onChange: (updater: (current: CargoForm) => CargoForm) => void
  onUpdateNumber: (field: keyof Pick<CargoForm, 'length' | 'width' | 'height' | 'weight' | 'quantity'>, value: string) => void
  onUpdateMaxStackLayers: (value: string) => void
  onClose: () => void
  onSubmit: (event: FormEvent) => void
}

export function EditCargoDialog({
  cargoName,
  form,
  labels: t,
  onChange,
  onUpdateNumber,
  onUpdateMaxStackLayers,
  onClose,
  onSubmit,
}: EditCargoDialogProps) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/45 p-4">
      <form className="w-full max-w-[560px] rounded-xl bg-white p-5 shadow-2xl" onSubmit={onSubmit} aria-label={t.editCargoTitle}>
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <h3 className="text-xl font-bold text-slate-900">{t.editCargoTitle}</h3>
            <p className="mt-1 text-sm text-slate-500">{cargoName}</p>
          </div>
          <button className="border border-slate-300 bg-white px-3 py-1 text-sm font-semibold" type="button" onClick={onClose} aria-label={t.closeEditDialog}>
            ×
          </button>
        </div>
        <div className="grid grid-cols-[1fr_72px] gap-3">
          <label className="field-label">{t.name}<input className="field-input mt-1" value={form.name} onChange={(event) => onChange((current) => ({ ...current, name: event.target.value }))} /></label>
          <label className="field-label">{t.label}<input className="field-input mt-1 text-center font-bold" maxLength={12} value={form.label ?? ''} onChange={(event) => onChange((current) => ({ ...current, label: event.target.value.toUpperCase() }))} /></label>
        </div>
        <div className="mt-3 grid grid-cols-3 gap-3">
          <label className="field-label">{t.length}<input className="field-input mt-1" type="number" value={form.length} onChange={(event) => onUpdateNumber('length', event.target.value)} /></label>
          <label className="field-label">{t.width}<input className="field-input mt-1" type="number" value={form.width} onChange={(event) => onUpdateNumber('width', event.target.value)} /></label>
          <label className="field-label">{t.height}<input className="field-input mt-1" type="number" value={form.height} onChange={(event) => onUpdateNumber('height', event.target.value)} /></label>
        </div>
        <div className="mt-3 grid grid-cols-[1fr_1fr_72px] gap-3">
          <label className="field-label">{t.weight}<input className="field-input mt-1" type="number" value={form.weight} onChange={(event) => onUpdateNumber('weight', event.target.value)} /></label>
          <label className="field-label">{t.quantity}<input className="field-input mt-1" type="number" value={form.quantity} onChange={(event) => onUpdateNumber('quantity', event.target.value)} /></label>
          <label className="field-label">{t.color}<input className="mt-1 h-10 w-full border border-[#a8a8a8]" type="color" value={form.color} onChange={(event) => onChange((current) => ({ ...current, color: event.target.value }))} /></label>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
          <label className="flex items-center gap-2"><input checked={form.canRotate} type="checkbox" onChange={(event) => onChange((current) => ({ ...current, canRotate: event.target.checked }))} />{t.rotate}</label>
          <label className="flex items-center gap-2"><input checked={form.stackable} type="checkbox" onChange={(event) => onChange((current) => ({ ...current, stackable: event.target.checked, maxStackLayers: event.target.checked ? current.maxStackLayers : undefined }))} />{t.stackable}</label>
          <label className="flex items-center gap-2"><input checked={form.groundOnly ?? false} type="checkbox" onChange={(event) => onChange((current) => ({ ...current, groundOnly: event.target.checked }))} />{t.groundOnly}</label>
        </div>
        {form.stackable && (
          <label className="field-label mt-3 block" data-testid="edit-max-stack-layers-field">
            {t.maxStackLayers}
            <input
              className="field-input mt-1"
              type="number"
              min={1}
              value={form.maxStackLayers ?? ''}
              onChange={(event) => onUpdateMaxStackLayers(event.target.value)}
            />
          </label>
        )}
        <div className="mt-5 flex justify-end gap-2">
          <button className="border border-slate-300 bg-white px-4 py-2 text-sm font-semibold" type="button" onClick={onClose}>
            {t.cancel}
          </button>
          <button className="archive-button px-4 py-2 text-sm" type="submit">
            {t.saveChanges}
          </button>
        </div>
      </form>
    </div>
  )
}
