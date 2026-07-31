import React, { useState } from 'react'
import { X } from 'lucide-react'
import { useResizableDialog } from '../../hooks/useResizableDialog'
import { ResizeHandle } from '../common/ResizeHandle'

interface CreateColumnModalProps {
  onClose: () => void
  onCreate: (column: any) => void
}

const PRESET_COLORS = [
  '#2563eb', // Blue
  '#0891b2', // Cyan
  '#7c3aed', // Violet
  '#059669', // Emerald
  '#d97706', // Amber
  '#dc2626', // Red
  '#db2777', // Pink
  '#0f172a' // Dark
]

export const CreateColumnModal: React.FC<CreateColumnModalProps> = ({ onClose, onCreate }) => {
  const { modalStyle, handleResizeStart, resetSize, shouldIgnoreOverlayClick } = useResizableDialog(
    {
      storageKey: 'shipyard:modal:create-column',
      defaultWidth: 520,
      defaultHeight: 420,
      minWidth: 420,
      minHeight: 340
    }
  )
  const [name, setName] = useState('')
  const [color, setColor] = useState('#2563eb')

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return

    onCreate({
      name: name.trim(),
      color
    })
  }

  return (
    <div
      className="fixed inset-0 bg-black/70 flex items-center justify-center z-50"
      onClick={() => {
        if (shouldIgnoreOverlayClick()) return
        onClose()
      }}
    >
      <div
        className="aero-window relative w-full animate-brutal-in overflow-hidden"
        onClick={(e) => e.stopPropagation()}
        style={{
          ...modalStyle,
          background: 'var(--color-surface)',
          border: '1px solid var(--color-border-strong)',
          boxShadow: 'var(--shadow-window)'
        }}
      >
        {/* Header */}
        <div
          className="aero-titlebar flex items-center justify-between px-5 py-3 border-b"
          style={{ background: 'var(--color-primary)', borderColor: 'var(--color-border-strong)' }}
        >
          <h2 className="text-base font-black text-white uppercase tracking-wider">
            Create Column
          </h2>
          <button
            onClick={onClose}
            className="aero-icon-button w-7 h-7 text-white flex items-center justify-center transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {/* Name */}
          <div>
            <label className="block text-xs font-black uppercase tracking-wider mb-1">
              Column Name *
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="aero-input w-full px-3 py-2 text-sm font-semibold focus:outline-none"
              style={{
                borderColor: 'var(--color-border-strong)',
                background: 'var(--color-background)',
                color: 'var(--color-text)',
                boxShadow: 'inset 0 1px 3px rgba(0,0,0,0.16)'
              }}
              placeholder="e.g., TO DO, IN PROGRESS, DONE"
              autoFocus
            />
          </div>

          {/* Color */}
          <div>
            <label className="block text-xs font-black uppercase tracking-wider mb-2">
              Column Color
            </label>
            <div className="flex gap-2">
              {PRESET_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  className="w-8 h-8 border-2 transition-all duration-100"
                  style={{
                    backgroundColor: c,
                    borderColor: color === c ? 'var(--color-border-strong)' : 'transparent',
                    boxShadow:
                      color === c
                        ? '0 0 0 2px var(--color-surface), 0 0 0 3px var(--color-border-strong)'
                        : 'inset 0 1px 0 rgba(255,255,255,.45)'
                  }}
                />
              ))}
            </div>
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="btn-secondary text-xs uppercase tracking-wider"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!name.trim()}
              className="btn-primary text-xs uppercase tracking-wider disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Create Column
            </button>
          </div>
        </form>

        <ResizeHandle onMouseDown={handleResizeStart} onDoubleClick={resetSize} />
      </div>
    </div>
  )
}
