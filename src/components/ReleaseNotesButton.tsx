import { useEffect, useMemo, useState } from 'react'
import type { Locale } from '../types'
import { releaseNotes } from '../data/releaseNotes'

const STORAGE_PREFIX = 'cargo_release_notes_read_v1__'

function storageKey(userId: string | null | undefined) {
  return STORAGE_PREFIX + (userId || 'anonymous')
}

function readLastSeen(userId: string | null | undefined): string {
  if (typeof window === 'undefined') return ''
  try { return window.localStorage.getItem(storageKey(userId)) ?? '' } catch { return '' }
}
function writeLastSeen(userId: string | null | undefined, version: string) {
  if (typeof window === 'undefined') return
  try { window.localStorage.setItem(storageKey(userId), version) } catch { /* ignore */ }
}

type Props = {
  locale: Locale
  userId: string | null
}

const T = {
  en: { open: 'What\'s new', title: 'What\'s new', markRead: 'Mark all as read', close: 'Close', unread: 'unread' },
  zh: { open: '新特性', title: '新特性', markRead: '已读全部', close: '关闭', unread: '未读' },
} as const

export function ReleaseNotesButton({ locale, userId }: Props) {
  const t = T[locale]
  const [open, setOpen] = useState(false)
  const [lastSeen, setLastSeen] = useState<string>(() => readLastSeen(userId))
  const newest = releaseNotes[0]?.version ?? ''
  const unreadCount = useMemo(() => releaseNotes.filter((n) => n.version > lastSeen).length, [lastSeen])

  useEffect(() => {
    setLastSeen(readLastSeen(userId))
  }, [userId])

  const markAllRead = () => {
    writeLastSeen(userId, newest)
    setLastSeen(newest)
  }

  return (
    <>
      <button
        type="button"
        className="relative inline-flex items-center gap-1 rounded-lg border border-[#cbd5e1] bg-white px-3 py-1 text-xs font-semibold text-[#0f172a]"
        data-testid="release-notes-open"
        data-release-notes-unread={unreadCount > 0 ? 'true' : 'false'}
        onClick={() => setOpen(true)}
      >
        <svg aria-hidden="true" className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2">
          <path d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
        {t.open}
        {unreadCount > 0 && (
          <span
            className="absolute -right-1 -top-1 grid min-w-[18px] place-items-center rounded-full bg-[#ef4444] px-1 text-[10px] font-bold text-white"
            data-testid="release-notes-badge"
          >
            {unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          data-testid="release-notes-modal"
          onClick={() => setOpen(false)}
        >
          <div className="max-h-[80vh] w-full max-w-2xl overflow-auto rounded-2xl bg-white p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-xl font-bold text-[#0f172a]">{t.title}</h2>
              <div className="flex items-center gap-2">
                <button type="button" className="archive-button success" data-testid="release-notes-mark-read" onClick={markAllRead} disabled={unreadCount === 0}>
                  {t.markRead}
                </button>
                <button type="button" className="archive-button" data-testid="release-notes-close" onClick={() => setOpen(false)}>{t.close}</button>
              </div>
            </div>
            <ol className="space-y-4" data-testid="release-notes-list">
              {releaseNotes.map((note) => {
                const isUnread = note.version > lastSeen
                return (
                  <li
                    key={note.version}
                    className={`rounded-xl border p-3 ${isUnread ? 'border-[#0ea5e9] bg-[#f0f9ff]' : 'border-[#e5e7eb] bg-white'}`}
                    data-version={note.version}
                    data-unread={isUnread ? 'true' : 'false'}
                  >
                    <div className="mb-1 flex items-baseline justify-between">
                      <h3 className="text-sm font-bold text-[#0f172a]">{note.title[locale]}</h3>
                      <span className="text-[10px] text-[#64748b]">{note.date}{isUnread ? ` · ${t.unread}` : ''}</span>
                    </div>
                    <ul className="list-inside list-disc space-y-1 text-xs text-[#334155]">
                      {note.items[locale].map((item) => <li key={item}>{item}</li>)}
                    </ul>
                  </li>
                )
              })}
            </ol>
          </div>
        </div>
      )}
    </>
  )
}
