import { cleanup, fireEvent, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useWorkspaceHotkeys } from './useWorkspaceHotkeys'

function setup() {
  const workspace = document.createElement('div')
  const canvas = document.createElement('canvas')
  const input = document.createElement('input')
  workspace.append(canvas, input)
  document.body.append(workspace)
  const args: Parameters<typeof useWorkspaceHotkeys>[0] = {
    placementMode: 'manual',
    workspaceRef: { current: workspace },
    selectedBox: { id: 'first', x: 0, y: 0, z: 0 },
    maximized: false,
    onUndo: vi.fn(),
    onRedo: vi.fn(),
    onRotate: vi.fn(),
    onDelete: vi.fn(),
    onMove: vi.fn(),
    onClearSelection: vi.fn(),
    onToggleClearance: vi.fn(),
    onExitMaximize: vi.fn(),
  }
  return { args, canvas, input }
}

afterEach(() => {
  cleanup()
  document.body.replaceChildren()
})

describe('workspace command lifetime', () => {
  it('routes canvas commands to the latest selected box once after a rerender', () => {
    const { args, canvas } = setup()
    const { rerender } = renderHook(useWorkspaceHotkeys, { initialProps: args })
    fireEvent.pointerDown(canvas)
    fireEvent.keyDown(document.body, { key: 'm' })
    expect(args.onToggleClearance).toHaveBeenCalledTimes(1)

    const onDelete = vi.fn()
    rerender({ ...args, onDelete, selectedBox: { id: 'second', x: 10, y: 20, z: 30 } })
    fireEvent.keyDown(document.body, { key: 'Delete' })
    expect(args.onDelete).not.toHaveBeenCalled()
    expect(onDelete).toHaveBeenCalledExactlyOnceWith('second')
    fireEvent.keyDown(document.body, { key: 'ArrowRight' })
    expect(args.onMove).toHaveBeenCalledExactlyOnceWith('second', 20, 20, 30)
  })

  it('ignores editable fields and revokes canvas scope after outside interaction', () => {
    const { args, canvas, input } = setup()
    renderHook(useWorkspaceHotkeys, { initialProps: args })
    fireEvent.pointerDown(canvas)
    fireEvent.keyDown(input, { key: 'Delete' })
    fireEvent.keyDown(input, { key: 'm' })
    expect(args.onDelete).not.toHaveBeenCalled()
    expect(args.onToggleClearance).not.toHaveBeenCalled()

    fireEvent.pointerDown(document.body)
    fireEvent.keyDown(document.body, { key: 'Delete' })
    fireEvent.keyDown(document.body, { key: 'm' })
    expect(args.onDelete).not.toHaveBeenCalled()
    expect(args.onToggleClearance).not.toHaveBeenCalled()

    fireEvent.pointerDown(canvas)
    fireEvent.keyDown(document.body, { key: 'Backspace' })
    expect(args.onDelete).toHaveBeenCalledExactlyOnceWith('first')
  })

  it('removes commands when navigation unmounts the editor and does not inherit its old scope', () => {
    const { args, canvas } = setup()
    const first = renderHook(useWorkspaceHotkeys, { initialProps: args })
    fireEvent.pointerDown(canvas)
    first.unmount()
    fireEvent.keyDown(document.body, { key: 'Delete' })
    fireEvent.keyDown(document.body, { key: 'm' })
    fireEvent.keyDown(document.body, { key: 'z', ctrlKey: true })
    expect(args.onDelete).not.toHaveBeenCalled()
    expect(args.onToggleClearance).not.toHaveBeenCalled()
    expect(args.onUndo).not.toHaveBeenCalled()

    renderHook(useWorkspaceHotkeys, { initialProps: args })
    fireEvent.keyDown(document.body, { key: 'Delete' })
    expect(args.onDelete).not.toHaveBeenCalled()
    fireEvent.pointerDown(canvas)
    fireEvent.keyDown(document.body, { key: 'Delete' })
    expect(args.onDelete).toHaveBeenCalledExactlyOnceWith('first')
  })
})
