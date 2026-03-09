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
import { Plus, LayoutList, Hash } from 'lucide-react'
import { List } from './List'
import { CreateListModal } from './CreateListModal'

interface KanbanBoardProps {
  boardId: string
  searchQuery?: string
}

export const KanbanBoard: React.FC<KanbanBoardProps> = ({ boardId, searchQuery = '' }) => {
  const [board, setBoard] = useState<any>(null)
  const [lists, setLists] = useState<any[]>([])
  const [showCreateList, setShowCreateList] = useState(false)
  const [, setActiveId] = useState<string | null>(null)

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
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8
      }
    })
  )

  useEffect(() => {
    loadBoard()
  }, [boardId])

  const loadBoard = async () => {
    const boardData = await window.electron.db.getBoardWithDetails(boardId)
    if (boardData) {
      setBoard(boardData)
      setLists(boardData.lists || [])
    }
  }

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as string)
  }

  const handleDragOver = (event: DragOverEvent) => {
    const { active, over } = event
    if (!over) return

    const activeId = active.id as string
    const overId = over.id as string

    const isActiveCard = active.data.current?.type === 'card'
    const isOverCard = over.data.current?.type === 'card'

    if (isActiveCard && isOverCard) {
      handleCardReorder(activeId, overId)
    }
  }

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveId(null)

    const { active, over } = event
    if (!over) return

    if (active.data.current?.type === 'list' && over.data.current?.type === 'list') {
      handleListReorder(active.id as string, over.id as string)
    }
  }

  const handleCardReorder = async (activeId: string, overId: string) => {
    let activeCard: any = null
    let activeList: any = null
    let overCard: any = null
    let overList: any = null

    for (const list of lists) {
      const card = list.cards?.find((c: any) => c.id === activeId)
      if (card) {
        activeCard = card
        activeList = list
      }

      const overCardFound = list.cards?.find((c: any) => c.id === overId)
      if (overCardFound) {
        overCard = overCardFound
        overList = list
      }
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

      setLists((prevLists) =>
        prevLists.map((list) =>
          list.id === activeList.id ? { ...list, cards: reorderedCards } : list
        )
      )
    } else {
      const newActiveListCards = activeList.cards.filter((c: any) => c.id !== activeId)
      const newOverListCards = [...overList.cards]

      const overIndex = newOverListCards.findIndex((c: any) => c.id === overId)
      newOverListCards.splice(overIndex, 0, activeCard)

      await window.electron.db.update('cards', activeId, {
        listId: overList.id,
        order: overIndex
      })

      for (let i = 0; i < newActiveListCards.length; i++) {
        await window.electron.db.update('cards', newActiveListCards[i].id, { order: i })
      }
      for (let i = 0; i < newOverListCards.length; i++) {
        await window.electron.db.update('cards', newOverListCards[i].id, { order: i })
      }

      setLists((prevLists) =>
        prevLists.map((list) => {
          if (list.id === activeList.id) {
            return { ...list, cards: newActiveListCards }
          }
          if (list.id === overList.id) {
            return { ...list, cards: newOverListCards }
          }
          return list
        })
      )
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
    const newList = {
      ...listData,
      boardId,
      order: lists.length,
      createdAt: Date.now(),
      updatedAt: Date.now()
    }

    await window.electron.db.create('lists', newList)
    loadBoard()
    setShowCreateList(false)
  }

  if (!board) return null

  const totalCards = lists.reduce((acc, l) => acc + (l.cards?.length || 0), 0)

  return (
    <div className="h-full flex flex-col">
      {/* Board header */}
      <div
        className="flex items-center justify-between mb-6 pb-4 border-b-4"
        style={{ borderColor: 'var(--color-border-strong)' }}
      >
        <div>
          <h1
            className="text-3xl font-black uppercase tracking-tight"
            style={{ color: 'var(--color-text)' }}
          >
            {board.name}
          </h1>
          <div className="flex items-center gap-4 mt-1">
            <span
              className="flex items-center gap-1.5 text-xs font-black uppercase tracking-wider px-2 py-1 border-2"
              style={{
                borderColor: 'var(--color-primary)',
                color: 'var(--color-primary)',
                background: 'var(--color-primary-soft)'
              }}
            >
              <LayoutList className="w-3 h-3" />
              {lists.length} Manifests
            </span>
            <span
              className="flex items-center gap-1.5 text-xs font-black uppercase tracking-wider px-2 py-1 border-2"
              style={{
                borderColor: 'var(--color-cyan, #0891b2)',
                color: 'var(--color-cyan, #0891b2)',
                background: '#ecfeff'
              }}
            >
              <Hash className="w-3 h-3" />
              {totalCards} Cargo
            </span>
          </div>
        </div>

        <button
          onClick={() => setShowCreateList(true)}
          className="btn-primary text-xs uppercase tracking-wider"
        >
          <Plus className="w-4 h-4 stroke-[3px]" />
          Add Manifest
        </button>
      </div>

      {/* Kanban board area */}
      <DndContext
        sensors={sensors}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
      >
        <div className="flex-1 overflow-x-auto">
          <div className="flex gap-5 h-full pb-6">
            <SortableContext
              items={lists.map((l) => l.id)}
              strategy={horizontalListSortingStrategy}
            >
              {filteredLists.map((list) => (
                <List key={list.id} list={list} boardId={boardId} onCardsChange={loadBoard} />
              ))}
            </SortableContext>

            {/* Add new list placeholder */}
            <button
              onClick={() => setShowCreateList(true)}
              className="w-80 shrink-0 h-fit p-5 border-4 border-dashed transition-all duration-150 group"
              style={{
                borderColor: 'var(--color-border)',
                color: 'var(--color-muted)'
              }}
              onMouseOver={(e) => {
                e.currentTarget.style.borderColor = 'var(--color-primary)'
                e.currentTarget.style.background = 'var(--color-primary-soft)'
                e.currentTarget.style.color = 'var(--color-primary)'
              }}
              onMouseOut={(e) => {
                e.currentTarget.style.borderColor = 'var(--color-border)'
                e.currentTarget.style.background = 'transparent'
                e.currentTarget.style.color = 'var(--color-muted)'
              }}
            >
              <div className="flex items-center justify-center gap-3">
                <div
                  className="w-8 h-8 border-2 flex items-center justify-center font-black transition-all duration-150"
                  style={{
                    borderColor: 'currentColor'
                  }}
                >
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
