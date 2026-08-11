import type { Locale } from '../types'

type LazyLoadFallbackProps = {
  locale: Locale
  testId: string
  errorTestId: string
  failed: boolean
  loadingText: { zh: string; en: string }
  errorText: { zh: string; en: string }
  onClose: () => void
  cardClassName?: string
}

export function LazyLoadFallback({
  locale,
  testId,
  errorTestId,
  failed,
  loadingText,
  errorText,
  onClose,
  cardClassName = 'archive-card overflow-hidden p-[18px]',
}: LazyLoadFallbackProps) {
  return (
    <section className={cardClassName} data-testid={testId}>
      {failed ? (
        <div className="py-10 text-center text-sm text-slate-500">
          <p className="font-semibold text-red-700" data-testid={errorTestId}>
            {locale === 'zh' ? errorText.zh : errorText.en}
          </p>
          <div className="mt-4 flex justify-center gap-2">
            <button className="archive-button" type="button" onClick={() => window.location.reload()}>
              {locale === 'zh' ? '重新加载页面' : 'Reload page'}
            </button>
            <button className="archive-button secondary" type="button" onClick={onClose}>
              {locale === 'zh' ? '关闭' : 'Close'}
            </button>
          </div>
        </div>
      ) : (
        <div className="py-12 text-center text-sm text-slate-500" role="status">
          {locale === 'zh' ? loadingText.zh : loadingText.en}
        </div>
      )}
    </section>
  )
}
