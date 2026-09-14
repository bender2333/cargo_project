import { useEffect, useRef, type RefObject } from 'react'
import { resolveWorkspaceHotkey } from '../lib/workspaceHotkeys'
import type { ManualRotationDirection } from '../lib/manualPlacement'

type SelectedBox = {
  id: string
  x: number
  y: number
  z: number
}

type UseWorkspaceHotkeysArgs = {
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
  // Pointer/focus events can leave a WebGL canvas with `body` as the active
  // element after a mode switch or a browser default action. Keep the last
  // workspace interaction so a subsequent command still targets this editor,
  // while any interaction outside the workspace revokes that scope.
  const workspaceInteractedRef = useRef(false)

  useEffect(() => {
    const isInsideWorkspace = (target: EventTarget | null) => {
      const workspace = workspaceRef.current
      return Boolean(workspace && target instanceof Node && workspace.contains(target))
    }
    const trackWorkspaceInteraction = (event: Event) => {
      workspaceInteractedRef.current = isInsideWorkspace(event.target)
    }
    window.addEventListener('pointerdown', trackWorkspaceInteraction, true)
    window.addEventListener('focusin', trackWorkspaceInteraction, true)
    return () => {
      window.removeEventListener('pointerdown', trackWorkspaceInteraction, true)
      window.removeEventListener('focusin', trackWorkspaceInteraction, true)
    }
  }, [workspaceRef])

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
        placementMode,
        workspaceContains: Boolean(
          target && workspaceRef.current?.contains(target),
        ),
        workspaceInteracted: workspaceInteractedRef.current,
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
