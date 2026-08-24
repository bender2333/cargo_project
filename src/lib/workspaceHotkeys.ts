export type WorkspaceHotkeyCommand =
  | { type: 'undo' }
  | { type: 'redo' }
  | { type: 'rotate'; direction: 'right' | 'down' }
  | { type: 'delete'; boxId: string }
  | { type: 'nudge'; dx: number; dy: number; dz: number }
  | { type: 'clearSelection' }
  | { type: 'toggleClearance' }
  | { type: 'exitMaximize' }

export type WorkspaceHotkeyInput = {
  key: string
  shift: boolean
  meta: boolean
  ctrl: boolean
  nav: string
  placementMode: 'auto' | 'manual'
  workspaceContains: boolean
  maximized: boolean
  selectedBoxId: string | null
  fromEditableField: boolean
}

function nudgeStep(input: WorkspaceHotkeyInput) {
  if (input.shift) return 100
  if (input.ctrl || input.meta) return 1
  return 10
}

export function resolveWorkspaceHotkey(input: WorkspaceHotkeyInput): WorkspaceHotkeyCommand | null {
  if (input.fromEditableField) return null
  if (input.nav !== 'overview' || !input.workspaceContains) return null

  if (input.key === 'Escape') {
    if (input.maximized) return { type: 'exitMaximize' }
    if (input.placementMode === 'manual') return { type: 'clearSelection' }
    return null
  }

  if (input.key === 'm' || input.key === 'M') return { type: 'toggleClearance' }

  if (input.placementMode !== 'manual') return null

  const isMeta = input.ctrl || input.meta
  if (isMeta && (input.key === 'z' || input.key === 'Z')) {
    return input.shift ? { type: 'redo' } : { type: 'undo' }
  }
  if (isMeta && (input.key === 'y' || input.key === 'Y')) return { type: 'redo' }

  const boxId = input.selectedBoxId
  if (!boxId) return null

  if (input.key === 'Delete' || input.key === 'Backspace') return { type: 'delete', boxId }
  if (input.key === 'r' || input.key === 'R') {
    return { type: 'rotate', direction: input.shift ? 'down' : 'right' }
  }

  const step = nudgeStep(input)
  if (input.key === 'ArrowLeft') return { type: 'nudge', dx: -step, dy: 0, dz: 0 }
  if (input.key === 'ArrowRight') return { type: 'nudge', dx: step, dy: 0, dz: 0 }
  if (input.key === 'ArrowDown') return { type: 'nudge', dx: 0, dy: -step, dz: 0 }
  if (input.key === 'ArrowUp') return { type: 'nudge', dx: 0, dy: step, dz: 0 }
  if (input.key === 'PageUp') return { type: 'nudge', dx: 0, dy: 0, dz: step }
  if (input.key === 'PageDown') return { type: 'nudge', dx: 0, dy: 0, dz: -step }
  return null
}
