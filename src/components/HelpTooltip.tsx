import { useState } from 'react'

type Props = {
  text: string
  testId: string
}

export function HelpTooltip({ text, testId }: Props) {
  const [open, setOpen] = useState(false)

  return (
    <span
      className="relative inline-flex align-middle"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button
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
      {open && (
        <span
          className="absolute left-1/2 top-6 z-50 w-64 -translate-x-1/2 rounded-md border border-slate-200 bg-white px-3 py-2 text-xs font-medium leading-relaxed text-slate-700 shadow-xl"
          data-testid="help-tooltip-popover"
          role="tooltip"
        >
          {text}
        </span>
      )}
    </span>
  )
}
