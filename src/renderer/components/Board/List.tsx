import React, { useState, useEffect } from 'react'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Plus, Edit2, Trash2, Eye, EyeOff } from 'lucide-react'
import { Card } from './Card'
import { CreateCardModal } from './CreateCardModal'

interface ListProps {
  list: any
  boardId: string
  onCardsChange: () => void
}

// Default statuses matching CardDetailsModal
const DEFAULT_STATUSES = [
  { id: '__yet_to_start__', name: 'Yet to Start', color: '#6b7280' },
  { id: '__working__', name: 'Working', color: '#f59e0b' },
  { id: '__completed__', name: 'Completed', color: '#ef4444' }
]

export const List: React.FC<ListProps> = ({ list, boardId, onCardsChange }) => {
  const [showCreateCard, setShowCreateCard] = useState(false)
  const [isEditing, setIsEditing] = useState(false)
  const [editedName, setEditedName] = useState(list.name)
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null)
  const [hideStatuses, setHideStatuses] = useState<string[]>([])
  const [showHidePanel, setShowHidePanel] = useState(false)
  const [boardStatuses, setBoardStatuses] = useState<any[]>([])

  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: list.id,
    data: { type: 'list' }
  })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1
  }

  useEffect(() => {
    const handleClick = () => {
      setContextMenu(null)
      setShowHidePanel(false)
    }
    window.addEventListener('click', handleClick)
    return () => window.removeEventListener('click', handleClick)
  }, [])

  useEffect(() => {
    loadBoardStatuses()
  }, [boardId])

  const loadBoardStatuses = async () => {
    const dbStatuses = await window.electron.db.findAll('statuses')
    const filtered = dbStatuses.filter((s: any) => s.boardId === boardId)
    setBoardStatuses([...DEFAULT_STATUSES, ...filtered])
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
    setContextMenu(null)
    if (confirm('Delete this list? All cards inside will be removed.')) {
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

  const openContextMenu = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setContextMenu({ x: e.clientX, y: e.clientY })
  }

  const toggleHideStatus = (statusName: string) => {
    setHideStatuses((prev) =>
      prev.includes(statusName) ? prev.filter((s) => s !== statusName) : [...prev, statusName]
    )
  }

  // Filter cards based on hidden statuses
  const visibleCards = (list.cards || []).filter((card: any) => {
    if (hideStatuses.length === 0) return true
    const status =
      typeof card.status === 'string' && card.status.startsWith('{')
        ? JSON.parse(card.status)
        : card.status
    if (!status) return true
    return !hideStatuses.includes(status.name)
  })

  const hiddenCount = (list.cards?.length || 0) - visibleCards.length
  const cardCount = list.cards?.length || 0
  const listColor = list.color || '#2563eb'

  return (
    <>
      <div
        ref={setNodeRef}
        style={style}
        className="column"
        onContextMenu={openContextMenu}
      >
        {/* List Header */}
        <div
          className="flex items-center justify-between pb-3 border-b-2 shrink-0"
          style={{ borderColor: 'var(--color-border-strong)' }}
        >
          {isEditing ? (
            <input
              type="text"
              value={editedName}
              onChange={(e) => setEditedName(e.target.value)}
              onBlur={handleUpdateList}
              onKeyDown={(e) => e.key === 'Enter' && handleUpdateList()}
              className="flex-1 px-2 py-1 border-2 bg-transparent text-sm font-black uppercase focus:outline-none"
              style={{
                borderColor: 'var(--color-primary)',
                color: 'var(--color-text)'
              }}
              autoFocus
            />
          ) : (
            <div className="flex items-center gap-2 flex-1 min-w-0">
              <div
                className="w-3 h-3 border-2 shrink-0"
                style={{ backgroundColor: listColor, borderColor: 'var(--color-border-strong)' }}
              />
              <h3
                className="font-black text-xs uppercase tracking-wider truncate"
                style={{ color: 'var(--color-text)' }}
              >
                {list.name}
              </h3>
              <span
                className="text-[10px] font-black px-1.5 py-0.5 shrink-0 border-2 ml-auto"
                style={{
                  borderColor: listColor,
                  color: listColor,
                  background: listColor + '15'
                }}
              >
                {cardCount}
              </span>
            </div>
          )}

          {/* Eye (hide) button */}
          <div className="relative ml-1">
            <button
              onClick={(e) => {
                e.stopPropagation()
                setShowHidePanel((v) => !v)
              }}
              className="p-1 transition-all"
              title="Hide cargo by status"
              style={{
                color: hideStatuses.length > 0 ? 'var(--color-warning)' : 'var(--color-muted)',
                opacity: hideStatuses.length > 0 ? 1 : 0.5
              }}
            >
              {hideStatuses.length > 0 ? (
                <EyeOff className="w-3.5 h-3.5" />
              ) : (
                <Eye className="w-3.5 h-3.5" />
              )}
            </button>

            {showHidePanel && (
              <div
                className="absolute right-0 top-full mt-1 z-50 min-w-[200px] animate-brutal-in"
                style={{
                  background: 'var(--color-surface)',
                  border: '3px solid var(--color-border-strong)',
                  boxShadow: 'var(--shadow-brutal)'
                }}
                onClick={(e) => e.stopPropagation()}
              >
                <div
                  className="px-3 py-2 text-[10px] font-black uppercase tracking-widest border-b-2"
                  style={{
                    color: 'white',
                    background: 'var(--color-primary)',
                    borderColor: 'var(--color-border-strong)'
                  }}
                >
                  Hide Cargo by Status
                </div>
                {boardStatuses.map((s: any) => {
                  const isHidden = hideStatuses.includes(s.name)
                  return (
                    <button
                      key={s.id}
                      onClick={() => toggleHideStatus(s.name)}
                      className="w-full flex items-center justify-between px-3 py-2 text-xs font-bold hover:bg-primary-soft transition border-b"
                      style={{ borderColor: 'var(--color-border)', color: 'var(--color-text)' }}
                    >
                      <div className="flex items-center gap-2">
                        <div
                          className="w-2.5 h-2.5 border"
                          style={{ backgroundColor: s.color, borderColor: s.color }}
                        />
                        <span>{s.name}</span>
                      </div>
                      <div
                        className="w-4 h-4 border-2 flex items-center justify-center text-[9px] font-black"
                        style={{
                          borderColor: isHidden ? 'var(--color-warning)' : 'var(--color-border)',
                          background: isHidden ? 'var(--color-warning)' : 'transparent',
                          color: isHidden ? 'white' : 'transparent'
                        }}
                      >
                        ✓
                      </div>
                    </button>
                  )
                })}
                {hideStatuses.length > 0 && (
                  <button
                    onClick={() => setHideStatuses([])}
                    className="w-full text-xs font-black px-3 py-2 text-center"
                    style={{ color: 'var(--color-primary)' }}
                  >
                    Show All
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Drag handle */}
          <div
            {...attributes}
            {...listeners}
            className="ml-1 cursor-grab active:cursor-grabbing opacity-40 hover:opacity-100 transition-opacity shrink-0"
            title="Drag to reorder"
          >
            <div className="flex flex-col gap-0.5 p-1">
              <div className="w-4 h-0.5 rounded" style={{ background: 'var(--color-border-strong)' }} />
              <div className="w-4 h-0.5 rounded" style={{ background: 'var(--color-border-strong)' }} />
              <div className="w-4 h-0.5 rounded" style={{ background: 'var(--color-border-strong)' }} />
            </div>
          </div>
        </div>

        {/* Hidden cargo notice */}
        {hiddenCount > 0 && (
          <div
            className="text-[10px] font-black px-2 py-1 flex items-center gap-1 border-b-2"
            style={{
              color: 'var(--color-warning)',
              background: 'rgba(217,123,102,0.08)',
              borderColor: 'var(--color-warning)'
            }}
          >
            <EyeOff className="w-3 h-3" />
            {hiddenCount} cargo hidden
          </div>
        )}

        {/* Cards — scrollable */}
        <div className="flex-1 space-y-2 min-h-[40px] overflow-y-auto">
          {visibleCards.map((card: any) => (
            <Card key={card.id} card={card} listId={list.id} onUpdate={onCardsChange} />
          ))}
        </div>

        {/* Add Card — sticky at the bottom, always visible */}
        <div className="shrink-0 pt-2 mt-auto">
          <button
            onClick={() => setShowCreateCard(true)}
            className="flex items-center justify-center gap-2 w-full px-3 py-2 border-2 border-dashed transition-all duration-100 group font-black text-xs uppercase tracking-wider"
            style={{
              borderColor: 'var(--color-border)',
              color: 'var(--color-muted)'
            }}
            onMouseOver={(e) => {
              e.currentTarget.style.borderColor = 'var(--color-primary)'
              e.currentTarget.style.color = 'var(--color-primary)'
              e.currentTarget.style.background = 'var(--color-primary-soft)'
            }}
            onMouseOut={(e) => {
              e.currentTarget.style.borderColor = 'var(--color-border)'
              e.currentTarget.style.color = 'var(--color-muted)'
              e.currentTarget.style.background = 'transparent'
            }}
          >
            <Plus className="w-4 h-4 stroke-[3px] group-hover:rotate-90 transition-transform" />
            Add Cargo
          </button>
        </div>
      </div>

      {/* Right-click context menu */}
      {contextMenu && (
        <div
          className="context-menu fixed z-50 min-w-[180px] animate-brutal-in"
          style={{
            top: Math.min(contextMenu.y, window.innerHeight - 150),
            left: Math.min(contextMenu.x, window.innerWidth - 200)
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <div
            className="px-4 py-2 text-xs font-black uppercase tracking-widest text-white border-b-2"
            style={{ background: 'var(--color-primary)', borderColor: 'var(--color-border-strong)' }}
          >
            {list.name}
          </div>
          <button
            className="context-menu-item border-b-2"
            style={{ borderColor: 'var(--color-border)' }}
            onClick={() => {
              setIsEditing(true)
              setContextMenu(null)
            }}
          >
            <Edit2 className="w-4 h-4" />
            Rename Manifest
          </button>
          <button
            className="context-menu-item border-b-2 danger"
            style={{ borderColor: 'var(--color-border)' }}
            onClick={handleDeleteList}
          >
            <Trash2 className="w-4 h-4" />
            Jettison Manifest
          </button>
          <button
            className="context-menu-item"
            onClick={() => {
              setShowCreateCard(true)
              setContextMenu(null)
            }}
          >
            <Plus className="w-4 h-4" />
            Add Cargo
          </button>
        </div>
      )}

      {showCreateCard && (
        <CreateCardModal
          onClose={() => setShowCreateCard(false)}
          onCreate={handleCreateCard}
          boardId={boardId}
        />
      )}
    </>
  )
}
