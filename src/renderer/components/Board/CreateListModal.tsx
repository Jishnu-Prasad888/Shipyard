import React, { useState } from 'react'
import { X } from 'lucide-react'

interface CreateListModalProps {
  onClose: () => void
  onCreate: (list: any) => void
}

const PRESET_COLORS = [
  '#2563eb', // Blue
  '#0891b2', // Cyan
  '#7c3aed', // Violet
  '#059669', // Emerald
  '#d97706', // Amber
  '#dc2626', // Red
  '#db2777', // Pink
  '#0f172a'  // Dark
]

export const CreateListModal: React.FC<CreateListModalProps> = ({ onClose, onCreate }) => {
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
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
      <div
        className="w-full max-w-md animate-brutal-in"
        style={{
          background: 'var(--color-surface)',
          border: '4px solid var(--color-border-strong)',
          boxShadow: 'var(--shadow-brutal-lg)'
        }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-5 py-3 border-b-4"
          style={{ background: 'var(--color-primary)', borderColor: 'var(--color-border-strong)' }}
        >
          <h2 className="text-base font-black text-white uppercase tracking-wider">Create List</h2>
          <button
            onClick={onClose}
            className="w-7 h-7 border-2 border-white text-white flex items-center justify-center hover:bg-white/20 transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {/* Name */}
          <div>
            <label className="block text-xs font-black uppercase tracking-wider mb-1">List Name *</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3 py-2 border-2 text-sm font-bold focus:outline-none"
              style={{
                borderColor: 'var(--color-border-strong)',
                background: 'var(--color-background)',
                color: 'var(--color-text)',
                boxShadow: 'inset 2px 2px 0 rgba(0,0,0,0.05)'
              }}
              placeholder="e.g., TO DO, IN PROGRESS, DONE"
              autoFocus
            />
          </div>

          {/* Color */}
          <div>
            <label className="block text-xs font-black uppercase tracking-wider mb-2">List Color</label>
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
                    boxShadow: color === c ? '3px 3px 0 var(--color-border-strong)' : 'none',
                    transform: color === c ? 'translate(-1px, -1px)' : 'none'
                  }}
                />
              ))}
            </div>
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="btn-secondary text-xs uppercase tracking-wider">
              Cancel
            </button>
            <button
              type="submit"
              disabled={!name.trim()}
              className="btn-primary text-xs uppercase tracking-wider disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Create List
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
