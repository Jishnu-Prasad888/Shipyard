/**
 * Dialogs and toasts that float over the app. Their open/closed state lives
 * here rather than in App, so opening Settings or Quick Create (or showing a
 * toast) re-renders only this component instead of the whole window: the
 * header, sidebar, board or dashboard and split pane.
 *
 * Open them from anywhere with the helpers in lib/overlays.
 */
import { type ReactElement, useEffect, useRef, useState } from 'react'
import { SettingsModal } from '../Settings/SettingsModal'
import { Toast } from '../common/Toast'
import { AppContextMenu } from '../common/AppContextMenu'
import {
  QuickCreateModal,
  QuickCreateResult,
  QuickCreateType
} from '../QuickCreate/QuickCreateModal'
import {
  OPEN_SETTINGS_EVENT,
  QUICK_CREATE_EVENT,
  TOAST_EVENT,
  type ToastDetail
} from '../../lib/overlays'

export function OverlayHost({
  onQuickCreated
}: {
  onQuickCreated: (result: QuickCreateResult) => void
}): ReactElement {
  const [showSettings, setShowSettings] = useState(false)
  // undefined = closed, null = the type chooser.
  const [quickCreateType, setQuickCreateType] = useState<QuickCreateType | null | undefined>(
    undefined
  )
  const [toast, setToast] = useState<ToastDetail | null>(null)
  // The latest callback, so the listeners below never need re-registering.
  const onQuickCreatedRef = useRef(onQuickCreated)
  useEffect(() => {
    onQuickCreatedRef.current = onQuickCreated
  }, [onQuickCreated])

  useEffect(() => {
    const handleSettings = (): void => setShowSettings(true)
    const handleQuickCreate = (event: Event): void =>
      setQuickCreateType((event as CustomEvent<QuickCreateType | null>).detail ?? null)
    const handleToast = (event: Event): void => {
      const detail = (event as CustomEvent<ToastDetail>).detail
      setToast({ message: detail.message, onUndo: detail.onUndo })
    }
    window.addEventListener(OPEN_SETTINGS_EVENT, handleSettings)
    window.addEventListener(QUICK_CREATE_EVENT, handleQuickCreate)
    window.addEventListener(TOAST_EVENT, handleToast)
    return () => {
      window.removeEventListener(OPEN_SETTINGS_EVENT, handleSettings)
      window.removeEventListener(QUICK_CREATE_EVENT, handleQuickCreate)
      window.removeEventListener(TOAST_EVENT, handleToast)
    }
  }, [])

  return (
    <>
      {showSettings && <SettingsModal onClose={() => setShowSettings(false)} />}

      {quickCreateType !== undefined && (
        <QuickCreateModal
          key={quickCreateType || 'chooser'}
          initialType={quickCreateType}
          onClose={() => setQuickCreateType(undefined)}
          onCreated={(result) => {
            setQuickCreateType(undefined)
            onQuickCreatedRef.current(result)
            setToast({
              message: `${result.label} "${result.entity.name || result.entity.title}" created`
            })
          }}
        />
      )}

      <AppContextMenu />

      {toast && (
        <Toast message={toast.message} onUndo={toast.onUndo} onClose={() => setToast(null)} />
      )}
    </>
  )
}
