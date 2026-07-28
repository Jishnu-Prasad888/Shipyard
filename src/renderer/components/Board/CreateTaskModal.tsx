import React, { useState } from 'react'
import { X, Plus } from 'lucide-react'

interface CreateTaskModalProps {
  onClose: () => void
  onCreate: (task: any) => void
  boardId: string
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

export const CreateTaskModal: React.FC<CreateTaskModalProps> = ({ onClose, onCreate, boardId }) => {
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [color, setColor] = useState('')
  const [deadline, setDeadline] = useState('')
  const [tags, setTags] = useState<any[]>([])
  const [newTagName, setNewTagName] = useState('')

  const handleAddTag = () => {
    if (newTagName.trim()) {
      const newTag = {
        id: Date.now().toString(),
        name: newTagName.trim(),
        color: PRESET_COLORS[tags.length % PRESET_COLORS.length]
      }
      setTags([...tags, newTag])
      setNewTagName('')
    }
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!title.trim()) return

    onCreate({
      title: title.trim(),
      description: description.trim(),
      color,
      deadline: deadline ? new Date(deadline).getTime() : null,
      tags: JSON.stringify(tags),
      boardId,
      notes: '',
      status: null,
      subtasks: [],
      connectedTaskIds: JSON.stringify([]),
      connectedColumnIds: JSON.stringify([])
    })
  }

  const inputStyle = {
    borderColor: 'var(--color-border-strong)',
    background: 'var(--color-background)',
    color: 'var(--color-text)',
    boxShadow: 'inset 0 1px 3px rgba(0,0,0,0.16)'
  }

  return (
    <div
      className="fixed inset-0 bg-black/70 flex items-center justify-center z-50"
      onClick={onClose}
    >
      <div
        className="aero-window w-full max-w-lg animate-brutal-in"
        onClick={(e) => e.stopPropagation()}
        style={{
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
          <h2 className="text-base font-black text-white uppercase tracking-wider">Create Task</h2>
          <button
            onClick={onClose}
            className="aero-icon-button w-7 h-7 text-white flex items-center justify-center transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {/* Title */}
          <div>
            <label className="block text-xs font-black uppercase tracking-wider mb-1">
              Title *
            </label>
            <textarea
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="aero-input w-full px-3 py-2 text-sm font-semibold focus:outline-none resize-none overflow-hidden break-words whitespace-pre-wrap"
              style={inputStyle}
              placeholder="Task title"
              rows={1}
              onInput={(e) => {
                e.currentTarget.style.height = 'auto'
                e.currentTarget.style.height = e.currentTarget.scrollHeight + 'px'
              }}
              ref={(el) => {
                if (el) {
                  el.style.height = 'auto'
                  el.style.height = el.scrollHeight + 'px'
                }
              }}
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
              className="aero-input w-full px-3 py-2 text-sm font-semibold focus:outline-none resize-none"
              style={inputStyle}
              rows={3}
              placeholder="Add a description..."
            />
          </div>

          {/* Color */}
          <div>
            <label className="block text-xs font-black uppercase tracking-wider mb-2">
              Task Accent Color
            </label>
            <div className="flex gap-2">
              {PRESET_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(color === c ? '' : c)}
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

          {/* Deadline */}
          <div>
            <label className="block text-xs font-black uppercase tracking-wider mb-1">
              Deadline
            </label>
            <input
              type="date"
              value={deadline}
              onChange={(e) => setDeadline(e.target.value)}
              className="aero-input w-full px-3 py-2 text-sm font-semibold focus:outline-none"
              style={inputStyle}
            />
          </div>

          {/* Tags */}
          <div>
            <label className="block text-xs font-black uppercase tracking-wider mb-1">Tags</label>
            <div className="flex gap-2 mb-2">
              <input
                type="text"
                value={newTagName}
                onChange={(e) => setNewTagName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), handleAddTag())}
                className="aero-input flex-1 px-3 py-2 text-sm font-semibold focus:outline-none"
                style={inputStyle}
                placeholder="Tag name..."
              />
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
                {tags.map((tag) => (
                  <span
                    key={tag.id}
                    className="text-xs px-2 py-0.5 font-black uppercase tracking-wider border-2 flex items-center gap-1"
                    style={{
                      backgroundColor: tag.color + '15',
                      color: tag.color,
                      borderColor: tag.color
                    }}
                  >
                    {tag.name}
                    <button
                      type="button"
                      onClick={() => setTags(tags.filter((t) => t.id !== tag.id))}
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
              disabled={!title.trim()}
              className="btn-primary text-xs uppercase tracking-wider disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Create Task
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
