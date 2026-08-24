import { useEffect, type RefObject } from 'react'
import { resolveWorkspaceHotkey } from '../lib/workspaceHotkeys'
import type { ManualRotationDirection } from '../lib/manualPlacement'

type SelectedBox = {
  id: string
  x: number
  y: number
  z: number
}

type UseWorkspaceHotkeysArgs = {
  enabled: boolean
  placementMode: 'auto' | 'manual'
  workspaceRef: RefObject<HTMLElement | null>
  selectedBox: SelectedBox | null
  maximized: boolean
  onUndo: () => void
  onRedo: () => void
  onRotate: (boxId: string, direction: ManualRotationDirection) => void
  onDelete: (boxId: string) => void
  onMove: (boxId: string, x: number, y: number, z?: number) => void
  onClearSelection: () => void
  onToggleClearance: () => void
  onExitMaximize: () => void
}

export function useWorkspaceHotkeys({
  enabled,
  placementMode,
  workspaceRef,
  selectedBox,
  maximized,
  onUndo,
  onRedo,
  onRotate,
  onDelete,
  onMove,
  onClearSelection,
  onToggleClearance,
  onExitMaximize,
}: UseWorkspaceHotkeysArgs) {
  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      const fromEditableField = Boolean(
        target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable),
      )
      const command = resolveWorkspaceHotkey({
        key: event.key,
        shift: event.shiftKey,
        meta: event.metaKey,
        ctrl: event.ctrlKey,
        nav: enabled ? 'overview' : 'other',
        placementMode,
        workspaceContains: Boolean(target && workspaceRef.current?.contains(target)),
        maximized,
        selectedBoxId: selectedBox?.id ?? null,
        fromEditableField,
      })
      if (!command) return
      event.preventDefault()
      switch (command.type) {
        case 'undo':
          onUndo()
          return
        case 'redo':
          onRedo()
          return
        case 'rotate':
          if (!selectedBox) return
          onRotate(selectedBox.id, command.direction)
          return
        case 'delete':
          onDelete(command.boxId)
          return
        case 'nudge':
          if (!selectedBox) return
          onMove(
            selectedBox.id,
            selectedBox.x + command.dx,
            selectedBox.y + command.dy,
            selectedBox.z + command.dz,
          )
          return
        case 'clearSelection':
          onClearSelection()
          return
        case 'toggleClearance':
          onToggleClearance()
          return
        case 'exitMaximize':
          onExitMaximize()
      }
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [
    enabled,
    maximized,
    onClearSelection,
    onDelete,
    onExitMaximize,
    onMove,
    onRedo,
    onRotate,
    onToggleClearance,
    onUndo,
    placementMode,
    selectedBox,
    workspaceRef,
  ])
}
