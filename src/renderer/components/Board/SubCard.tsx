import React from 'react'
import { Trash2, CheckCircle, Circle } from 'lucide-react'

interface SubCardProps {
  subCard: any
  onToggle: (id: string) => void
  onDelete: (id: string) => void
}

export const SubCard: React.FC<SubCardProps> = ({ subCard, onToggle, onDelete }) => {
  return (
    <div
      className={`flex items-center gap-3 p-3 rounded-lg border transition group ${
        subCard.completed
          ? 'border-primary/30 bg-primary-soft/50'
          : 'border-border hover:border-primary/50'
      }`}
    >
      <button
        onClick={() => onToggle(subCard.id)}
        className={`shrink-0 transition ${
          subCard.completed ? 'text-primary' : 'text-muted hover:text-primary'
        }`}
      >
        {subCard.completed ? <CheckCircle className="w-5 h-5" /> : <Circle className="w-5 h-5" />}
      </button>

      <span className={`flex-1 text-sm ${subCard.completed ? 'line-through text-muted' : ''}`}>
        {subCard.title}
      </span>

      <button
        onClick={() => onDelete(subCard.id)}
        className="opacity-0 group-hover:opacity-100 p-1 text-muted hover:text-alert transition"
      >
        <Trash2 className="w-4 h-4" />
      </button>
    </div>
  )
}
