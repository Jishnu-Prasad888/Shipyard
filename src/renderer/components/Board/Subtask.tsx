import React from 'react'
import { Trash2, CheckCircle, Circle } from 'lucide-react'

interface SubtaskProps {
  subtask: any
  onToggle: (id: string) => void
  onDelete: (id: string) => void
}

export const Subtask: React.FC<SubtaskProps> = ({ subtask, onToggle, onDelete }) => {
  return (
    <div
      className={`flex items-center gap-3 p-3 rounded-sm border transition group ${
        subtask.completed
          ? 'border-primary/30 bg-primary-soft/50'
          : 'border-border hover:border-primary/50'
      }`}
    >
      <button
        onClick={() => onToggle(subtask.id)}
        className={`shrink-0 transition ${
          subtask.completed ? 'text-primary' : 'text-muted hover:text-primary'
        }`}
      >
        {subtask.completed ? <CheckCircle className="w-5 h-5" /> : <Circle className="w-5 h-5" />}
      </button>

      <span
        className={`flex-1 text-sm break-words whitespace-pre-wrap ${subtask.completed ? 'line-through text-muted' : ''}`}
      >
        {subtask.title}
      </span>

      <button
        onClick={() => onDelete(subtask.id)}
        className="opacity-0 group-hover:opacity-100 p-1 text-muted hover:text-alert transition"
      >
        <Trash2 className="w-4 h-4" />
      </button>
    </div>
  )
}
