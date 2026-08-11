import { useEffect, type RefObject } from 'react'
import type { ContainerSpec, Locale } from '../types'
import type { ManualPlacedBox, ManualRotationDirection, ValidationIssue } from '../lib/manualPlacement'
import type { ManualOperationNotice } from '../lib/manualFeedback'
import { createManualOperationNotice } from '../lib/manualFeedback'
import { buildRotationNotice } from '../workbenchHelpers'

type RotateCommand = {
  ok: boolean
  issues: ValidationIssue[]
  rotatedBox?: ManualPlacedBox | null
}

type UseManualWorkspaceHotkeysArgs = {
  activeNav: string
  placementMode: 'auto' | 'manual'
  workspaceRef: RefObject<HTMLElement | null>
  manualSelectedId: string | null
  renderingContainer: ContainerSpec
  locale: Locale
  rotateManualBox: (boxId: string, direction?: ManualRotationDirection) => RotateCommand
  undoManualPlacement: () => void
  redoManualPlacement: () => void
  selectManualBox: (id: string | null) => void
  setRotationNotice: (notice: string) => void
  setManualNotice: (notice: ManualOperationNotice | null) => void
  setClearanceToggleToken: (updater: (token: number) => number) => void
}

export function useManualWorkspaceHotkeys({
  activeNav,
  placementMode,
  workspaceRef,
  manualSelectedId,
  renderingContainer,
  locale,
  rotateManualBox,
  undoManualPlacement,
  redoManualPlacement,
  selectManualBox,
  setRotationNotice,
  setManualNotice,
  setClearanceToggleToken,
}: UseManualWorkspaceHotkeysArgs) {
  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      if (target) {
        const tag = target.tagName
        if (tag === 'INPUT' || tag === 'TEXTAREA' || target.isContentEditable) {
          return
        }
      }
      const isManualWorkspaceTarget = activeNav === 'overview'
        && placementMode === 'manual'
        && target !== null
        && workspaceRef.current?.contains(target)
      if (!isManualWorkspaceTarget) return

      const isMeta = event.ctrlKey || event.metaKey

      if (isMeta && (event.key === 'z' || event.key === 'Z')) {
        if (placementMode !== 'manual') return
        event.preventDefault()
        if (event.shiftKey) {
          redoManualPlacement()
        } else {
          undoManualPlacement()
        }
        return
      }
      if (isMeta && (event.key === 'y' || event.key === 'Y')) {
        if (placementMode !== 'manual') return
        event.preventDefault()
        redoManualPlacement()
        return
      }

      if ((event.key === 'r' || event.key === 'R') && placementMode === 'manual' && manualSelectedId) {
        event.preventDefault()
        const direction: ManualRotationDirection = event.shiftKey ? 'down' : 'right'
        const command = rotateManualBox(manualSelectedId, direction)
        if (!command.ok) {
          setRotationNotice(buildRotationNotice({
            ok: false,
            issues: command.issues,
            rotatedBox: command.rotatedBox ?? null,
          }, renderingContainer, locale))
          setManualNotice(createManualOperationNotice({
            operation: 'rotate',
            boxId: manualSelectedId,
            issues: command.issues,
            locale,
          }))
          return
        }
        setRotationNotice('')
        setManualNotice(null)
        return
      }

      if (event.key === 'm' || event.key === 'M') {
        event.preventDefault()
        setClearanceToggleToken((token) => token + 1)
        return
      }

      if (event.key === 'Escape') {
        selectManualBox(null)
      }
    }

    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [
    activeNav,
    locale,
    manualSelectedId,
    placementMode,
    redoManualPlacement,
    renderingContainer,
    rotateManualBox,
    selectManualBox,
    setClearanceToggleToken,
    setManualNotice,
    setRotationNotice,
    undoManualPlacement,
    workspaceRef,
  ])
}
