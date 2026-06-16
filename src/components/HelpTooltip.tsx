import { useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

type Props = {
  text: string
  testId: string
}

const VIEWPORT_MARGIN = 8
const ANCHOR_GAP = 6

type Coords = { left: number; top: number }

export function HelpTooltip({ text, testId }: Props) {
  const [open, setOpen] = useState(false)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const popoverRef = useRef<HTMLSpanElement>(null)
  const [coords, setCoords] = useState<Coords | null>(null)

  // Render into document.body with fixed positioning so no `overflow` ancestor
  // (the import modal uses overflow-y-auto which also clips overflow-x) can crop
  // the bubble. Clamp to the viewport so the bubble is always fully visible.
  useLayoutEffect(() => {
    if (!open) {
      setCoords(null)
      return
    }
    const compute = () => {
      const button = buttonRef.current
      const popover = popoverRef.current
      if (!button || !popover) return
      const rect = button.getBoundingClientRect()
      const viewportWidth = window.innerWidth
      const viewportHeight = window.innerHeight
      const width = popover.offsetWidth
      const height = popover.offsetHeight

      let left = rect.left + rect.width / 2 - width / 2
      left = Math.min(Math.max(left, VIEWPORT_MARGIN), viewportWidth - width - VIEWPORT_MARGIN)

      let top = rect.bottom + ANCHOR_GAP
      if (top + height > viewportHeight - VIEWPORT_MARGIN) {
        const above = rect.top - ANCHOR_GAP - height
        top = above >= VIEWPORT_MARGIN ? above : Math.max(VIEWPORT_MARGIN, viewportHeight - height - VIEWPORT_MARGIN)
      }

      setCoords({ left, top })
    }

    compute()
    window.addEventListener('resize', compute)
    window.addEventListener('scroll', compute, true)
    return () => {
      window.removeEventListener('resize', compute)
      window.removeEventListener('scroll', compute, true)
    }
  }, [open])

  return (
    <span
      className="relative inline-flex align-middle"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button
        ref={buttonRef}
        className="inline-grid h-5 w-5 place-items-center rounded-full border border-slate-300 bg-white text-[11px] font-bold leading-none text-slate-600 shadow-sm hover:border-indigo-300 hover:bg-indigo-50 hover:text-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-400"
        type="button"
        aria-label={text}
        data-testid={testId}
        onBlur={() => setOpen(false)}
        onClick={(event) => {
          event.preventDefault()
          setOpen((current) => !current)
        }}
        onFocus={() => setOpen(true)}
      >
        ?
      </button>
      {open &&
        createPortal(
          <span
            ref={popoverRef}
            className="fixed z-[100] w-64 rounded-md border border-slate-200 bg-white px-3 py-2 text-xs font-medium leading-relaxed text-slate-700 shadow-xl"
            style={coords ? { left: coords.left, top: coords.top } : { left: 0, top: 0, visibility: 'hidden' }}
            data-testid="help-tooltip-popover"
            role="tooltip"
          >
            {text}
          </span>,
          document.body,
        )}
    </span>
  )
}
