import React, { useState } from 'react'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Plus, MoreHorizontal, Edit2, Trash2 } from 'lucide-react'
import { Card } from './Card'
import { CreateCardModal } from './CreateCardModal'

interface ListProps {
  list: any
  boardId: string
  onCardsChange: () => void
}

export const List: React.FC<ListProps> = ({ list, boardId, onCardsChange }) => {
  const [showCreateCard, setShowCreateCard] = useState(false)
  const [showMenu, setShowMenu] = useState(false)
  const [isEditing, setIsEditing] = useState(false)
  const [editedName, setEditedName] = useState(list.name)

  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: list.id,
    data: { type: 'list' }
  })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1
  }

  const handleUpdateList = async () => {
    if (editedName.trim() && editedName !== list.name) {
      await window.electron.db.update('lists', list.id, {
        name: editedName,
        updatedAt: Date.now()
      })
      list.name = editedName
    }
    setIsEditing(false)
  }

  const handleDeleteList = async () => {
    if (confirm('Are you sure you want to delete this list? All cards will be deleted.')) {
      // Delete all cards in this list first
      for (const card of list.cards || []) {
        await window.electron.db.delete('cards', card.id)
      }
      await window.electron.db.delete('lists', list.id)
      onCardsChange()
    }
  }

  const handleCreateCard = async (cardData: any) => {
    const newCard = {
      ...cardData,
      listId: list.id,
      boardId,
      order: list.cards?.length || 0,
      createdAt: Date.now(),
      updatedAt: Date.now()
    }

    await window.electron.db.create('cards', newCard)
    onCardsChange()
    setShowCreateCard(false)
  }

  const cardCount = list.cards?.length || 0

  return (
    <div ref={setNodeRef} style={style} className="column" {...attributes} {...listeners}>
      {/* List Header */}
      <div className="flex items-center justify-between">
        {isEditing ? (
          <input
            type="text"
            value={editedName}
            onChange={(e) => setEditedName(e.target.value)}
            onBlur={handleUpdateList}
            onKeyDown={(e) => e.key === 'Enter' && handleUpdateList()}
            className="flex-1 px-2 py-1 border border-primary rounded bg-surface text-text focus:outline-none text-sm"
            autoFocus
          />
        ) : (
          <div className="flex items-center gap-2">
            {list.color && (
              <div className="w-3 h-3 rounded-full" style={{ backgroundColor: list.color }} />
            )}
            <h3 className="font-semibold text-sm">{list.name}</h3>
            <span className="text-xs text-muted bg-primary-soft px-1.5 py-0.5 rounded-full">
              {cardCount}
            </span>
          </div>
        )}

        <div className="relative">
          <button
            onClick={(e) => {
              e.stopPropagation()
              setShowMenu(!showMenu)
            }}
            className="p-1 rounded hover:bg-primary-soft transition"
          >
            <MoreHorizontal className="w-4 h-4" />
          </button>

          {showMenu && (
            <div className="absolute right-0 top-full mt-1 w-48 surface rounded-lg shadow-lg border border-border z-10">
              <button
                onClick={() => {
                  setIsEditing(true)
                  setShowMenu(false)
                }}
                className="w-full flex items-center gap-2 px-4 py-2 hover:bg-primary-soft transition text-left text-sm"
              >
                <Edit2 className="w-4 h-4" />
                Rename
              </button>
              <button
                onClick={handleDeleteList}
                className="w-full flex items-center gap-2 px-4 py-2 hover:bg-primary-soft transition text-left text-alert text-sm"
              >
                <Trash2 className="w-4 h-4" />
                Delete
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Cards */}
      <div className="flex-1 space-y-2 min-h-[40px]">
        {list.cards?.map((card: any) => (
          <Card key={card.id} card={card} listId={list.id} onUpdate={onCardsChange} />
        ))}
      </div>

      {/* Add Card */}
      <button
        onClick={() => setShowCreateCard(true)}
        className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-primary-soft transition text-muted hover:text-primary text-sm"
      >
        <Plus className="w-4 h-4" />
        Add Card
      </button>

      {showCreateCard && (
        <CreateCardModal
          onClose={() => setShowCreateCard(false)}
          onCreate={handleCreateCard}
          boardId={boardId}
        />
      )}
    </div>
  )
}
