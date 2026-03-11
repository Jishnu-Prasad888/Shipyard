import React, { useState } from 'react'
import { X, Plus, Tag } from 'lucide-react'

interface CreateDockModalProps {
  onClose: () => void
  onCreate: (dock: any) => void
  initialData?: any
  title?: string
}

const COLORS = [
  '#2563eb', // Blue
  '#0891b2', // Cyan
  '#7c3aed', // Violet
  '#059669', // Emerald
  '#d97706', // Amber
  '#dc2626', // Red
  '#db2777', // Pink
  '#0f172a', // Dark
  '#3b82f6', // Light blue
  '#22d3ee'  // Teal
]

export const CreateDockModal: React.FC<CreateDockModalProps> = ({
  onClose,
  onCreate,
  initialData,
  title = 'Create Board'
}) => {
  const [name, setName] = useState(initialData?.name || '')
  const [description, setDescription] = useState(initialData?.description || '')
  const [color, setColor] = useState(initialData?.color || COLORS[0])
  const [tags, setTags] = useState<string[]>(() => {
    if (!initialData?.tags) return []
    if (Array.isArray(initialData.tags)) return initialData.tags
    try {
      return JSON.parse(initialData.tags)
    } catch {
      return []
    }
  })
  const [newTag, setNewTag] = useState('')

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return

    onCreate({
      name: name.trim(),
      description: description.trim(),
      color,
      tags: JSON.stringify(tags)
    })
  }

  const handleAddTag = () => {
    if (newTag.trim() && !tags.includes(newTag.trim())) {
      setTags([...tags, newTag.trim()])
      setNewTag('')
    }
  }

  const inputStyle: React.CSSProperties = {
    borderColor: 'var(--color-border-strong)',
    background: 'var(--color-background)',
    color: 'var(--color-text)',
    boxShadow: 'inset 2px 2px 0 rgba(0,0,0,0.05)'
  }

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50" onClick={onClose}>
      <div
        className="w-full max-w-md overflow-hidden flex flex-col max-h-[90vh] animate-brutal-in"
        onClick={(e) => e.stopPropagation()}
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
          <h2 className="text-base font-black text-white uppercase tracking-wider">{title}</h2>
          <button
            onClick={onClose}
            className="w-7 h-7 border-2 border-white text-white flex items-center justify-center hover:bg-white/20 transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4 overflow-auto">
          {/* Name */}
          <div>
            <label className="block text-xs font-black uppercase tracking-wider mb-1">
              Name *
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3 py-2 border-2 text-sm font-bold focus:outline-none"
              style={inputStyle}
              placeholder="Board name"
              autoFocus
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-xs font-black uppercase tracking-wider mb-1">
              Description
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full px-3 py-2 border-2 text-sm font-bold focus:outline-none resize-none"
              style={inputStyle}
              rows={2}
              placeholder="What is this board for?"
            />
          </div>

          {/* Color */}
          <div>
            <label className="block text-xs font-black uppercase tracking-wider mb-2">
              Accent Color
            </label>
            <div className="flex flex-wrap gap-2">
              {COLORS.map((c) => (
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

          {/* Tags */}
          <div>
            <label className="block text-xs font-black uppercase tracking-wider mb-2">Tags</label>
            <div className="flex gap-2 mb-2">
              <div className="relative flex-1">
                <Tag className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5" style={{ color: 'var(--color-muted)' }} />
                <input
                  type="text"
                  value={newTag}
                  onChange={(e) => setNewTag(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), handleAddTag())}
                  className="w-full pl-8 pr-3 py-2 border-2 text-sm font-bold focus:outline-none"
                  style={inputStyle}
                  placeholder="Add tag..."
                />
              </div>
              <button
                type="button"
                onClick={handleAddTag}
                className="btn-primary px-3 py-2 text-xs"
              >
                <Plus className="w-4 h-4 stroke-[3px]" />
              </button>
            </div>
            {tags.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {tags.map((t) => (
                  <span
                    key={t}
                    className="flex items-center gap-1.5 px-2 py-1 border-2 text-xs font-black uppercase tracking-wider"
                    style={{
                      borderColor: color,
                      color: color,
                      background: color + '15'
                    }}
                  >
                    {t}
                    <button
                      type="button"
                      onClick={() => setTags(tags.filter((existing) => existing !== t))}
                      className="hover:opacity-60 transition-opacity"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-2 pt-1 pb-1">
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
              {initialData ? 'Update' : 'Create'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
