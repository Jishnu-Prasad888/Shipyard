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
import { Column } from './Column'
import { CreateColumnModal } from './CreateColumnModal'
import { getBoardWithDetails } from '../../lib/data'

const BOARD_COLORS = [
  '#2D82B7',
  '#0B2545',
  '#1F5F8B',
  '#3FA796',
  '#5FA8D3',
  '#2563eb',
  '#7c3aed',
  '#db2777',
  '#ea580c',
  '#16a34a',
  '#0891b2',
  '#9333ea',
  '#e11d48',
  '#f59e0b',
  '#6366f1',
  '#64748b',
  '#111827',
  '#be123c',
  '#15803d',
  '#1d4ed8'
]

interface KanbanBoardProps {
  boardId: string
  dataVersion?: number
  searchQuery?: string
  onGoBack?: () => void
}

export const KanbanBoard: React.FC<KanbanBoardProps> = ({
  boardId,
  dataVersion = 0,
  searchQuery = '',
  onGoBack
}) => {
  const [board, setBoard] = useState<any>(null)
  const [columns, setColumns] = useState<any[]>([])
  const [showCreateColumn, setShowCreateColumn] = useState(false)
  const [, setActiveId] = useState<string | null>(null)

  // Edit board state
  const [editing, setEditing] = useState(false)
  const [editName, setEditName] = useState('')
  const [editColor, setEditColor] = useState('')
  const [saving, setSaving] = useState(false)
  const dragStateRef = useRef<{ previousColumns: any[]; changedColumnIds: string[] } | null>(null)

  const normalizeColumnOrders = (column: any) => ({
    ...column,
    tasks: (column.tasks || []).map((task: any, index: number) =>
      task.order === index && task.columnId === column.id
        ? task
        : { ...task, order: index, columnId: column.id }
    )
  })

  const reorderTasks = (activeId: string, overId: string, currentColumns: any[]) => {
    if (activeId === overId) return { columns: currentColumns, changedColumnIds: [], moved: false }

    const columnsCopy = currentColumns.map((column) => ({
      ...column,
      tasks: [...(column.tasks || [])]
    }))

    let sourceColumnIndex = -1
    let targetColumnIndex = -1
    let activeTaskIndex = -1
    let overTaskIndex = -1

    for (let i = 0; i < columnsCopy.length; i++) {
      const tasks = columnsCopy[i].tasks || []
      if (activeTaskIndex === -1) {
        const idx = tasks.findIndex((task: any) => task.id === activeId)
        if (idx !== -1) {
          sourceColumnIndex = i
          activeTaskIndex = idx
        }
      }
      if (overTaskIndex === -1) {
        const idx = tasks.findIndex((task: any) => task.id === overId)
        if (idx !== -1) {
          targetColumnIndex = i
          overTaskIndex = idx
        }
      }
      if (activeTaskIndex !== -1 && overTaskIndex !== -1) break
    }

    if (
      sourceColumnIndex === -1 ||
      targetColumnIndex === -1 ||
      activeTaskIndex === -1 ||
      overTaskIndex === -1
    )
      return { columns: currentColumns, changedColumnIds: [], moved: false }

    if (sourceColumnIndex === targetColumnIndex && activeTaskIndex === overTaskIndex)
      return { columns: currentColumns, changedColumnIds: [], moved: false }

    if (sourceColumnIndex === targetColumnIndex) {
      const updatedTasks = arrayMove(
        columnsCopy[sourceColumnIndex].tasks,
        activeTaskIndex,
        overTaskIndex
      )
      columnsCopy[sourceColumnIndex] = normalizeColumnOrders({
        ...columnsCopy[sourceColumnIndex],
        tasks: updatedTasks
      })
      return {
        columns: columnsCopy,
        changedColumnIds: [columnsCopy[sourceColumnIndex].id],
        moved: true
      }
    }

    const sourceColumn = columnsCopy[sourceColumnIndex]
    const targetColumn = columnsCopy[targetColumnIndex]
    const [movingTask] = sourceColumn.tasks.splice(activeTaskIndex, 1)
    if (!movingTask) return { columns: currentColumns, changedColumnIds: [], moved: false }

    const targetTasks = [...targetColumn.tasks]
    targetTasks.splice(overTaskIndex, 0, { ...movingTask, columnId: targetColumn.id })

    columnsCopy[sourceColumnIndex] = normalizeColumnOrders({ ...sourceColumn })
    columnsCopy[targetColumnIndex] = normalizeColumnOrders({ ...targetColumn, tasks: targetTasks })

    return {
      columns: columnsCopy,
      changedColumnIds: [sourceColumn.id, targetColumn.id],
      moved: true
    }
  }

  const persistTaskOrder = async (
    nextColumns: any[],
    changedColumnIds: string[],
    previousColumns: any[]
  ) => {
    const uniqueColumnIds = Array.from(new Set(changedColumnIds)).filter(Boolean)
    if (uniqueColumnIds.length === 0) return

    const previousMap = new Map<string, Map<string, { order: number; columnId: string }>>()
    for (const columnId of uniqueColumnIds) {
      const previousColumn = previousColumns.find((column) => column.id === columnId)
      if (!previousColumn) continue
      const taskMap = new Map<string, { order: number; columnId: string }>()
      ;(previousColumn.tasks || []).forEach((task: any, index: number) => {
        taskMap.set(task.id, { order: task.order ?? index, columnId: previousColumn.id })
      })
      previousMap.set(columnId, taskMap)
    }

    const updates: Promise<any>[] = []

    for (const columnId of uniqueColumnIds) {
      const nextColumn = nextColumns.find((column) => column.id === columnId)
      if (!nextColumn) continue
      const previousTasks = previousMap.get(columnId)

      ;(nextColumn.tasks || []).forEach((task: any, index: number) => {
        const previous = previousTasks?.get(task.id)
        if (!previous || previous.order !== index || previous.columnId !== columnId) {
          updates.push(window.electron.db.update('tasks', task.id, { columnId, order: index }))
        }
      })
    }

    if (updates.length > 0) {
      await Promise.all(updates)
    }
  }

  const filteredColumns = searchQuery
    ? columns.map((column) => ({
        ...column,
        tasks: column.tasks?.filter(
          (task: any) =>
            task.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
            task.description?.toLowerCase().includes(searchQuery.toLowerCase())
        )
      }))
    : columns

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }))

  useEffect(() => {
    loadBoard()
    const reload = () => void loadBoard()
    window.addEventListener('reload-projects', reload)
    return () => window.removeEventListener('reload-projects', reload)
  }, [boardId, dataVersion])

  const loadBoard = async () => {
    const boardData = await getBoardWithDetails(boardId)
    if (boardData) {
      setBoard(boardData)
      setColumns(boardData.columns || [])
    }
  }

  const openEdit = () => {
    setEditName(board?.name || '')
    setEditColor(board?.color || BOARD_COLORS[0])
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
    const isActiveTask = active.data.current?.type === 'task'
    const isOverTask = over.data.current?.type === 'task'
    if (isActiveTask && isOverTask) {
      setColumns((previous) => {
        const result = reorderTasks(active.id as string, over.id as string, previous)
        if (result.moved) {
          dragStateRef.current = {
            previousColumns: previous,
            changedColumnIds: result.changedColumnIds
          }
        }
        return result.moved ? result.columns : previous
      })
    }
  }

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveId(null)
    const { active, over } = event
    if (!over) {
      if (dragStateRef.current?.previousColumns) {
        setColumns(dragStateRef.current.previousColumns)
      }
      dragStateRef.current = null
      return
    }

    if (active.data.current?.type === 'task' && over.data.current?.type === 'task') {
      const dragState = dragStateRef.current
      dragStateRef.current = null

      if (dragState?.changedColumnIds?.length) {
        void persistTaskOrder(columns, dragState.changedColumnIds, dragState.previousColumns)
      } else {
        const {
          columns: nextColumns,
          changedColumnIds,
          moved
        } = reorderTasks(active.id as string, over.id as string, columns)

        if (moved) {
          setColumns(nextColumns)
          void persistTaskOrder(nextColumns, changedColumnIds, columns)
        }
      }
      return
    }

    if (active.data.current?.type === 'column' && over.data.current?.type === 'column')
      handleColumnReorder(active.id as string, over.id as string)
  }

  const handleColumnReorder = async (activeId: string, overId: string) => {
    const oldIndex = columns.findIndex((column: any) => column.id === activeId)
    const newIndex = columns.findIndex((column: any) => column.id === overId)
    if (oldIndex === -1 || newIndex === -1) return

    const previousOrder = new Map(columns.map((column: any) => [column.id, column.order]))
    const reorderedColumns = arrayMove(columns, oldIndex, newIndex)
    const normalized = reorderedColumns.map((column: any, index: number) =>
      column.order === index ? column : { ...column, order: index }
    )

    setColumns(normalized)

    const updates = normalized
      .filter((column: any) => previousOrder.get(column.id) !== column.order)
      .map((column: any) =>
        window.electron.db.update('columns', column.id, { order: column.order })
      )

    if (updates.length > 0) {
      await Promise.all(updates)
    }
  }

  const handleCreateColumn = async (columnData: any) => {
    await window.electron.db.create('columns', {
      ...columnData,
      boardId,
      order: columns.length,
      createdAt: Date.now(),
      updatedAt: Date.now()
    })
    loadBoard()
    setShowCreateColumn(false)
  }

  const handleDeleteBoard = async () => {
    // Snapshot for undo
    const boardSnapshot = await window.electron.db.findById('boards', boardId)
    if (!boardSnapshot) return

    const allTasks = await window.electron.db.findAll('tasks')
    const boardTasks = allTasks.filter((task: any) => task.boardId === boardId)
    const allSubtasks = await window.electron.db.findAll('subtasks')
    const boardSubtasks = allSubtasks.filter((subtask: any) =>
      boardTasks.some((task: any) => task.id === subtask.taskId)
    )
    const allColumns = await window.electron.db.findAll('columns')
    const boardColumns = allColumns.filter((column: any) => column.boardId === boardId)

    // Delete everything
    for (const task of boardTasks) await window.electron.db.delete('tasks', task.id)
    for (const column of boardColumns) await window.electron.db.delete('columns', column.id)
    await window.electron.db.delete('boards', boardId)

    if (onGoBack) onGoBack()

    window.dispatchEvent(
      new CustomEvent('show-toast', {
        detail: {
          message: `Board "${boardSnapshot.name}" deleted`,
          onUndo: async () => {
            await window.electron.db.create('boards', boardSnapshot)
            for (const column of boardColumns) await window.electron.db.create('columns', column)
            for (const task of boardTasks) await window.electron.db.create('tasks', task)
            for (const subtask of boardSubtasks)
              await window.electron.db.create('subtasks', subtask)
            window.dispatchEvent(new CustomEvent('reload-projects'))
          }
        }
      })
    )
  }

  if (!board) return null

  const totalTasks = columns.reduce((total, column) => total + (column.tasks?.length || 0), 0)
  const boardColor = board.color || 'var(--color-primary)'

  return (
    <div className="h-full flex flex-col">
      {/* ── Board header ── */}
      <div
        className="aero-panel mb-5 p-4"
        style={{
          borderColor: 'var(--color-border-strong)',
          background: 'var(--color-surface)',
          boxShadow: 'var(--shadow-brutal)'
        }}
      >
        {/* Back button */}
        {onGoBack && (
          <button
            onClick={onGoBack}
            className="btn-secondary flex items-center gap-1.5 mb-4 px-3 py-2 text-[10px] font-semibold transition duration-150"
            style={{
              borderColor: 'var(--color-border)',
              color: 'var(--color-muted)',
              background: 'var(--color-surface-2)',
              boxShadow: 'var(--shadow-brutal-sm)'
            }}
          >
            <ChevronLeft className="w-3.5 h-3.5" />
            Back to Project
          </button>
        )}

        {!editing ? (
          /* View mode */
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-3 min-w-0">
              <div
                className="w-2 h-12 shrink-0 self-stretch"
                style={{ background: boardColor, boxShadow: `var(--shadow-brutal-sm)` }}
              />
              <div className="min-w-0">
                <h1
                  className="text-3xl font-black uppercase tracking-tight"
                  style={{ color: 'var(--color-text)' }}
                >
                  {board.name}
                </h1>
                <div className="flex items-center gap-3 mt-2 flex-wrap">
                  <span
                    className="flex items-center gap-1.5 text-xs font-black uppercase tracking-wide px-3 py-1 border-2"
                    style={{
                      borderColor: 'var(--color-primary)',
                      color: 'var(--color-primary)',
                      background: 'var(--color-primary-soft)'
                    }}
                  >
                    <LayoutList className="w-3 h-3" />
                    {columns.length} Columns
                  </span>
                  <span
                    className="flex items-center gap-1.5 text-xs font-black uppercase tracking-wide px-3 py-1 border-2"
                    style={{
                      borderColor: 'var(--color-cyan, #0891b2)',
                      color: 'var(--color-cyan, #0891b2)',
                      background: 'rgba(53,194,255,0.12)'
                    }}
                  >
                    <Hash className="w-3 h-3" />
                    {totalTasks} Tasks
                  </span>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <button onClick={openEdit} className="btn-secondary text-xs px-4">
                <Pencil className="w-3.5 h-3.5" />
                Edit Board
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
                Delete
              </button>
              <button
                onClick={() => setShowCreateColumn(true)}
                className="btn-primary text-xs uppercase tracking-wider px-5"
              >
                <Plus className="w-4 h-4 stroke-[3px]" />
                Add Column
              </button>
            </div>
          </div>
        ) : (
          /* Edit mode inline panel */
          <div
            className="aero-panel p-4 space-y-4 animate-brutal-in"
            style={{
              borderColor: 'var(--color-primary)',
              background: 'var(--color-background)',
              boxShadow: 'var(--shadow-brutal)'
            }}
          >
            <div className="flex items-center gap-2">
              <Pencil className="w-4 h-4" style={{ color: 'var(--color-primary)' }} />
              <span
                className="font-black text-xs uppercase tracking-widest"
                style={{ color: 'var(--color-muted)' }}
              >
                Edit Board
              </span>
            </div>

            {/* Name */}
            <div>
              <label
                className="block text-[10px] font-black uppercase tracking-widest mb-1.5"
                style={{ color: 'var(--color-muted)' }}
              >
                Board Name
              </label>
              <input
                autoFocus
                type="text"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') saveEdit()
                  if (e.key === 'Escape') cancelEdit()
                }}
                className="aero-input w-full px-3 py-2.5 font-semibold text-sm outline-none"
                style={{
                  borderColor: 'var(--color-border-strong)',
                  background: 'var(--color-surface)',
                  color: 'var(--color-text)'
                }}
                onFocus={(e) => (e.target.style.borderColor = 'var(--color-primary)')}
                onBlur={(e) => (e.target.style.borderColor = 'var(--color-border)')}
                placeholder="Board name..."
              />
            </div>

            {/* Color options */}
            <div>
              <label
                className="block text-[10px] font-black uppercase tracking-widest mb-2"
                style={{ color: 'var(--color-muted)' }}
              >
                Board Color
              </label>
              <div className="flex flex-wrap gap-2">
                {BOARD_COLORS.map((c) => (
                  <button
                    key={c}
                    onClick={() => setEditColor(c)}
                    className="w-7 h-7 border shrink-0 transition-all duration-150 rounded-sm"
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
              <div
                className="aero-panel flex items-center gap-3 mt-3 px-3 py-2"
                style={{
                  borderColor: 'var(--color-border-strong)',
                  background: 'var(--color-surface)'
                }}
              >
                <div
                  className="w-1.5 h-8 shrink-0"
                  style={{ background: editColor, borderRadius: '2px' }}
                />
                <span
                  className="font-black text-sm truncate"
                  style={{ color: 'var(--color-text)' }}
                >
                  {editName || 'Preview'}
                </span>
              </div>
            </div>

            {/* Buttons */}
            <div className="flex items-center gap-2 pt-1">
              <button
                onClick={saveEdit}
                disabled={saving || !editName.trim()}
                className="btn-primary flex items-center gap-1.5 px-4 py-2 text-xs transition-all disabled:opacity-40"
                style={{
                  borderColor: 'var(--color-primary)',
                  background: 'var(--color-primary)',
                  color: 'white',
                  boxShadow: 'var(--shadow-brutal-sm)'
                }}
              >
                <Check className="w-3.5 h-3.5" />
                {saving ? 'Saving…' : 'Save'}
              </button>
              <button
                onClick={cancelEdit}
                className="btn-secondary flex items-center gap-1.5 px-4 py-2 text-xs"
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
      <DndContext
        sensors={sensors}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
      >
        <div className="flex-1 overflow-x-auto">
          <div className="flex gap-5 h-full pb-6">
            <SortableContext
              items={columns.map((column) => column.id)}
              strategy={horizontalListSortingStrategy}
            >
              {filteredColumns.map((column) => (
                <Column
                  key={column.id}
                  column={column}
                  boardId={boardId}
                  onTasksChange={loadBoard}
                />
              ))}
            </SortableContext>

            {/* Add column */}
            <button
              onClick={() => setShowCreateColumn(true)}
              className="btn-secondary w-80 shrink-0 h-fit p-5 border border-dashed transition-all duration-150"
              style={{
                borderColor: 'var(--color-border-strong)',
                color: 'var(--color-muted)',
                boxShadow: 'var(--shadow-brutal-sm)'
              }}
              onMouseOver={(e) => {
                e.currentTarget.style.borderColor = 'var(--color-primary)'
                e.currentTarget.style.background = 'var(--color-primary-soft)'
                e.currentTarget.style.color = 'var(--color-primary)'
              }}
              onMouseOut={(e) => {
                e.currentTarget.style.borderColor = 'var(--color-border-strong)'
                e.currentTarget.style.background = ''
                e.currentTarget.style.color = 'var(--color-muted)'
              }}
            >
              <div className="flex items-center justify-center gap-3">
                <div
                  className="w-8 h-8 border flex items-center justify-center rounded-sm"
                  style={{ borderColor: 'currentColor' }}
                >
                  <Plus className="w-5 h-5 stroke-[3px]" />
                </div>
                <span className="font-black text-sm uppercase tracking-wider">Add Column</span>
              </div>
            </button>
          </div>
        </div>
      </DndContext>

      {showCreateColumn && (
        <CreateColumnModal
          onClose={() => setShowCreateColumn(false)}
          onCreate={handleCreateColumn}
        />
      )}
    </div>
  )
}
