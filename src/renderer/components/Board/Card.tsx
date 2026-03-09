import React, { useState } from 'react'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Calendar, CheckSquare, Link2, FileText } from 'lucide-react'
import { CardDetailsModal } from './CardDetailsModal'

interface CardProps {
  card: any
  listId: string
  onUpdate: () => void
}

export const Card: React.FC<CardProps> = ({ card, listId, onUpdate }) => {
  const [showDetails, setShowDetails] = useState(false)

  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: card.id,
    data: { type: 'card' }
  })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1
  }

  const completedSubCards = card.subCards?.filter((sc: any) => sc.completed)?.length || 0
  const totalSubCards = card.subCards?.length || 0
  const tags = typeof card.tags === 'string' ? JSON.parse(card.tags || '[]') : card.tags || []
  const connectedIds =
    typeof card.connectedCardIds === 'string'
      ? JSON.parse(card.connectedCardIds || '[]')
      : card.connectedCardIds || []
  const status =
    typeof card.status === 'string' && card.status.startsWith('{')
      ? JSON.parse(card.status)
      : card.status

  const isOverdue = card.deadline && card.deadline < Date.now()
  const cardColor = card.color || '#2563eb'

  return (
    <>
      <div
        ref={setNodeRef}
        style={{
          ...style,
          borderLeftColor: cardColor,
          borderLeftWidth: '4px'
        }}
        className="card group"
        onClick={() => setShowDetails(true)}
        {...attributes}
        {...listeners}
      >
        {/* Top accent line */}
        {card.color && (
          <div
            className="absolute top-0 left-0 right-0 h-0.5"
            style={{ background: `linear-gradient(90deg, ${card.color}, transparent)` }}
          />
        )}

        {/* Status badge */}
        {status && status.name && (
          <div className="mb-2">
            <span
              className="text-[10px] px-2 py-0.5 font-black uppercase tracking-wider border-2"
              style={{
                backgroundColor: (status.color || '#7c3aed') + '15',
                color: status.color || '#7c3aed',
                borderColor: status.color || '#7c3aed'
              }}
            >
              {status.name}
            </span>
          </div>
        )}

        {/* Title */}
        <h4 className="font-black text-sm leading-tight" style={{ color: 'var(--color-text)' }}>
          {card.title}
        </h4>

        {/* Description preview */}
        {card.description && (
          <p className="text-xs mt-1 line-clamp-2" style={{ color: 'var(--color-muted)' }}>
            {card.description}
          </p>
        )}

        {/* Tags */}
        {tags.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-2">
            {tags.slice(0, 3).map((tag: any) => (
              <span
                key={tag.id}
                className="text-[9px] px-1.5 py-0.5 font-black uppercase tracking-wider border"
                style={{
                  backgroundColor: (tag.color || '#2563eb') + '15',
                  color: tag.color || '#2563eb',
                  borderColor: tag.color || '#2563eb'
                }}
              >
                {tag.name}
              </span>
            ))}
            {tags.length > 3 && (
              <span className="text-[9px] font-black text-muted">+{tags.length - 3}</span>
            )}
          </div>
        )}

        {/* Footer metadata */}
        <div
          className="flex items-center gap-3 mt-2 pt-2 border-t"
          style={{ borderColor: 'var(--color-border)' }}
        >
          {card.deadline && (
            <div
              className={`flex items-center gap-1 text-[10px] font-black ${isOverdue ? 'text-red-600' : ''}`}
              style={!isOverdue ? { color: 'var(--color-muted)' } : {}}
            >
              <Calendar className="w-3 h-3" />
              <span>
                {new Date(card.deadline).toLocaleDateString('en-US', {
                  month: 'short',
                  day: 'numeric'
                })}
              </span>
            </div>
          )}

          {totalSubCards > 0 && (
            <div
              className="flex items-center gap-1 text-[10px] font-black"
              style={{ color: completedSubCards === totalSubCards ? 'var(--color-primary)' : 'var(--color-muted)' }}
            >
              <CheckSquare className="w-3 h-3" />
              <span>{completedSubCards}/{totalSubCards}</span>
            </div>
          )}

          {connectedIds.length > 0 && (
            <div className="flex items-center gap-1 text-[10px] font-black" style={{ color: 'var(--color-muted)' }}>
              <Link2 className="w-3 h-3" />
              <span>{connectedIds.length}</span>
            </div>
          )}

          {card.notes && (
            <div className="flex items-center text-[10px]" style={{ color: 'var(--color-muted)' }}>
              <FileText className="w-3 h-3" />
            </div>
          )}
        </div>
      </div>

      {showDetails && (
        <CardDetailsModal
          card={card}
          listId={listId}
          onClose={() => setShowDetails(false)}
          onUpdate={onUpdate}
        />
      )}
    </>
  )
}
