import React, { useState } from 'react'
import { X, Plus, Tag } from 'lucide-react'

interface CreateDockModalProps {
  onClose: () => void
  onCreate: (dock: any) => void
  initialData?: any
  title?: string
}

const COLORS = [
  '#ef4444',
  '#f97316',
  '#eab308',
  '#22c55e',
  '#0ea5b7',
  '#3b82f6',
  '#a855f7',
  '#ec4899',
  '#64748b',
  '#ffffff'
]

export const CreateDockModal: React.FC<CreateDockModalProps> = ({
  onClose,
  onCreate,
  initialData,
  title = 'Create Board'
}) => {
  const [name, setName] = useState(initialData?.name || '')
  const [description, setDescription] = useState(initialData?.description || '')
  const [color, setColor] = useState(initialData?.color || COLORS[4])
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

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="w-full max-w-md surface rounded-xl overflow-hidden flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between p-4 border-b border-border">
          <h2 className="text-lg font-bold">{title}</h2>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-primary-soft transition">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6 overflow-auto">
          <div>
            <label className="block text-sm font-medium mb-1.5">Board Name *</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3 py-2 border border-border rounded-lg bg-surface text-text focus:outline-none focus:border-primary"
              placeholder="Board name"
              autoFocus
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1.5">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full px-3 py-2 border border-border rounded-lg bg-surface text-text focus:outline-none focus:border-primary"
              rows={3}
              placeholder="What is this board for?"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">Accent Color</label>
            <div className="flex flex-wrap gap-2">
              {COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  className={`w-7 h-7 rounded-full transition-transform ${
                    color === c ? 'ring-2 ring-primary ring-offset-2 scale-110' : 'hover:scale-110'
                  }`}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">Tags</label>
            <div className="flex gap-2 mb-3">
              <div className="relative flex-1">
                <Tag className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted" />
                <input
                  type="text"
                  value={newTag}
                  onChange={(e) => setNewTag(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), handleAddTag())}
                  className="w-full pl-8 pr-3 py-2 border border-border rounded-lg bg-surface text-text text-sm focus:outline-none focus:border-primary"
                  placeholder="Add tag..."
                />
              </div>
              <button
                type="button"
                onClick={handleAddTag}
                className="px-3 py-2 bg-primary-soft text-primary rounded-lg hover:bg-primary hover:text-white transition"
              >
                <Plus className="w-4 h-4" />
              </button>
            </div>
            <div className="flex flex-wrap gap-2">
              {tags.map((t) => (
                <span
                  key={t}
                  className="flex items-center gap-1.5 px-2 py-1 bg-primary-soft text-primary rounded-md text-xs font-medium"
                >
                  {t}
                  <button
                    type="button"
                    onClick={() => setTags(tags.filter((existing) => existing !== t))}
                    className="hover:text-alert"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </span>
              ))}
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2 pb-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border border-border rounded-lg hover:bg-primary-soft transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!name.trim()}
              className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-opacity-90 transition disabled:opacity-50"
            >
              {initialData ? 'Update Board' : 'Create Board'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

