/**
 * The app-wide right-click menu: screenshots (area or full screen), plus
 * Cut/Copy/Paste where they apply. Elements with their own menu (boards,
 * columns, projects…) call preventDefault and keep it; text fields keep the
 * standard menu, and Shift+right-click always shows it.
 */
import { type ReactElement, useEffect, useRef, useState } from 'react'
import { ClipboardPaste, Copy, Crop, Monitor, Scissors } from 'lucide-react'
import { takeScreenshot } from '../../lib/screenshot'
import { showToast } from '../../lib/overlays'

interface MenuState {
  x: number
  y: number
  editable: boolean
  hasSelection: boolean
}

const MENU_WIDTH = 220
const MENU_HEIGHT = 200

export function AppContextMenu(): ReactElement | null {
  const [menu, setMenu] = useState<MenuState | null>(null)
  const menuRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const onContextMenu = (event: MouseEvent): void => {
      if (event.defaultPrevented || event.shiftKey) return
      const target = event.target as HTMLElement | null
      if (target?.closest('input, textarea, select')) return
      if (menuRef.current?.contains(target)) {
        event.preventDefault()
        return
      }
      event.preventDefault()
      const selection = window.getSelection()
      setMenu({
        x: Math.min(event.clientX, window.innerWidth - MENU_WIDTH - 8),
        y: Math.min(event.clientY, window.innerHeight - MENU_HEIGHT - 8),
        editable: !!target?.closest('[contenteditable="true"]'),
        hasSelection: !!selection && !selection.isCollapsed && selection.toString().length > 0
      })
    }
    window.addEventListener('contextmenu', onContextMenu)
    return () => window.removeEventListener('contextmenu', onContextMenu)
  }, [])

  useEffect(() => {
    if (!menu) return
    const closeOutside = (event: MouseEvent): void => {
      if (!menuRef.current?.contains(event.target as Node)) setMenu(null)
    }
    const close = (): void => setMenu(null)
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') setMenu(null)
    }
    window.addEventListener('mousedown', closeOutside)
    window.addEventListener('blur', close)
    window.addEventListener('resize', close)
    window.addEventListener('wheel', close, { passive: true })
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('mousedown', closeOutside)
      window.removeEventListener('blur', close)
      window.removeEventListener('resize', close)
      window.removeEventListener('wheel', close)
      window.removeEventListener('keydown', onKey)
    }
  }, [menu])

  if (!menu) return null

  const run = (action: () => void): void => {
    setMenu(null)
    action()
  }

  const paste = async (): Promise<void> => {
    try {
      const text = await navigator.clipboard.readText()
      if (text) document.execCommand('insertText', false, text)
    } catch {
      showToast({ message: 'Press Ctrl+V to paste' })
    }
  }

  const items: Array<
    { label: string; hint?: string; icon: typeof Copy; onClick: () => void } | 'divider'
  > = [
    {
      label: 'Screenshot area',
      hint: 'Alt+Shift+S',
      icon: Crop,
      onClick: () => void takeScreenshot('area')
    },
    { label: 'Screenshot full screen', icon: Monitor, onClick: () => void takeScreenshot('full') }
  ]
  if (menu.editable || menu.hasSelection) items.push('divider')
  if (menu.editable && menu.hasSelection)
    items.push({
      label: 'Cut',
      hint: 'Ctrl+X',
      icon: Scissors,
      onClick: () => document.execCommand('cut')
    })
  if (menu.hasSelection)
    items.push({
      label: 'Copy',
      hint: 'Ctrl+C',
      icon: Copy,
      onClick: () => document.execCommand('copy')
    })
  if (menu.editable)
    items.push({
      label: 'Paste',
      hint: 'Ctrl+V',
      icon: ClipboardPaste,
      onClick: () => void paste()
    })

  return (
    <div
      ref={menuRef}
      role="menu"
      className="context-menu fixed z-[100] animate-brutal-in py-1"
      style={{
        top: menu.y,
        left: menu.x,
        width: MENU_WIDTH,
        background: 'var(--color-surface)',
        border: '1px solid var(--color-border-strong)',
        boxShadow: 'var(--shadow-window)'
      }}
      // Keep the editor's selection and focus while using the menu.
      onMouseDown={(event) => event.preventDefault()}
    >
      {items.map((item, index) =>
        item === 'divider' ? (
          <div
            key={`divider-${index}`}
            className="my-1 h-px"
            style={{ background: 'var(--color-border)' }}
          />
        ) : (
          <button
            key={item.label}
            type="button"
            role="menuitem"
            className="w-full flex items-center gap-2 px-3 py-2 text-xs font-bold text-left hover:bg-primary-soft"
            style={{ color: 'var(--color-text)' }}
            onClick={() => run(item.onClick)}
          >
            <item.icon className="w-3.5 h-3.5 shrink-0" />
            <span className="flex-1">{item.label}</span>
            {item.hint && (
              <span className="text-[10px] font-semibold" style={{ color: 'var(--color-muted)' }}>
                {item.hint}
              </span>
            )}
          </button>
        )
      )}
    </div>
  )
}
