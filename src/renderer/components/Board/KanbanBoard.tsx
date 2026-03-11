import React, { useEffect, useState } from 'react'
import {
  DndContext,
  DragEndEvent,
  DragOverEvent,
  DragStartEvent,
  PointerSensor,
  useSensor,
  useSensors
} from '@dnd-kit/core'
import { SortableContext, horizontalListSortingStrategy, arrayMove } from '@dnd-kit/sortable'
import { Plus, LayoutList, Hash, Pencil, Check, X } from 'lucide-react'
import { List } from './List'
import { CreateListModal } from './CreateListModal'

const SHIP_COLORS = [
  '#2D82B7', '#0B2545', '#1F5F8B', '#3FA796', '#5FA8D3',
  '#2563eb', '#7c3aed', '#db2777', '#ea580c', '#16a34a',
  '#0891b2', '#9333ea', '#e11d48', '#f59e0b', '#6366f1',
  '#64748b', '#111827', '#be123c', '#15803d', '#1d4ed8'
]

interface KanbanBoardProps {
  boardId: string
  searchQuery?: string
}

export const KanbanBoard: React.FC<KanbanBoardProps> = ({ boardId, searchQuery = '' }) => {
  const [board, setBoard] = useState<any>(null)
  const [lists, setLists] = useState<any[]>([])
  const [showCreateList, setShowCreateList] = useState(false)
  const [, setActiveId] = useState<string | null>(null)

  // Edit ship state
  const [editing, setEditing] = useState(false)
  const [editName, setEditName] = useState('')
  const [editColor, setEditColor] = useState('')
  const [saving, setSaving] = useState(false)

  const filteredLists = searchQuery
    ? lists.map((list) => ({
        ...list,
        cards: list.cards?.filter(
          (card: any) =>
            card.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
            card.description?.toLowerCase().includes(searchQuery.toLowerCase())
        )
      }))
    : lists

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  )

  useEffect(() => { loadBoard() }, [boardId])

  const loadBoard = async () => {
    const boardData = await window.electron.db.getBoardWithDetails(boardId)
    if (boardData) {
      setBoard(boardData)
      setLists(boardData.lists || [])
    }
  }

  const openEdit = () => {
    setEditName(board?.name || '')
    setEditColor(board?.color || SHIP_COLORS[0])
    setEditing(true)
  }

  const cancelEdit = () => setEditing(false)

  const saveEdit = async () => {
    if (!editName.trim()) return
    setSaving(true)
    try {
      await window.electron.db.update('boards', boardId, {
        name: editName.trim(),
        color: editColor,
        updatedAt: Date.now()
      })
      await loadBoard()
      setEditing(false)
    } finally {
      setSaving(false)
    }
  }

  const handleDragStart = (event: DragStartEvent) => setActiveId(event.active.id as string)

  const handleDragOver = (event: DragOverEvent) => {
    const { active, over } = event
    if (!over) return
    const isActiveCard = active.data.current?.type === 'card'
    const isOverCard = over.data.current?.type === 'card'
    if (isActiveCard && isOverCard) handleCardReorder(active.id as string, over.id as string)
  }

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveId(null)
    const { active, over } = event
    if (!over) return
    if (active.data.current?.type === 'list' && over.data.current?.type === 'list')
      handleListReorder(active.id as string, over.id as string)
  }

  const handleCardReorder = async (activeId: string, overId: string) => {
    let activeCard: any = null, activeList: any = null
    let overCard: any = null, overList: any = null
    for (const list of lists) {
      const card = list.cards?.find((c: any) => c.id === activeId)
      if (card) { activeCard = card; activeList = list }
      const overCardFound = list.cards?.find((c: any) => c.id === overId)
      if (overCardFound) { overCard = overCardFound; overList = list }
    }
    if (!activeCard || !overCard) return

    if (activeList.id === overList.id) {
      const oldIndex = activeList.cards.findIndex((c: any) => c.id === activeId)
      const newIndex = activeList.cards.findIndex((c: any) => c.id === overId)
      const reorderedCards = arrayMove<any>(activeList.cards, oldIndex, newIndex)
      for (let i = 0; i < reorderedCards.length; i++) {
        if (reorderedCards[i].order !== i) {
          reorderedCards[i].order = i
          await window.electron.db.update('cards', reorderedCards[i].id, { order: i })
        }
      }
      setLists(prev => prev.map(l => l.id === activeList.id ? { ...l, cards: reorderedCards } : l))
    } else {
      const newActiveCards = activeList.cards.filter((c: any) => c.id !== activeId)
      const newOverCards = [...overList.cards]
      const overIndex = newOverCards.findIndex((c: any) => c.id === overId)
      newOverCards.splice(overIndex, 0, activeCard)
      await window.electron.db.update('cards', activeId, { listId: overList.id, order: overIndex })
      for (let i = 0; i < newActiveCards.length; i++)
        await window.electron.db.update('cards', newActiveCards[i].id, { order: i })
      for (let i = 0; i < newOverCards.length; i++)
        await window.electron.db.update('cards', newOverCards[i].id, { order: i })
      setLists(prev => prev.map(l => {
        if (l.id === activeList.id) return { ...l, cards: newActiveCards }
        if (l.id === overList.id) return { ...l, cards: newOverCards }
        return l
      }))
    }
  }

  const handleListReorder = async (activeId: string, overId: string) => {
    const oldIndex = lists.findIndex((l: any) => l.id === activeId)
    const newIndex = lists.findIndex((l: any) => l.id === overId)
    const newLists = arrayMove(lists, oldIndex, newIndex)
    for (let i = 0; i < newLists.length; i++) {
      if (newLists[i].order !== i) {
        newLists[i].order = i
        await window.electron.db.update('lists', newLists[i].id, { order: i })
      }
    }
    setLists(newLists)
  }

  const handleCreateList = async (listData: any) => {
    await window.electron.db.create('lists', {
      ...listData, boardId, order: lists.length, createdAt: Date.now(), updatedAt: Date.now()
    })
    loadBoard()
    setShowCreateList(false)
  }

  if (!board) return null

  const totalCards = lists.reduce((acc, l) => acc + (l.cards?.length || 0), 0)
  const shipColor = board.color || 'var(--color-primary)'

  return (
    <div className="h-full flex flex-col">
      {/* ── Board header ── */}
      <div className="mb-6 pb-4 border-b-4" style={{ borderColor: 'var(--color-border-strong)' }}>
        {!editing ? (
          /* View mode */
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-1.5 shrink-0 self-stretch" style={{ background: shipColor, borderRadius: '2px' }} />
              <div className="min-w-0">
                <h1 className="text-3xl font-black uppercase tracking-tight" style={{ color: 'var(--color-text)' }}>
                  {board.name}
                </h1>
                <div className="flex items-center gap-4 mt-1">
                  <span
                    className="flex items-center gap-1.5 text-xs font-black uppercase tracking-wider px-2 py-1 border-2"
                    style={{ borderColor: 'var(--color-primary)', color: 'var(--color-primary)', background: 'var(--color-primary-soft)' }}
                  >
                    <LayoutList className="w-3 h-3" />
                    {lists.length} Manifests
                  </span>
                  <span
                    className="flex items-center gap-1.5 text-xs font-black uppercase tracking-wider px-2 py-1 border-2"
                    style={{ borderColor: 'var(--color-cyan, #0891b2)', color: 'var(--color-cyan, #0891b2)', background: '#ecfeff' }}
                  >
                    <Hash className="w-3 h-3" />
                    {totalCards} Cargo
                  </span>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={openEdit}
                className="flex items-center gap-1.5 px-3 py-2 border-2 text-xs font-black uppercase tracking-wider transition-all duration-100"
                style={{ borderColor: 'var(--color-border)', color: 'var(--color-muted)' }}
                onMouseOver={e => {
                  e.currentTarget.style.borderColor = 'var(--color-primary)'
                  e.currentTarget.style.color = 'var(--color-primary)'
                  e.currentTarget.style.background = 'var(--color-primary-soft)'
                }}
                onMouseOut={e => {
                  e.currentTarget.style.borderColor = 'var(--color-border)'
                  e.currentTarget.style.color = 'var(--color-muted)'
                  e.currentTarget.style.background = 'transparent'
                }}
              >
                <Pencil className="w-3.5 h-3.5" />
                Edit Ship
              </button>
              <button onClick={() => setShowCreateList(true)} className="btn-primary text-xs uppercase tracking-wider">
                <Plus className="w-4 h-4 stroke-[3px]" />
                Add Manifest
              </button>
            </div>
          </div>
        ) : (
          /* Edit mode inline panel */
          <div
            className="p-4 border-2 space-y-4 animate-brutal-in"
            style={{ borderColor: 'var(--color-primary)', background: 'var(--color-background)', boxShadow: 'var(--shadow-brutal-sm)' }}
          >
            <div className="flex items-center gap-2">
              <Pencil className="w-4 h-4" style={{ color: 'var(--color-primary)' }} />
              <span className="font-black text-xs uppercase tracking-widest" style={{ color: 'var(--color-muted)' }}>Edit Ship</span>
            </div>

            {/* Name */}
            <div>
              <label className="block text-[10px] font-black uppercase tracking-widest mb-1.5" style={{ color: 'var(--color-muted)' }}>
                Ship Name
              </label>
              <input
                autoFocus
                type="text"
                value={editName}
                onChange={e => setEditName(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') saveEdit(); if (e.key === 'Escape') cancelEdit() }}
                className="w-full px-3 py-2.5 border-2 font-black text-sm outline-none"
                style={{ borderColor: 'var(--color-border)', background: 'var(--color-surface)', color: 'var(--color-text)' }}
                onFocus={e => e.target.style.borderColor = 'var(--color-primary)'}
                onBlur={e => e.target.style.borderColor = 'var(--color-border)'}
                placeholder="Ship name…"
              />
            </div>

            {/* Color palette */}
            <div>
              <label className="block text-[10px] font-black uppercase tracking-widest mb-2" style={{ color: 'var(--color-muted)' }}>
                Ship Colour
              </label>
              <div className="flex flex-wrap gap-2">
                {SHIP_COLORS.map(c => (
                  <button
                    key={c}
                    onClick={() => setEditColor(c)}
                    className="w-7 h-7 border-2 shrink-0 transition-all duration-100"
                    style={{
                      background: c,
                      borderColor: editColor === c ? 'var(--color-border-strong)' : 'transparent',
                      transform: editColor === c ? 'scale(1.3)' : 'scale(1)',
                      boxShadow: editColor === c ? `0 0 0 2px ${c}66` : 'none'
                    }}
                    title={c}
                  />
                ))}
              </div>

              {/* Live preview */}
              <div className="flex items-center gap-3 mt-3 px-3 py-2 border-2" style={{ borderColor: 'var(--color-border)', background: 'var(--color-surface)' }}>
                <div className="w-1.5 h-8 shrink-0" style={{ background: editColor, borderRadius: '2px' }} />
                <span className="font-black text-sm truncate" style={{ color: 'var(--color-text)' }}>
                  {editName || 'Preview'}
                </span>
              </div>
            </div>

            {/* Buttons */}
            <div className="flex items-center gap-2 pt-1">
              <button
                onClick={saveEdit}
                disabled={saving || !editName.trim()}
                className="flex items-center gap-1.5 px-4 py-2 border-2 font-black text-xs uppercase tracking-wider transition-all disabled:opacity-40"
                style={{ borderColor: 'var(--color-primary)', background: 'var(--color-primary)', color: 'white', boxShadow: 'var(--shadow-brutal-sm)' }}
              >
                <Check className="w-3.5 h-3.5" />
                {saving ? 'Saving…' : 'Save'}
              </button>
              <button
                onClick={cancelEdit}
                className="flex items-center gap-1.5 px-4 py-2 border-2 font-black text-xs uppercase tracking-wider"
                style={{ borderColor: 'var(--color-border)', color: 'var(--color-muted)' }}
              >
                <X className="w-3.5 h-3.5" />
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Kanban board area */}
      <DndContext sensors={sensors} onDragStart={handleDragStart} onDragOver={handleDragOver} onDragEnd={handleDragEnd}>
        <div className="flex-1 overflow-x-auto">
          <div className="flex gap-5 h-full pb-6">
            <SortableContext items={lists.map(l => l.id)} strategy={horizontalListSortingStrategy}>
              {filteredLists.map(list => (
                <List key={list.id} list={list} boardId={boardId} onCardsChange={loadBoard} />
              ))}
            </SortableContext>

            {/* Add manifest placeholder */}
            <button
              onClick={() => setShowCreateList(true)}
              className="w-80 shrink-0 h-fit p-5 border-4 border-dashed transition-all duration-150"
              style={{ borderColor: 'var(--color-border)', color: 'var(--color-muted)' }}
              onMouseOver={e => {
                e.currentTarget.style.borderColor = 'var(--color-primary)'
                e.currentTarget.style.background = 'var(--color-primary-soft)'
                e.currentTarget.style.color = 'var(--color-primary)'
              }}
              onMouseOut={e => {
                e.currentTarget.style.borderColor = 'var(--color-border)'
                e.currentTarget.style.background = 'transparent'
                e.currentTarget.style.color = 'var(--color-muted)'
              }}
            >
              <div className="flex items-center justify-center gap-3">
                <div className="w-8 h-8 border-2 flex items-center justify-center font-black" style={{ borderColor: 'currentColor' }}>
                  <Plus className="w-5 h-5 stroke-[3px]" />
                </div>
                <span className="font-black text-sm uppercase tracking-wider">Add Manifest</span>
              </div>
            </button>
          </div>
        </div>
      </DndContext>

      {showCreateList && (
        <CreateListModal onClose={() => setShowCreateList(false)} onCreate={handleCreateList} />
      )}
    </div>
  )
}
