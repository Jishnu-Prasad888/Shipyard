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
import { Plus } from 'lucide-react'
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

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">{board.name}</h1>
        <div className="flex items-center gap-2 text-sm text-muted">
          <span>{lists.length} lists</span>
          <span>·</span>
          <span>{lists.reduce((acc, l) => acc + (l.cards?.length || 0), 0)} cards</span>
        </div>
      </div>

      <DndContext
        sensors={sensors}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
      >
        <div className="flex-1 overflow-x-auto">
          <div className="flex gap-4 h-full pb-4">
            <SortableContext
              items={lists.map((l) => l.id)}
              strategy={horizontalListSortingStrategy}
            >
              {filteredLists.map((list) => (
                <List key={list.id} list={list} boardId={boardId} onCardsChange={loadBoard} />
              ))}
            </SortableContext>

            <button
              onClick={() => setShowCreateList(true)}
              className="w-72 shrink-0 h-fit p-4 border-2 border-dashed border-border rounded-xl hover:border-primary hover:bg-primary-soft transition group"
            >
              <div className="flex items-center justify-center gap-2 text-muted group-hover:text-primary">
                <Plus className="w-5 h-5" />
                <span>Add List</span>
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
