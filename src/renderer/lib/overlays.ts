/** Opens the app's dialogs and toasts (rendered by components/Layout/OverlayHost). */
import type { QuickCreateType } from '../components/QuickCreate/QuickCreateModal'

export const OPEN_SETTINGS_EVENT = 'shipyard:open-settings'
export const QUICK_CREATE_EVENT = 'shipyard:quick-create'
export const TOAST_EVENT = 'show-toast'

export interface ToastDetail {
  message: string
  onUndo?: () => void
}

export const openSettings = (): void => {
  window.dispatchEvent(new Event(OPEN_SETTINGS_EVENT))
}

/** Opens Quick Create on a type, or on the type chooser for `null`. */
export const openQuickCreate = (type: QuickCreateType | null): void => {
  window.dispatchEvent(
    new CustomEvent<QuickCreateType | null>(QUICK_CREATE_EVENT, { detail: type })
  )
}

export const showToast = (detail: ToastDetail): void => {
  window.dispatchEvent(new CustomEvent<ToastDetail>(TOAST_EVENT, { detail }))
}
