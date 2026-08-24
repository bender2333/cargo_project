import { describe, expect, it } from 'vitest'
import { resolveWorkspaceHotkey, type WorkspaceHotkeyInput } from './workspaceHotkeys'

function input(overrides: Partial<WorkspaceHotkeyInput> = {}): WorkspaceHotkeyInput {
  return {
    key: 'Delete',
    shift: false,
    meta: false,
    ctrl: false,
    nav: 'overview',
    placementMode: 'manual',
    workspaceContains: true,
    maximized: false,
    selectedBoxId: 'box-1',
    fromEditableField: false,
    ...overrides,
  }
}

describe('resolveWorkspaceHotkey', () => {
  it('deletes and nudges the selected box when focus is inside the workspace, not on the canvas', () => {
    expect(resolveWorkspaceHotkey(input({ key: 'Delete' }))).toEqual({ type: 'delete', boxId: 'box-1' })
    expect(resolveWorkspaceHotkey(input({ key: 'Backspace' }))).toEqual({ type: 'delete', boxId: 'box-1' })
    expect(resolveWorkspaceHotkey(input({ key: 'r' }))).toEqual({ type: 'rotate', direction: 'right' })
    expect(resolveWorkspaceHotkey(input({ key: 'R', shift: true }))).toEqual({ type: 'rotate', direction: 'down' })
    expect(resolveWorkspaceHotkey(input({ key: 'ArrowLeft' }))).toEqual({ type: 'nudge', dx: -10, dy: 0, dz: 0 })
    expect(resolveWorkspaceHotkey(input({ key: 'ArrowRight' }))).toEqual({ type: 'nudge', dx: 10, dy: 0, dz: 0 })
    expect(resolveWorkspaceHotkey(input({ key: 'ArrowDown' }))).toEqual({ type: 'nudge', dx: 0, dy: -10, dz: 0 })
    expect(resolveWorkspaceHotkey(input({ key: 'ArrowUp' }))).toEqual({ type: 'nudge', dx: 0, dy: 10, dz: 0 })
  })

  it('ignores packing keys when focus is outside the overview workspace', () => {
    const outside = { workspaceContains: false as const }
    expect(resolveWorkspaceHotkey(input({ ...outside, key: 'Delete' }))).toBeNull()
    expect(resolveWorkspaceHotkey(input({ ...outside, key: 'r' }))).toBeNull()
    expect(resolveWorkspaceHotkey(input({ ...outside, key: 'z', ctrl: true }))).toBeNull()
    expect(resolveWorkspaceHotkey(input({ ...outside, nav: 'history', workspaceContains: true, key: 'Delete' }))).toBeNull()
  })

  it('still deletes in manual mode without a 2D/3D view flag, so 2D does not need the scene mounted', () => {
    expect(resolveWorkspaceHotkey(input({ key: 'Delete' }))).toEqual({ type: 'delete', boxId: 'box-1' })
  })

  it('lets auto mode toggle clearance but not delete, rotate, or undo', () => {
    const auto = { placementMode: 'auto' as const }
    expect(resolveWorkspaceHotkey(input({ ...auto, key: 'm' }))).toEqual({ type: 'toggleClearance' })
    expect(resolveWorkspaceHotkey(input({ ...auto, key: 'Delete' }))).toBeNull()
    expect(resolveWorkspaceHotkey(input({ ...auto, key: 'r' }))).toBeNull()
    expect(resolveWorkspaceHotkey(input({ ...auto, key: 'z', ctrl: true }))).toBeNull()
  })

  it('ignores every workspace key while typing in an editable field', () => {
    expect(resolveWorkspaceHotkey(input({ fromEditableField: true, key: 'Delete' }))).toBeNull()
    expect(resolveWorkspaceHotkey(input({ fromEditableField: true, key: 'm' }))).toBeNull()
    expect(resolveWorkspaceHotkey(input({ fromEditableField: true, key: 'Escape' }))).toBeNull()
  })

  it('peels one Escape layer: exit maximize first, otherwise clear selection', () => {
    expect(resolveWorkspaceHotkey(input({ maximized: true, key: 'Escape' }))).toEqual({ type: 'exitMaximize' })
    expect(resolveWorkspaceHotkey(input({ key: 'Escape' }))).toEqual({ type: 'clearSelection' })
    expect(resolveWorkspaceHotkey(input({ placementMode: 'auto', key: 'Escape' }))).toBeNull()
  })

  it('scales nudge steps with modifiers and maps PageUp/PageDown to Z', () => {
    expect(resolveWorkspaceHotkey(input({ key: 'ArrowLeft', shift: true }))).toEqual({
      type: 'nudge', dx: -100, dy: 0, dz: 0,
    })
    expect(resolveWorkspaceHotkey(input({ key: 'ArrowUp', ctrl: true }))).toEqual({
      type: 'nudge', dx: 0, dy: 1, dz: 0,
    })
    expect(resolveWorkspaceHotkey(input({ key: 'PageUp' }))).toEqual({ type: 'nudge', dx: 0, dy: 0, dz: 10 })
    expect(resolveWorkspaceHotkey(input({ key: 'PageDown', meta: true }))).toEqual({
      type: 'nudge', dx: 0, dy: 0, dz: -1,
    })
  })

  it('keeps clearance available without a selection, and withholds box commands', () => {
    const none = { selectedBoxId: null as string | null }
    expect(resolveWorkspaceHotkey(input({ ...none, key: 'm' }))).toEqual({ type: 'toggleClearance' })
    expect(resolveWorkspaceHotkey(input({ ...none, key: 'Delete' }))).toBeNull()
    expect(resolveWorkspaceHotkey(input({ ...none, key: 'r' }))).toBeNull()
    expect(resolveWorkspaceHotkey(input({ ...none, key: 'ArrowLeft' }))).toBeNull()
    expect(resolveWorkspaceHotkey(input({ ...none, key: 'z', ctrl: true }))).toEqual({ type: 'undo' })
    expect(resolveWorkspaceHotkey(input({ ...none, key: 'y', ctrl: true }))).toEqual({ type: 'redo' })
    expect(resolveWorkspaceHotkey(input({ ...none, key: 'z', meta: true, shift: true }))).toEqual({ type: 'redo' })
  })
})
