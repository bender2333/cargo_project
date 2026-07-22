import { useEffect, useState } from 'react'
import { readRecentServerLogs } from '../api/debugLogs'
import type { CargoDebugSnapshot } from '../lib/debugSnapshot'

type DebugPanelProps = {
  snapshot: CargoDebugSnapshot
}

const STORAGE_KEY = 'cargo_debug_panel'

function readInitialOpen(): boolean {
  if (typeof window === 'undefined') return false
  const params = new URLSearchParams(window.location.search)
  if (params.get('debug') === '1') return true
  try {
    return window.localStorage.getItem(STORAGE_KEY) === 'open'
  } catch {
    return false
  }
}

export function DebugPanel({ snapshot }: DebugPanelProps) {
  const [open, setOpen] = useState<boolean>(readInitialOpen())
  const [serverLogs, setServerLogs] = useState<string[]>([])
  const [logsError, setLogsError] = useState<string | null>(null)

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.ctrlKey && event.shiftKey && (event.key === 'D' || event.key === 'd')) {
        event.preventDefault()
        setOpen((current) => {
          const next = !current
          try {
            window.localStorage.setItem(STORAGE_KEY, next ? 'open' : 'closed')
          } catch {
            // ignore quota errors
          }
          return next
        })
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') return
    ;(window as unknown as { __cargoSnapshot?: () => CargoDebugSnapshot }).__cargoSnapshot = () => snapshot
  }, [snapshot])

  if (!open) {
    return (
      <button
        type="button"
        data-testid="debug-toggle"
        className="fixed bottom-4 right-4 z-50 rounded-full border border-slate-400 bg-white px-3 py-1 text-xs font-semibold text-slate-700 shadow"
        onClick={() => setOpen(true)}
      >
        Debug
      </button>
    )
  }

  const copySnapshot = async () => {
    try {
      await navigator.clipboard.writeText(JSON.stringify(snapshot, null, 2))
    } catch {
      // ignore
    }
  }

  const downloadSnapshot = () => {
    const blob = new Blob([JSON.stringify(snapshot, null, 2)], { type: 'application/json;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = 'cargo-debug-snapshot.json'
    link.click()
    URL.revokeObjectURL(url)
  }

  const fetchLogs = async () => {
    setLogsError(null)
    try {
      setServerLogs(await readRecentServerLogs())
    } catch (err) {
      setLogsError(err instanceof Error ? err.message : String(err))
    }
  }

  return (
    <div
      data-testid="debug-panel"
      className="fixed bottom-4 right-4 z-50 max-h-[70vh] w-[420px] overflow-auto rounded-xl border border-slate-300 bg-white p-3 text-xs text-slate-800 shadow-2xl"
    >
      <div className="mb-2 flex items-center gap-2">
        <strong>Debug</strong>
        <span className="text-slate-500">(Ctrl+Shift+D 切换)</span>
        <button
          type="button"
          className="ml-auto rounded border border-slate-300 px-2 py-0.5 text-xs"
          onClick={copySnapshot}
        >
          Copy
        </button>
        <button
          type="button"
          className="rounded border border-slate-300 px-2 py-0.5 text-xs"
          data-testid="debug-download-snapshot"
          onClick={downloadSnapshot}
        >
          Download
        </button>
        <button
          type="button"
          className="rounded border border-slate-300 px-2 py-0.5 text-xs"
          onClick={() => setOpen(false)}
        >
          ×
        </button>
      </div>
      <table className="w-full text-left">
        <tbody>
          <tr><td className="pr-2 text-slate-500">User</td><td>{snapshot.user?.username ?? '-'}</td></tr>
          <tr><td className="pr-2 text-slate-500">Role</td><td>{snapshot.user?.role ?? '-'}</td></tr>
          <tr><td className="pr-2 text-slate-500">Locale</td><td>{snapshot.locale}</td></tr>
          <tr><td className="pr-2 text-slate-500">Mode</td><td>{snapshot.mode.placement} / {snapshot.mode.workspaceView}</td></tr>
          <tr><td className="pr-2 text-slate-500">Container</td><td>{snapshot.container.selected.label} ({snapshot.container.selected.length}×{snapshot.container.selected.width}×{snapshot.container.selected.height})</td></tr>
          <tr><td className="pr-2 text-slate-500">Loading</td><td>{snapshot.loadingMode}</td></tr>
          <tr><td className="pr-2 text-slate-500">Cargo items</td><td>{snapshot.summary.cargoItemsCount}</td></tr>
          <tr><td className="pr-2 text-slate-500">Placed</td><td>{snapshot.summary.placedCount} / {snapshot.summary.totalCargoCount} ({snapshot.summary.layersCount} layers)</td></tr>
          <tr><td className="pr-2 text-slate-500">Manual boxes</td><td>{snapshot.summary.manualBoxesCount}</td></tr>
          <tr><td className="pr-2 text-slate-500">History</td><td>{snapshot.summary.historyCount}</td></tr>
        </tbody>
      </table>
      {snapshot.recentErrors.length > 0 && (
        <details className="mt-2" open>
          <summary className="cursor-pointer font-semibold text-rose-600">Recent errors ({snapshot.recentErrors.length})</summary>
          <ul className="mt-1 max-h-32 list-disc space-y-1 overflow-auto pl-5 text-rose-700">
            {snapshot.recentErrors.slice(-10).map((line, idx) => (
              <li key={idx}>{line}</li>
            ))}
          </ul>
        </details>
      )}
      {snapshot.user?.role === 'admin' && (
        <div className="mt-2 border-t border-slate-200 pt-2">
          <button
            type="button"
            data-testid="debug-fetch-logs"
            className="rounded border border-slate-300 px-2 py-0.5 text-xs"
            onClick={fetchLogs}
          >
            Fetch server logs
          </button>
          {logsError && <span className="ml-2 text-rose-600">{logsError}</span>}
          {serverLogs.length > 0 && (
            <pre className="mt-1 max-h-48 overflow-auto whitespace-pre-wrap bg-slate-50 p-2 text-[10px] leading-snug">
              {serverLogs.join('\n')}
            </pre>
          )}
        </div>
      )}
    </div>
  )
}
