import React, { useEffect, useRef, useState } from 'react'
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
import { Plus, LayoutList, Hash, Pencil, Check, X, ChevronLeft, Trash2 } from 'lucide-react'
import { List } from './List'
import { CreateListModal } from './CreateListModal'
import { getBoardWithDetails } from '../../lib/data'

const SHIP_COLORS = [
  '#2D82B7', '#0B2545', '#1F5F8B', '#3FA796', '#5FA8D3',
  '#2563eb', '#7c3aed', '#db2777', '#ea580c', '#16a34a',
  '#0891b2', '#9333ea', '#e11d48', '#f59e0b', '#6366f1',
  '#64748b', '#111827', '#be123c', '#15803d', '#1d4ed8'
]

interface KanbanBoardProps {
  boardId: string
  searchQuery?: string
  onGoBack?: () => void
  openCardId?: string | null
  onCardOpenComplete?: () => void
}

export const KanbanBoard: React.FC<KanbanBoardProps> = ({
  boardId,
  searchQuery = '',
  onGoBack,
  openCardId,
  onCardOpenComplete
}) => {
  const [board, setBoard] = useState<any>(null)
  const [lists, setLists] = useState<any[]>([])
  const [showCreateList, setShowCreateList] = useState(false)
  const [, setActiveId] = useState<string | null>(null)

  // Edit ship state
  const [editing, setEditing] = useState(false)
  const [editName, setEditName] = useState('')
  const [editColor, setEditColor] = useState('')
  const [saving, setSaving] = useState(false)
  const dragStateRef = useRef<{ previousLists: any[]; changedListIds: string[] } | null>(null)

  const normalizeListOrders = (list: any) => ({
    ...list,
    cards: (list.cards || []).map((card: any, index: number) =>
      card.order === index && card.listId === list.id
        ? card
        : { ...card, order: index, listId: list.id }
    )
  })

  const reorderCards = (activeId: string, overId: string, currentLists: any[]) => {
    if (activeId === overId) return { lists: currentLists, changedListIds: [], moved: false }

    const listsCopy = currentLists.map(list => ({ ...list, cards: [...(list.cards || [])] }))

    let sourceListIndex = -1
    let targetListIndex = -1
    let activeCardIndex = -1
    let overCardIndex = -1

    for (let i = 0; i < listsCopy.length; i++) {
      const cards = listsCopy[i].cards || []
      if (activeCardIndex === -1) {
        const idx = cards.findIndex((c: any) => c.id === activeId)
        if (idx !== -1) {
          sourceListIndex = i
          activeCardIndex = idx
        }
      }
      if (overCardIndex === -1) {
        const idx = cards.findIndex((c: any) => c.id === overId)
        if (idx !== -1) {
          targetListIndex = i
          overCardIndex = idx
        }
      }
      if (activeCardIndex !== -1 && overCardIndex !== -1) break
    }

    if (sourceListIndex === -1 || targetListIndex === -1 || activeCardIndex === -1 || overCardIndex === -1)
      return { lists: currentLists, changedListIds: [], moved: false }

    if (sourceListIndex === targetListIndex && activeCardIndex === overCardIndex)
      return { lists: currentLists, changedListIds: [], moved: false }

    if (sourceListIndex === targetListIndex) {
      const updatedCards = arrayMove(listsCopy[sourceListIndex].cards, activeCardIndex, overCardIndex)
      listsCopy[sourceListIndex] = normalizeListOrders({ ...listsCopy[sourceListIndex], cards: updatedCards })
      return { lists: listsCopy, changedListIds: [listsCopy[sourceListIndex].id], moved: true }
    }

    const sourceList = listsCopy[sourceListIndex]
    const targetList = listsCopy[targetListIndex]
    const [movingCard] = sourceList.cards.splice(activeCardIndex, 1)
    if (!movingCard) return { lists: currentLists, changedListIds: [], moved: false }

    const targetCards = [...targetList.cards]
    targetCards.splice(overCardIndex, 0, { ...movingCard, listId: targetList.id })

    listsCopy[sourceListIndex] = normalizeListOrders({ ...sourceList })
    listsCopy[targetListIndex] = normalizeListOrders({ ...targetList, cards: targetCards })

    return { lists: listsCopy, changedListIds: [sourceList.id, targetList.id], moved: true }
  }

  const moveCardToListEnd = (cardId: string, targetListId: string, currentLists: any[]) => {
    const listsCopy = currentLists.map(list => ({ ...list, cards: [...(list.cards || [])] }))

    let sourceListIndex = -1
    let targetListIndex = listsCopy.findIndex((l) => l.id === targetListId)
    let activeCardIndex = -1

    for (let i = 0; i < listsCopy.length; i++) {
      const idx = listsCopy[i].cards.findIndex((c: any) => c.id === cardId)
      if (idx !== -1) {
        sourceListIndex = i
        activeCardIndex = idx
        break
      }
    }

    if (sourceListIndex === -1 || targetListIndex === -1 || activeCardIndex === -1)
      return { lists: currentLists, changedListIds: [], moved: false }

    const sourceList = listsCopy[sourceListIndex]
    const targetList = listsCopy[targetListIndex]

    const originalLength = sourceList.cards.length
    const [movingCard] = sourceList.cards.splice(activeCardIndex, 1)
    if (!movingCard) return { lists: currentLists, changedListIds: [], moved: false }

    if (sourceList.id === targetList.id && activeCardIndex === originalLength - 1) {
      return { lists: currentLists, changedListIds: [], moved: false }
    }

    const nextCard = { ...movingCard, listId: targetList.id }
    targetList.cards.push(nextCard)

    listsCopy[sourceListIndex] = normalizeListOrders({ ...sourceList })
    listsCopy[targetListIndex] = normalizeListOrders({ ...targetList })

    const changed = sourceList.id === targetList.id
      ? [sourceList.id]
      : [sourceList.id, targetList.id]

    return {
      lists: listsCopy,
      changedListIds: changed,
      moved: true
    }
  }

  const persistCardOrder = async (
    nextLists: any[],
    changedListIds: string[],
    prevLists: any[]
  ) => {
    const uniqueListIds = Array.from(new Set(changedListIds)).filter(Boolean)
    if (uniqueListIds.length === 0) return

    const previousMap = new Map<string, Map<string, { order: number; listId: string }>>()
    for (const listId of uniqueListIds) {
      const prevList = prevLists.find(l => l.id === listId)
      if (!prevList) continue
      const cardMap = new Map<string, { order: number; listId: string }>()
      ;(prevList.cards || []).forEach((card: any, index: number) => {
        cardMap.set(card.id, { order: card.order ?? index, listId: prevList.id })
      })
      previousMap.set(listId, cardMap)
    }

    const updates: Promise<any>[] = []

    for (const listId of uniqueListIds) {
      const nextList = nextLists.find(l => l.id === listId)
      if (!nextList) continue
      const prevCards = previousMap.get(listId)

      ;(nextList.cards || []).forEach((card: any, index: number) => {
        const prev = prevCards?.get(card.id)
        if (!prev || prev.order !== index || prev.listId !== listId) {
          updates.push(window.electron.db.update('cards', card.id, { listId, order: index }))
        }
      })
    }

    if (updates.length > 0) {
      await Promise.all(updates)
    }
  }

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
    const boardData = await getBoardWithDetails(boardId)
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
    const isOverList = over.data.current?.type === 'list-drop'

    if (isActiveCard && isOverCard) {
      setLists(prev => {
        const result = reorderCards(active.id as string, over.id as string, prev)
        if (result.moved) {
          dragStateRef.current = { previousLists: prev, changedListIds: result.changedListIds }
        }
        return result.moved ? result.lists : prev
      })
      return
    }

    if (isActiveCard && isOverList) {
      const targetListId = over.data.current?.listId as string
      setLists(prev => {
        const result = moveCardToListEnd(active.id as string, targetListId, prev)
        if (result.moved) {
          dragStateRef.current = { previousLists: prev, changedListIds: result.changedListIds }
        }
        return result.moved ? result.lists : prev
      })
    }
  }

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveId(null)
    const { active, over } = event
    if (!over) {
      if (dragStateRef.current?.previousLists) {
        setLists(dragStateRef.current.previousLists)
      }
      dragStateRef.current = null
      return
    }

    const isOverList = over.data.current?.type === 'list-drop'

    if (active.data.current?.type === 'card' && over.data.current?.type === 'card') {
      const dragState = dragStateRef.current
      dragStateRef.current = null

      if (dragState?.changedListIds?.length) {
        void persistCardOrder(lists, dragState.changedListIds, dragState.previousLists)
      } else {
        const { lists: nextLists, changedListIds, moved } = reorderCards(
          active.id as string,
          over.id as string,
          lists
        )

        if (moved) {
          setLists(nextLists)
          void persistCardOrder(nextLists, changedListIds, lists)
        }
      }
      return
    }

    if (active.data.current?.type === 'card' && isOverList) {
      const dragState = dragStateRef.current
      dragStateRef.current = null

      const targetListId = over.data.current?.listId as string
      if (dragState?.changedListIds?.length) {
        void persistCardOrder(lists, dragState.changedListIds, dragState.previousLists)
        return
      }

      const { lists: nextLists, changedListIds, moved } = moveCardToListEnd(
        active.id as string,
        targetListId,
        lists
      )

      if (moved) {
        setLists(nextLists)
        void persistCardOrder(nextLists, changedListIds, lists)
      }
      return
    }

    if (active.data.current?.type === 'list' && over.data.current?.type === 'list')
      handleListReorder(active.id as string, over.id as string)
  }

  const handleListReorder = async (activeId: string, overId: string) => {
    const oldIndex = lists.findIndex((l: any) => l.id === activeId)
    const newIndex = lists.findIndex((l: any) => l.id === overId)
    if (oldIndex === -1 || newIndex === -1) return

    const previousOrder = new Map(lists.map((l: any) => [l.id, l.order]))
    const reorderedLists = arrayMove(lists, oldIndex, newIndex)
    const normalized = reorderedLists.map((list: any, index: number) =>
      list.order === index ? list : { ...list, order: index }
    )

    setLists(normalized)

    const updates = normalized
      .filter((list: any) => previousOrder.get(list.id) !== list.order)
      .map((list: any) => window.electron.db.update('lists', list.id, { order: list.order }))

    if (updates.length > 0) {
      await Promise.all(updates)
    }
  }

  const handleCreateList = async (listData: any) => {
    await window.electron.db.create('lists', {
      ...listData, boardId, order: lists.length, createdAt: Date.now(), updatedAt: Date.now()
    })
    loadBoard()
    setShowCreateList(false)
  }

  const handleDeleteBoard = async () => {
    // Snapshot for undo
    const boardSnapshot = await window.electron.db.findById('boards', boardId)
    if (!boardSnapshot) return

    const allCards = await window.electron.db.findAll('cards')
    const boardCards = allCards.filter((c: any) => c.boardId === boardId)
    const allSubCards = await window.electron.db.findAll('subcards')
    const boardSubCards = allSubCards.filter((sc: any) => boardCards.some((c: any) => c.id === sc.cardId))
    const allLists = await window.electron.db.findAll('lists')
    const boardLists = allLists.filter((l: any) => l.boardId === boardId)

    // Delete everything
    for (const card of boardCards) await window.electron.db.delete('cards', card.id)
    for (const list of boardLists) await window.electron.db.delete('lists', list.id)
    await window.electron.db.delete('boards', boardId)

    if (onGoBack) onGoBack()

    window.dispatchEvent(
      new CustomEvent('show-toast', {
        detail: {
          message: `Ship "${boardSnapshot.name}" jettisoned`,
          onUndo: async () => {
            await window.electron.db.create('boards', boardSnapshot)
            for (const list of boardLists) await window.electron.db.create('lists', list)
            for (const card of boardCards) await window.electron.db.create('cards', card)
            for (const sc of boardSubCards) await window.electron.db.create('subcards', sc)
            window.dispatchEvent(new CustomEvent('reload-docks')) // Tells dock view to reload if active
          }
        }
      })
    )
  }

  if (!board) return null

  const totalCards = lists.reduce((acc, l) => acc + (l.cards?.length || 0), 0)
  const shipColor = board.color || 'var(--color-primary)'

  return (
    <div className="h-full flex flex-col">
      {/* ── Board header ── */}
      <div
        className="mb-6 p-4 border-4"
        style={{ borderColor: 'var(--color-border-strong)', background: 'var(--color-surface)', boxShadow: 'var(--shadow-brutal)' }}
      >

        {/* Back button */}
        {onGoBack && (
          <button
            onClick={onGoBack}
            className="flex items-center gap-1.5 mb-4 px-3 py-2 border-2 text-[10px] font-black uppercase tracking-[0.2em] transition-transform duration-100"
            style={{
              borderColor: 'var(--color-border)',
              color: 'var(--color-muted)',
              background: 'var(--color-surface-2)',
              boxShadow: 'var(--shadow-brutal-sm)'
            }}
          >
            <ChevronLeft className="w-3.5 h-3.5" />
            Back to Dock
          </button>
        )}

        {!editing ? (
          /* View mode */
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-2 h-12 shrink-0 self-stretch" style={{ background: shipColor, boxShadow: `var(--shadow-brutal-sm)` }} />
              <div className="min-w-0">
                <h1 className="text-3xl font-black uppercase tracking-tight" style={{ color: 'var(--color-text)' }}>
                  {board.name}
                </h1>
                <div className="flex items-center gap-3 mt-2 flex-wrap">
                  <span
                    className="flex items-center gap-1.5 text-xs font-black uppercase tracking-wide px-3 py-1 border-2"
                    style={{ borderColor: 'var(--color-primary)', color: 'var(--color-primary)', background: 'var(--color-primary-soft)' }}
                  >
                    <LayoutList className="w-3 h-3" />
                    {lists.length} Manifests
                  </span>
                  <span
                    className="flex items-center gap-1.5 text-xs font-black uppercase tracking-wide px-3 py-1 border-2"
                    style={{ borderColor: 'var(--color-cyan, #0891b2)', color: 'var(--color-cyan, #0891b2)', background: 'rgba(53,194,255,0.12)' }}
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
                className="btn-secondary text-xs px-4"
              >
                <Pencil className="w-3.5 h-3.5" />
                Edit Ship
              </button>
              <button
                onClick={handleDeleteBoard}
                className="flex items-center gap-1.5 px-4 py-2 text-xs font-black uppercase tracking-wide border-2 transition-all duration-100"
                style={{
                  borderColor: 'rgba(217,76,87,0.4)',
                  color: '#d94c57',
                  background: 'rgba(217,76,87,0.12)'
                }}
              >
                <Trash2 className="w-3.5 h-3.5" />
                Jettison
              </button>
              <button onClick={() => setShowCreateList(true)} className="btn-primary text-xs uppercase tracking-wider px-5">
                <Plus className="w-4 h-4 stroke-[3px]" />
                Add Manifest
              </button>
            </div>
          </div>
        ) : (
          /* Edit mode inline panel */
          <div
            className="p-4 border-4 space-y-4 animate-brutal-in"
            style={{ borderColor: 'var(--color-primary)', background: 'var(--color-background)', boxShadow: 'var(--shadow-brutal)' }}
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
                className="w-full px-3 py-2.5 border-3 font-black text-sm outline-none"
                style={{ borderColor: 'var(--color-border-strong)', background: 'var(--color-surface)', color: 'var(--color-text)' }}
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
                   className="w-7 h-7 border-3 shrink-0 transition-all duration-100"
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
               <div className="flex items-center gap-3 mt-3 px-3 py-2 border-3" style={{ borderColor: 'var(--color-border-strong)', background: 'var(--color-surface)' }}>
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
                className="flex items-center gap-1.5 px-4 py-2 border-3 font-black text-xs uppercase tracking-wider transition-all disabled:opacity-40"
                style={{ borderColor: 'var(--color-primary)', background: 'var(--color-primary)', color: 'white', boxShadow: 'var(--shadow-brutal-sm)' }}
              >
                <Check className="w-3.5 h-3.5" />
                {saving ? 'Saving…' : 'Save'}
              </button>
              <button
                onClick={cancelEdit}
                className="flex items-center gap-1.5 px-4 py-2 border-3 font-black text-xs uppercase tracking-wider"
                style={{ borderColor: 'var(--color-border-strong)', color: 'var(--color-muted)' }}
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
                <List
                  key={list.id}
                  list={list}
                  boardId={boardId}
                  onCardsChange={loadBoard}
                  openCardId={openCardId}
                  onCardOpenComplete={onCardOpenComplete}
                />
              ))}
            </SortableContext>

            {/* Add manifest placeholder */}
            <button
              onClick={() => setShowCreateList(true)}
              className="w-80 shrink-0 h-fit p-5 border-4 border-dashed transition-all duration-100"
              style={{ borderColor: 'var(--color-border-strong)', color: 'var(--color-muted)', boxShadow: 'var(--shadow-brutal-sm)' }}
              onMouseOver={e => {
                e.currentTarget.style.borderColor = 'var(--color-primary)'
                e.currentTarget.style.background = 'var(--color-primary-soft)'
                e.currentTarget.style.color = 'var(--color-primary)'
              }}
              onMouseOut={e => {
                e.currentTarget.style.borderColor = 'var(--color-border-strong)'
                e.currentTarget.style.background = 'transparent'
                e.currentTarget.style.color = 'var(--color-muted)'
              }}
            >
              <div className="flex items-center justify-center gap-3">
                <div className="w-8 h-8 border-3 flex items-center justify-center font-black" style={{ borderColor: 'currentColor' }}>
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
