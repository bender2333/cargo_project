import type { ComponentType } from 'react'
import type { ContainerSpec, Locale } from '../types'

type CustomContainerDialogProps = {
  currentSelectedId: string
  onClose: () => void
  onSelect: (container: ContainerSpec) => void
}

type CustomContainerDialogHostProps = {
  Dialog: ComponentType<CustomContainerDialogProps> | null
  loadFailed: boolean
  locale: Locale
  currentSelectedId: string
  onClose: () => void
  onSelect: (container: ContainerSpec) => void
}

export function CustomContainerDialogHost({
  Dialog,
  loadFailed,
  locale,
  currentSelectedId,
  onClose,
  onSelect,
}: CustomContainerDialogHostProps) {
  if (Dialog) {
    return (
      <Dialog
        currentSelectedId={currentSelectedId}
        onClose={onClose}
        onSelect={onSelect}
      />
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4" data-testid="custom-container-dialog-loader">
      {loadFailed ? (
        <div className="w-full max-w-md rounded-lg bg-white p-6 text-center shadow-2xl">
          <p className="text-sm font-semibold text-red-700" data-testid="custom-container-dialog-load-error">
            {locale === 'zh' ? '柜型管理加载失败' : 'Failed to load container manager'}
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
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-purple-600 border-t-transparent" role="status" aria-label={locale === 'zh' ? '正在加载柜型管理' : 'Loading container manager'} />
      )}
    </div>
  )
}
