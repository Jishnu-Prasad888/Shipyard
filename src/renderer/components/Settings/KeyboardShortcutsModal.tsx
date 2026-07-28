import React, { useEffect, useRef, useState } from 'react'
import { Keyboard, Pencil, Plus, RotateCcw, Trash2, X } from 'lucide-react'
import { KeyboardShortcut, KeyboardShortcutAction } from '@shared/types'
import {
  DEFAULT_KEYBOARD_SHORTCUTS,
  hasDuplicateShortcut,
  shortcutLabel,
  shortcutStrokeFromEvent,
  SHORTCUT_ACTIONS
} from '../../lib/keyboardShortcuts'

interface KeyboardShortcutsModalProps {
  value: KeyboardShortcut[]
  onChange: (shortcuts: KeyboardShortcut[]) => void
  onClose: () => void
}

export const KeyboardShortcutsModal: React.FC<KeyboardShortcutsModalProps> = ({
  value,
  onChange,
  onClose
}) => {
  const [shortcuts, setShortcuts] = useState<KeyboardShortcut[]>(value)
  const [editingAction, setEditingAction] = useState<KeyboardShortcutAction | null>(null)
  const [recordedStrokes, setRecordedStrokes] = useState<string[]>([])
  const [error, setError] = useState('')
  const recorderRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    recorderRef.current?.focus()
  }, [editingAction])

  const startEditing = (action: KeyboardShortcutAction): void => {
    const existing = shortcuts.find((shortcut) => shortcut.action === action)
    setEditingAction(action)
    setRecordedStrokes(existing ? [...existing.strokes] : [])
    setError('')
  }

  const saveBinding = (): void => {
    if (!editingAction || recordedStrokes.length === 0) {
      setError('Record at least one key combination.')
      return
    }

    const candidate = { action: editingAction, strokes: recordedStrokes }
    if (hasDuplicateShortcut(shortcuts, candidate, editingAction)) {
      setError('That shortcut is already assigned to another action.')
      return
    }

    setShortcuts((current) => [
      ...current.filter((shortcut) => shortcut.action !== editingAction),
      candidate
    ])
    setEditingAction(null)
    setRecordedStrokes([])
  }

  const removeBinding = (action: KeyboardShortcutAction): void => {
    setShortcuts((current) => current.filter((shortcut) => shortcut.action !== action))
    if (editingAction === action) setEditingAction(null)
  }

  const unassignedActions = SHORTCUT_ACTIONS.filter(
    (action) => !shortcuts.some((shortcut) => shortcut.action === action.id)
  )

  return (
    <div
      className="fixed inset-0 bg-black/70 flex items-center justify-center z-[60]"
      onClick={(event) => {
        event.stopPropagation()
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div
        className="aero-window w-full max-w-2xl max-h-[85vh] flex flex-col animate-brutal-in"
        style={{ background: 'var(--color-surface)', boxShadow: 'var(--shadow-window)' }}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="aero-titlebar flex items-center justify-between px-5 py-3 border-b">
          <div className="flex items-center gap-2 text-white">
            <Keyboard className="w-4 h-4" />
            <h2 className="text-base font-black uppercase tracking-wider">Keyboard Shortcuts</h2>
          </div>
          <button
            onClick={onClose}
            className="aero-icon-button w-7 h-7 text-white flex items-center justify-center"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 overflow-auto space-y-4">
          <p className="text-xs font-bold" style={{ color: 'var(--color-muted)' }}>
            Record one combination or a sequence. Sequences wait briefly for the next key.
          </p>

          <div className="border" style={{ borderColor: 'var(--color-border-strong)' }}>
            {shortcuts.map((shortcut) => {
              const action = SHORTCUT_ACTIONS.find((item) => item.id === shortcut.action)
              return (
                <div
                  key={shortcut.action}
                  className="flex items-center gap-3 px-3 py-2 border-b last:border-b-0"
                  style={{
                    borderColor: 'var(--color-border)',
                    background: 'var(--color-background)'
                  }}
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-black uppercase tracking-wide">{action?.label}</p>
                    <p className="text-[10px] font-bold" style={{ color: 'var(--color-muted)' }}>
                      {action?.group}
                    </p>
                  </div>
                  <kbd
                    className="px-2 py-1 border text-xs font-black whitespace-nowrap"
                    style={{
                      borderColor: 'var(--color-border-strong)',
                      background: 'var(--color-surface)'
                    }}
                  >
                    {shortcutLabel(shortcut.strokes)}
                  </kbd>
                  <button
                    onClick={() => startEditing(shortcut.action)}
                    className="btn-secondary p-2"
                    title="Edit shortcut"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => removeBinding(shortcut.action)}
                    className="btn-secondary p-2"
                    title="Delete shortcut"
                    style={{ color: 'var(--color-alert, #dc2626)' }}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              )
            })}
            {shortcuts.length === 0 && (
              <p
                className="p-5 text-center text-xs font-bold"
                style={{ color: 'var(--color-muted)' }}
              >
                No shortcuts configured.
              </p>
            )}
          </div>

          {editingAction && (
            <div
              className="aero-panel p-4 space-y-3"
              style={{
                borderColor: 'var(--color-primary)',
                background: 'var(--color-primary-soft)'
              }}
            >
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-black uppercase tracking-wide">
                    {SHORTCUT_ACTIONS.find((action) => action.id === editingAction)?.label}
                  </p>
                  <p className="text-[10px] font-bold" style={{ color: 'var(--color-muted)' }}>
                    Press keys to add strokes. Backspace removes the last stroke.
                  </p>
                </div>
                <button
                  onClick={() => setRecordedStrokes([])}
                  className="btn-secondary text-[10px]"
                  type="button"
                >
                  Clear
                </button>
              </div>
              <button
                ref={recorderRef}
                type="button"
                className="aero-input w-full min-h-12 px-3 py-2 text-left outline-none"
                style={{ borderColor: 'var(--color-primary)', background: 'var(--color-surface)' }}
                onKeyDown={(event) => {
                  event.preventDefault()
                  event.stopPropagation()
                  setError('')
                  if (event.key === 'Escape') {
                    setEditingAction(null)
                    return
                  }
                  if (event.key === 'Backspace') {
                    setRecordedStrokes((current) => current.slice(0, -1))
                    return
                  }
                  const stroke = shortcutStrokeFromEvent(event)
                  if (stroke && recordedStrokes.length < 3) {
                    setRecordedStrokes((current) => [...current, stroke])
                  }
                }}
              >
                {recordedStrokes.length > 0 ? (
                  <span className="flex flex-wrap gap-2">
                    {recordedStrokes.map((stroke, index) => (
                      <kbd
                        key={`${stroke}-${index}`}
                        className="px-2 py-1 border text-xs font-black"
                      >
                        {stroke}
                      </kbd>
                    ))}
                  </span>
                ) : (
                  <span className="text-xs font-bold" style={{ color: 'var(--color-muted)' }}>
                    Recording... press a key combination
                  </span>
                )}
              </button>
              {error && <p className="text-xs font-bold text-red-600">{error}</p>}
              <div className="flex justify-end gap-2">
                <button onClick={() => setEditingAction(null)} className="btn-secondary text-xs">
                  Cancel
                </button>
                <button onClick={saveBinding} className="btn-primary text-xs">
                  Save Shortcut
                </button>
              </div>
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            {unassignedActions.length > 0 && !editingAction && (
              <div className="flex gap-2 flex-1 min-w-64">
                <select
                  className="aero-input flex-1 px-3 py-2 text-xs font-bold"
                  defaultValue=""
                  onChange={(event) => {
                    if (event.target.value)
                      startEditing(event.target.value as KeyboardShortcutAction)
                    event.target.value = ''
                  }}
                >
                  <option value="" disabled>
                    Choose an action...
                  </option>
                  {unassignedActions.map((action) => (
                    <option key={action.id} value={action.id}>
                      {action.label}
                    </option>
                  ))}
                </select>
                <button className="btn-primary text-xs pointer-events-none" tabIndex={-1}>
                  <Plus className="w-4 h-4" /> Add
                </button>
              </div>
            )}
            <button
              onClick={() =>
                setShortcuts(
                  DEFAULT_KEYBOARD_SHORTCUTS.map((item) => ({
                    ...item,
                    strokes: [...item.strokes]
                  }))
                )
              }
              className="btn-secondary text-xs ml-auto"
            >
              <RotateCcw className="w-3.5 h-3.5" /> Restore Defaults
            </button>
          </div>
        </div>

        <div
          className="flex justify-end gap-2 px-5 py-3 border-t"
          style={{ borderColor: 'var(--color-border)', background: 'var(--color-background)' }}
        >
          <button onClick={onClose} className="btn-secondary text-xs">
            Cancel
          </button>
          <button
            onClick={() => {
              onChange(shortcuts)
              onClose()
            }}
            className="btn-primary text-xs"
          >
            Apply Shortcuts
          </button>
        </div>
      </div>
    </div>
  )
}
