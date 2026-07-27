import type { FormEvent, Ref, Dispatch, SetStateAction } from 'react'
import type { CargoItem, ContainerSpec, LoadingMode, Locale, PackingResult } from '../types'
import type { PlacementSettings } from '../lib/placementSettings'
import { DEFAULT_PLACEMENT_SETTINGS } from '../lib/placementSettings'
import type { PackingSessionDispatchAction } from '../lib/packingSession'
import { containers } from '../data/containers'

type CargoForm = Omit<CargoItem, 'id'>
type NavTarget = 'overview' | 'report' | 'cargo' | 'container' | 'history' | 'cargo-library' | 'template-manager' | 'users'

type SidebarLabels = {
  nav: string[]
  closeMenu: string
  menu: string
  shipment: string
  placementSettingsClose: string
  placementSettings: string
  allowOverhang: string
  settingsStored: string
  minSupport: string
  warnSupport: string
  resetPlacementSettings: string
  snapSettingsClose: string
  snapSettings: string
  snapEnabled: string
  snapDisabled: string
  gridSnap: string
  gridSnapOff: string
  edgeSnap: string
  edgeSnapOff: string
  surfaceSnap: string
  zSnap: string
  gridStep: string
  edgeTolerance: string
  zStep: string
  group: string
  note: string
  containerConfig: string
  expand: string
  collapse: string
  containerType: string
  customContainer: string
  length: string
  width: string
  height: string
  maxWeight: string
  doorGap: string
  topGap: string
  sideGap: string
  unitParameters: string
  name: string
  label: string
  weight: string
  quantity: string
  color: string
  rotate: string
  stackable: string
  groundOnly: string
  maxStackLayers: string
  add: string
  ruleSummary: string
  selectableRules: string
  volumeMode: string
  weightMode: string
  quantityMode: string
  inputMode: string
  globalMaxStackLayers: string
  hardRules: string
  boundaryRule: string
  payloadRule: string
  supportRule: string
  maxStackLayersUnlimited: string
  cargoItems: string
  dragCargo: string
  editCargo: string
  deleteCargo: string
  qty: string
  maxStackLayersOwn: string
  maxStackLayersGlobal: string
}

export type PackingSidebarProps = {
  // layout
  sidebarCollapsed: boolean
  setSidebarCollapsed: Dispatch<SetStateAction<boolean>>
  workspaceMaximized: boolean
  // menu
  menuOpen: boolean
  setMenuOpen: Dispatch<SetStateAction<boolean>>
  currentUser: { role: string } | null
  activateNav: (target: NavTarget) => void
  // shipment
  shipmentName: string
  dispatchPackingSession: Dispatch<PackingSessionDispatchAction>
  // placement settings
  placementSettingsOpen: boolean
  setPlacementSettingsOpen: Dispatch<SetStateAction<boolean>>
  snapSettingsOpen: boolean
  setSnapSettingsOpen: Dispatch<SetStateAction<boolean>>
  placementSettings: PlacementSettings
  setPlacementSettings: Dispatch<SetStateAction<PlacementSettings>>
  // container
  containerRef: Ref<HTMLElement>
  containerCollapsed: boolean
  setContainerCollapsed: Dispatch<SetStateAction<boolean>>
  containerSummary: string
  selectedContainer: ContainerSpec
  selectedContainerId: string
  customContainers: ContainerSpec[]
  customContainer: ContainerSpec
  selectContainerById: (containerId: string) => void
  setShowCustomContainerDialog: Dispatch<SetStateAction<boolean>>
  updateContainerNumber: (field: 'length' | 'width' | 'height' | 'maxWeight' | 'doorGap' | 'topGap' | 'sideGap', value: string) => void
  locale: Locale
  // cargo form
  cargoRef: Ref<HTMLFormElement>
  form: CargoForm
  setForm: Dispatch<SetStateAction<CargoForm>>
  addCargo: (event: FormEvent) => void
  updateNumber: (field: keyof Pick<CargoForm, 'length' | 'width' | 'height' | 'weight' | 'quantity'>, value: string) => void
  updateMaxStackLayers: (value: string) => void
  // loading rules
  rulesCollapsed: boolean
  setRulesCollapsed: Dispatch<SetStateAction<boolean>>
  loadingMode: LoadingMode
  defaultMaxStackLayers: number | undefined
  updateDefaultMaxStackLayers: (value: string) => void
  loadingModeLabels: Record<LoadingMode, string>
  // cargo list
  displayCargoItems: CargoItem[]
  activeResult: PackingResult
  activeSelectedBoxId: string | null
  selectCargoResultBox: (cargoId: string) => void
  openEditCargo: (cargo: CargoItem) => void
  deleteCargo: (cargoId: string) => void
  setDraggedCargoId: Dispatch<SetStateAction<string | null>>
  reorderCargo: (targetCargoId: string) => void
  // labels
  t: SidebarLabels
}

export function PackingSidebar({
  sidebarCollapsed, setSidebarCollapsed,
  workspaceMaximized,
  menuOpen, setMenuOpen,
  currentUser, activateNav,
  shipmentName, dispatchPackingSession,
  placementSettingsOpen, setPlacementSettingsOpen,
  snapSettingsOpen, setSnapSettingsOpen,
  placementSettings, setPlacementSettings,
  containerRef, containerCollapsed, setContainerCollapsed,
  containerSummary, selectedContainer, selectedContainerId,
  customContainers, customContainer,
  selectContainerById, setShowCustomContainerDialog, updateContainerNumber,
  locale,
  cargoRef, form, setForm, addCargo, updateNumber, updateMaxStackLayers,
  rulesCollapsed, setRulesCollapsed,
  loadingMode, defaultMaxStackLayers, updateDefaultMaxStackLayers, loadingModeLabels,
  displayCargoItems, activeResult, activeSelectedBoxId,
  selectCargoResultBox, openEditCargo, deleteCargo,
  setDraggedCargoId, reorderCargo,
  t,
}: PackingSidebarProps) {
  return (
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
              onChange={(event) => dispatchPackingSession({
                type: 'shipmentNameChanged',
                shipmentName: event.target.value,
              })}
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
                    {(
                      [
                        ['gridStepMm', t.gridStep, 1, 1000],
                        ['edgeToleranceMm', t.edgeTolerance, 0, 1000],
                        ['zStepMm', t.zStep, 1, 1000],
                      ] as const
                    ).map(([key, label, min, max]) => (
                      <label key={key} className="flex flex-col gap-1">
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
                  <select className="field-input mt-1" value={selectedContainerId} onChange={(event) => selectContainerById(event.target.value)}>
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
                    <button className={`block w-full border-b border-[#d1d1d1] px-3 py-3 text-left hover:bg-white cursor-pointer ${container.id === selectedContainer.id ? 'bg-white' : 'bg-[#f8fafc]'}`} key={container.id} type="button" onClick={() => selectContainerById(container.id)}>
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
                    dispatchPackingSession({
                      type: 'loadingModeChanged',
                      loadingMode: event.target.value as LoadingMode,
                    })
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
                  className={`w-full border p-3 text-left text-sm ${activeResult.placed.some((box) => box.cargoId === item.id && box.id === activeSelectedBoxId) ? 'border-[#f3b21a] bg-[#fff7df]' : 'border-[#c9c9c9] bg-white'}`}
                  key={item.id}
                  draggable
                  data-testid="cargo-list-item"
                  onDragStart={() => setDraggedCargoId(item.id)}
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={() => reorderCargo(item.id)}
                >
                  <div className="flex items-center justify-between gap-2">
                    <button className="flex min-w-0 flex-1 items-center gap-2 text-left font-semibold" type="button" onClick={() => selectCargoResultBox(item.id)}>
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
  )
}
