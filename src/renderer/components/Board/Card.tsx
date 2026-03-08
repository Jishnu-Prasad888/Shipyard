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
    opacity: isDragging ? 0.5 : 1
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

  return (
    <>
      <div
        ref={setNodeRef}
        style={{
          ...style,
          borderLeft: card.color ? `4px solid ${card.color}` : undefined
        }}
        className="card group"
        onClick={() => setShowDetails(true)}
        {...attributes}
        {...listeners}
      >
        {/* Status badge */}
        {status && status.name && (
          <div className="mb-2">
            <span
              className="text-xs px-2 py-0.5 rounded-full font-medium"
              style={{
                backgroundColor: (status.color || '#8b5cf6') + '20',
                color: status.color || '#8b5cf6'
              }}
            >
              {status.name}
            </span>
          </div>
        )}

        {/* Title */}
        <h4 className="font-medium text-sm">{card.title}</h4>

        {/* Description preview */}
        {card.description && (
          <p className="text-xs text-muted mt-1 line-clamp-2">{card.description}</p>
        )}

        {/* Tags */}
        {tags.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-2">
            {tags.slice(0, 3).map((tag: any) => (
              <span
                key={tag.id}
                className="text-[10px] px-1.5 py-0.5 rounded font-medium"
                style={{
                  backgroundColor: (tag.color || '#0ea5b7') + '20',
                  color: tag.color || '#0ea5b7'
                }}
              >
                {tag.name}
              </span>
            ))}
            {tags.length > 3 && <span className="text-[10px] text-muted">+{tags.length - 3}</span>}
          </div>
        )}

        {/* Footer metadata */}
        <div className="flex items-center gap-3 mt-2">
          {card.deadline && (
            <div
              className={`flex items-center gap-1 text-[10px] ${isOverdue ? 'text-alert' : 'text-muted'}`}
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
              className={`flex items-center gap-1 text-[10px] ${completedSubCards === totalSubCards ? 'text-primary' : 'text-muted'}`}
            >
              <CheckSquare className="w-3 h-3" />
              <span>
                {completedSubCards}/{totalSubCards}
              </span>
            </div>
          )}

          {connectedIds.length > 0 && (
            <div className="flex items-center gap-1 text-[10px] text-muted">
              <Link2 className="w-3 h-3" />
              <span>{connectedIds.length}</span>
            </div>
          )}

          {card.notes && (
            <div className="flex items-center text-[10px] text-muted">
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
