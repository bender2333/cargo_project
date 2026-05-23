import { useEffect, useState } from 'react'
import type { Locale } from '../types'
import type { ManualPlacedBox } from '../lib/manualPlacement'

const T = {
  en: {
    title: 'Selected box',
    none: 'Click a box in the scene to fine-tune its position.',
    size: 'Size',
    position: 'Position (mm)',
    apply: 'Apply',
    cancel: 'Cancel',
    centre: 'Centre on floor',
    pinFront: 'Pin to front',
    pinBack: 'Pin to back',
    pinLeft: 'Pin to left wall',
    pinRight: 'Pin to right wall',
    grounded: 'Drop to floor',
    rotate: 'Rotate',
    delete: 'Delete',
  },
  zh: {
    title: '已选中货物',
    none: '点选 3D 场景中的箱体以微调位置。',
    size: '尺寸',
    position: '位置 (mm)',
    apply: '应用',
    cancel: '取消',
    centre: '居中柜底',
    pinFront: '靠前',
    pinBack: '靠后',
    pinLeft: '靠左',
    pinRight: '靠右',
    grounded: '落到地面',
    rotate: '旋转',
    delete: '删除',
  },
} as const

type Props = {
  selected: ManualPlacedBox | null
  container: { length: number; width: number; height: number }
  locale: Locale
  onMove: (x: number, y: number, z: number) => void
  onRotate: () => void
  onDelete: () => void
}

export function ManualPrecisePanel({ selected, container, locale, onMove, onRotate, onDelete }: Props) {
  const t = T[locale]
  const [draft, setDraft] = useState<{ x: string; y: string; z: string }>({ x: '0', y: '0', z: '0' })

  useEffect(() => {
    if (!selected) return
    setDraft({
      x: String(Math.round(selected.x)),
      y: String(Math.round(selected.y)),
      z: String(Math.round(selected.z)),
    })
  }, [selected])

  if (!selected) {
    return (
      <div className="rounded-xl border border-[#e5e7eb] bg-white p-3 text-xs text-[#64748b]" data-testid="manual-precise-panel-empty">
        <h3 className="mb-1 text-sm font-bold text-[#0f172a]">{t.title}</h3>
        <p>{t.none}</p>
      </div>
    )
  }

  const commit = () => {
    const x = Number(draft.x)
    const y = Number(draft.y)
    const z = Number(draft.z)
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) return
    onMove(x, y, z)
  }

  const centre = () => onMove((container.length - selected.length) / 2, (container.width - selected.width) / 2, selected.z)
  const pinFront = () => onMove(0, selected.y, selected.z)
  const pinBack = () => onMove(container.length - selected.length, selected.y, selected.z)
  const pinLeft = () => onMove(selected.x, 0, selected.z)
  const pinRight = () => onMove(selected.x, container.width - selected.width, selected.z)
  const grounded = () => onMove(selected.x, selected.y, 0)

  return (
    <div className="rounded-xl border border-[#e5e7eb] bg-white p-3 text-xs text-[#475569]" data-testid="manual-precise-panel">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-sm font-bold text-[#0f172a]">{t.title}: <span className="inline-block rounded bg-[#222] px-1.5 py-0.5 text-[10px] text-white">{selected.label}</span></h3>
        <span className="text-[10px]">{t.size}: {selected.length}×{selected.width}×{selected.height}</span>
      </div>
      <div className="mb-2 grid grid-cols-3 gap-2" data-testid="manual-precise-fields">
        {(['x', 'y', 'z'] as const).map((axis) => (
          <label key={axis} className="flex flex-col gap-0.5">
            <span className="text-[10px] uppercase tracking-wider text-[#94a3b8]">{axis.toUpperCase()}</span>
            <input
              type="number"
              className="rounded border border-[#cbd5e1] bg-white p-1 font-mono"
              data-testid={`manual-precise-input-${axis}`}
              value={draft[axis]}
              onChange={(event) => setDraft((cur) => ({ ...cur, [axis]: event.target.value }))}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault()
                  commit()
                }
              }}
            />
          </label>
        ))}
      </div>
      <div className="mb-2 flex flex-wrap gap-2">
        <button type="button" className="archive-button success" data-testid="manual-precise-apply" onClick={commit}>{t.apply}</button>
        <button type="button" className="archive-button" data-testid="manual-precise-centre" onClick={centre}>{t.centre}</button>
        <button type="button" className="archive-button" onClick={pinFront}>{t.pinFront}</button>
        <button type="button" className="archive-button" onClick={pinBack}>{t.pinBack}</button>
        <button type="button" className="archive-button" onClick={pinLeft}>{t.pinLeft}</button>
        <button type="button" className="archive-button" onClick={pinRight}>{t.pinRight}</button>
        <button type="button" className="archive-button" onClick={grounded}>{t.grounded}</button>
      </div>
      <div className="flex gap-2">
        <button type="button" className="archive-button" data-testid="manual-precise-rotate" onClick={onRotate}>{t.rotate}</button>
        <button type="button" className="archive-button" data-testid="manual-precise-delete" onClick={onDelete}>{t.delete}</button>
      </div>
    </div>
  )
}
