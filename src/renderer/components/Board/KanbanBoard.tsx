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
import {
  SortableContext,
  arrayMove,
  horizontalListSortingStrategy,
  verticalListSortingStrategy
} from '@dnd-kit/sortable'
import {
  Plus,
  Pencil,
  Check,
  X,
  ChevronLeft,
  Trash2,
  MoveHorizontal,
  MoveVertical
} from 'lucide-react'
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
  openTaskId?: string | null
  onTaskOpenComplete?: () => void
}

export const KanbanBoard: React.FC<KanbanBoardProps> = ({
  boardId,
  dataVersion = 0,
  searchQuery = '',
  onGoBack,
  openTaskId,
  onTaskOpenComplete
}) => {
  const [board, setBoard] = useState<any>(null)
  const [columns, setColumns] = useState<any[]>([])
  const [showCreateColumn, setShowCreateColumn] = useState(false)
  const [, setActiveId] = useState<string | null>(null)
  const [columnOrientation, setColumnOrientation] = useState<'horizontal' | 'vertical'>(() => {
    if (typeof window === 'undefined') return 'horizontal'
    const saved = localStorage.getItem(`shipyard:column-orientation:${boardId}`)
    return saved === 'vertical' ? 'vertical' : 'horizontal'
  })
  const [gridColumnCount, setGridColumnCount] = useState(1)
  const [rowHeights, setRowHeights] = useState<Record<number, number>>({})
  const gridRef = useRef<HTMLDivElement | null>(null)
  const rowResizeRef = useRef<{ rowIndex: number; y: number; height: number } | null>(null)

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

  const moveTaskToColumnEnd = (taskId: string, targetColumnId: string, currentColumns: any[]) => {
    const columnsCopy = currentColumns.map((column) => ({
      ...column,
      tasks: [...(column.tasks || [])]
    }))
    const targetColumnIndex = columnsCopy.findIndex((column) => column.id === targetColumnId)
    let sourceColumnIndex = -1
    let activeTaskIndex = -1

    for (let index = 0; index < columnsCopy.length; index++) {
      const taskIndex = columnsCopy[index].tasks.findIndex((task: any) => task.id === taskId)
      if (taskIndex !== -1) {
        sourceColumnIndex = index
        activeTaskIndex = taskIndex
        break
      }
    }

    if (sourceColumnIndex === -1 || targetColumnIndex === -1 || activeTaskIndex === -1) {
      return { columns: currentColumns, changedColumnIds: [], moved: false }
    }

    const sourceColumn = columnsCopy[sourceColumnIndex]
    const targetColumn = columnsCopy[targetColumnIndex]
    const originalLength = sourceColumn.tasks.length
    const [movingTask] = sourceColumn.tasks.splice(activeTaskIndex, 1)
    if (!movingTask) return { columns: currentColumns, changedColumnIds: [], moved: false }
    if (sourceColumn.id === targetColumn.id && activeTaskIndex === originalLength - 1) {
      return { columns: currentColumns, changedColumnIds: [], moved: false }
    }

    targetColumn.tasks.push({ ...movingTask, columnId: targetColumn.id })
    columnsCopy[sourceColumnIndex] = normalizeColumnOrders({ ...sourceColumn })
    columnsCopy[targetColumnIndex] = normalizeColumnOrders({ ...targetColumn })

    return {
      columns: columnsCopy,
      changedColumnIds:
        sourceColumn.id === targetColumn.id
          ? [sourceColumn.id]
          : [sourceColumn.id, targetColumn.id],
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

  const totalTasks = columns.reduce((total, column) => total + (column.tasks?.length || 0), 0)
  const boardColor = board?.color || 'var(--color-primary)'
  const isVerticalLayout = columnOrientation === 'vertical'
  const columnSortingStrategy = isVerticalLayout
    ? verticalListSortingStrategy
    : horizontalListSortingStrategy
  const DEFAULT_ROW_HEIGHT = 680
  const ROW_MIN_HEIGHT = 320
  const ROW_MAX_HEIGHT = 1400

  const chunkColumns = (items: any[], size: number) => {
    if (size <= 0) return [items]
    const result: any[][] = []
    for (let i = 0; i < items.length; i += size) {
      result.push(items.slice(i, i + size))
    }
    return result
  }

  const rows = isVerticalLayout ? chunkColumns(filteredColumns, gridColumnCount) : [filteredColumns]

  const getRowHeight = (rowIndex: number) => rowHeights[rowIndex] ?? DEFAULT_ROW_HEIGHT

  const handleRowResizeMove = (event: MouseEvent) => {
    if (!rowResizeRef.current) return
    const { rowIndex, y, height } = rowResizeRef.current
    const delta = event.clientY - y
    const next = Math.min(Math.max(height + delta, ROW_MIN_HEIGHT), ROW_MAX_HEIGHT)
    setRowHeights((previous) => ({ ...previous, [rowIndex]: next }))
  }

  const stopRowResize = () => {
    window.removeEventListener('mousemove', handleRowResizeMove)
    window.removeEventListener('mouseup', stopRowResize)
    rowResizeRef.current = null
  }

  const startRowResize = (rowIndex: number, currentHeight: number, event: React.MouseEvent) => {
    event.preventDefault()
    event.stopPropagation()
    rowResizeRef.current = { rowIndex, y: event.clientY, height: currentHeight }
    window.addEventListener('mousemove', handleRowResizeMove)
    window.addEventListener('mouseup', stopRowResize)
  }

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }))

  useEffect(() => {
    loadBoard()
    const reload = () => void loadBoard()
    window.addEventListener('reload-projects', reload)
    return () => window.removeEventListener('reload-projects', reload)
  }, [boardId, dataVersion])

  useEffect(() => {
    if (typeof window === 'undefined') return
    const saved = localStorage.getItem(`shipyard:column-orientation:${boardId}`)
    setColumnOrientation(saved === 'vertical' ? 'vertical' : 'horizontal')
  }, [boardId])

  useEffect(() => {
    if (typeof window === 'undefined') return
    localStorage.setItem(`shipyard:column-orientation:${boardId}`, columnOrientation)
  }, [boardId, columnOrientation])

  useEffect(() => {
    if (typeof window === 'undefined') return
    const raw = localStorage.getItem(`shipyard:column-row-heights:${boardId}`)
    if (raw) {
      try {
        const parsed = JSON.parse(raw)
        setRowHeights(parsed && typeof parsed === 'object' ? parsed : {})
      } catch {
        setRowHeights({})
      }
    } else {
      setRowHeights({})
    }
  }, [boardId])

  useEffect(() => {
    if (typeof window === 'undefined') return
    localStorage.setItem(`shipyard:column-row-heights:${boardId}`, JSON.stringify(rowHeights))
  }, [boardId, rowHeights])

  useEffect(() => {
    const computeColumns = () => {
      if (!isVerticalLayout) {
        setGridColumnCount(filteredColumns.length || 1)
        return
      }

      const minColumnWidth = 340
      const gap = 20
      const width = gridRef.current?.clientWidth || window.innerWidth
      const count = Math.max(1, Math.floor((width + gap) / (minColumnWidth + gap)))
      setGridColumnCount(count)
    }

    computeColumns()
    window.addEventListener('resize', computeColumns)
    return () => window.removeEventListener('resize', computeColumns)
  }, [isVerticalLayout, filteredColumns.length])

  useEffect(() => {
    return () => stopRowResize()
  }, [])

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

  // The snapshot is taken once when a drag starts. Intermediate drag-over
  // steps only add to the set of touched columns, so the drop is saved
  // against the original order and a cancel restores the original layout.
  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as string)
    dragStateRef.current =
      event.active.data.current?.type === 'task'
        ? { previousColumns: columns, changedColumnIds: [] }
        : null
  }

  const recordDragChange = (changedColumnIds: string[]) => {
    if (!dragStateRef.current) return
    dragStateRef.current.changedColumnIds = Array.from(
      new Set([...dragStateRef.current.changedColumnIds, ...changedColumnIds])
    )
  }

  const handleDragCancel = () => {
    setActiveId(null)
    if (dragStateRef.current?.previousColumns) {
      setColumns(dragStateRef.current.previousColumns)
    }
    dragStateRef.current = null
  }

  const handleDragOver = (event: DragOverEvent) => {
    const { active, over } = event
    if (!over) return
    const isActiveTask = active.data.current?.type === 'task'
    const isOverTask = over.data.current?.type === 'task'
    const isOverColumn = over.data.current?.type === 'column-drop'

    if (isActiveTask && isOverTask) {
      setColumns((previous) => {
        const result = reorderTasks(active.id as string, over.id as string, previous)
        if (result.moved) recordDragChange(result.changedColumnIds)
        return result.moved ? result.columns : previous
      })
      return
    }

    if (isActiveTask && isOverColumn) {
      const targetColumnId = over.data.current?.columnId as string
      setColumns((previous) => {
        const result = moveTaskToColumnEnd(active.id as string, targetColumnId, previous)
        if (result.moved) recordDragChange(result.changedColumnIds)
        return result.moved ? result.columns : previous
      })
    }
  }

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveId(null)
    const { active, over } = event
    if (!over) {
      handleDragCancel()
      return
    }

    if (active.data.current?.type === 'task' && over.data.current?.type === 'task') {
      const dragState = dragStateRef.current
      dragStateRef.current = null

      if (dragState?.changedColumnIds.length) {
        // Drag-over already applied the move; save it against the start state.
        void persistTaskOrder(columns, dragState.changedColumnIds, dragState.previousColumns)
        return
      }
      const {
        columns: nextColumns,
        changedColumnIds,
        moved
      } = reorderTasks(active.id as string, over.id as string, columns)
      if (moved) {
        setColumns(nextColumns)
        void persistTaskOrder(nextColumns, changedColumnIds, columns)
      }
      return
    }

    if (active.data.current?.type === 'task' && over.data.current?.type === 'column-drop') {
      const dragState = dragStateRef.current
      dragStateRef.current = null

      const targetColumnId = over.data.current?.columnId as string
      if (dragState?.changedColumnIds.length) {
        void persistTaskOrder(columns, dragState.changedColumnIds, dragState.previousColumns)
        return
      }

      const {
        columns: nextColumns,
        changedColumnIds,
        moved
      } = moveTaskToColumnEnd(active.id as string, targetColumnId, columns)

      if (moved) {
        setColumns(nextColumns)
        void persistTaskOrder(nextColumns, changedColumnIds, columns)
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
    // Snapshot everything the delete cascade removes, so undo restores it all.
    const boardSnapshot = await window.electron.db.findById('boards', boardId)
    if (!boardSnapshot) return

    const [allColumns, allTasks, allSubtasks, allStatuses, allConnections] = await Promise.all([
      window.electron.db.findAll('columns'),
      window.electron.db.findAll('tasks'),
      window.electron.db.findAll('subtasks'),
      window.electron.db.findAll('statuses'),
      window.electron.db.findAll('connections')
    ])
    const boardColumns = allColumns.filter((column: any) => column.boardId === boardId)
    const columnIds = new Set(boardColumns.map((column: any) => column.id))
    // Tasks are removed with their column, whatever their boardId says.
    const boardTasks = allTasks.filter((task: any) => columnIds.has(task.columnId))
    const taskIds = new Set(boardTasks.map((task: any) => task.id))
    const boardSubtasks = allSubtasks.filter((subtask: any) => taskIds.has(subtask.taskId))
    const boardStatuses = allStatuses.filter((status: any) => status.boardId === boardId)
    const boardConnections = allConnections.filter(
      (connection: any) => connection.boardId === boardId
    )

    // Deleting the board cascades to its columns, tasks, subtasks, statuses
    // and connections.
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
            for (const status of boardStatuses) await window.electron.db.create('statuses', status)
            for (const connection of boardConnections)
              await window.electron.db.create('connections', connection)
            window.dispatchEvent(new CustomEvent('reload-projects'))
          }
        }
      })
    )
  }

  if (!board) return null

  return (
    <div className="h-full flex flex-col">
      {/* ── Board header ── */}
      <div
        className="aero-panel mb-4 px-4 py-3"
        style={{
          borderColor: 'var(--color-border-strong)',
          background: 'var(--color-surface)',
          boxShadow: 'var(--shadow-brutal)'
        }}
      >
        {!editing ? (
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-3 min-w-0">
              {onGoBack && (
                <button
                  onClick={onGoBack}
                  className="btn-secondary p-2 shrink-0"
                  title="Back to project"
                  aria-label="Back to project"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
              )}
              <div
                className="w-1.5 self-stretch shrink-0 rounded-sm"
                style={{ background: boardColor }}
              />
              <div className="min-w-0">
                <h1
                  className="text-xl font-black uppercase tracking-tight truncate"
                  style={{ color: 'var(--color-text)' }}
                >
                  {board.name}
                </h1>
                <p className="text-xs font-semibold" style={{ color: 'var(--color-muted)' }}>
                  {columns.length} {columns.length === 1 ? 'column' : 'columns'}, {totalTasks}{' '}
                  {totalTasks === 1 ? 'task' : 'tasks'}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <div
                className="flex overflow-hidden border-2 rounded-md"
                style={{
                  borderColor: 'var(--color-border-strong)',
                  background: 'var(--color-surface-2)'
                }}
                role="group"
                aria-label="Column layout"
              >
                {(
                  [
                    ['horizontal', MoveHorizontal, 'Side by side'],
                    ['vertical', MoveVertical, 'Stacked in rows']
                  ] as const
                ).map(([value, Icon, label], index) => {
                  const active = columnOrientation === value
                  return (
                    <button
                      key={value}
                      onClick={() => setColumnOrientation(value)}
                      className="p-2 transition-colors"
                      title={label}
                      aria-label={label}
                      aria-pressed={active}
                      style={{
                        background: active ? 'var(--color-primary-soft)' : 'transparent',
                        color: active ? 'var(--color-text)' : 'var(--color-muted)',
                        borderLeft: index ? '2px solid var(--color-border-strong)' : undefined
                      }}
                    >
                      <Icon className="w-4 h-4" />
                    </button>
                  )
                })}
              </div>
              <button onClick={openEdit} className="btn-secondary text-xs px-3">
                <Pencil className="w-3.5 h-3.5" />
                Edit
              </button>
              <button
                onClick={handleDeleteBoard}
                className="btn-secondary p-2 board-delete-button"
                title="Delete board"
                aria-label="Delete board"
              >
                <Trash2 className="w-4 h-4" />
              </button>
              <button
                onClick={() => setShowCreateColumn(true)}
                className="btn-primary text-xs uppercase tracking-wider px-4"
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
        onDragCancel={handleDragCancel}
      >
        <div
          ref={gridRef}
          className={
            isVerticalLayout ? 'flex-1 min-h-0 overflow-y-auto' : 'flex-1 min-h-0 overflow-x-auto'
          }
        >
          <SortableContext
            items={columns.map((column) => column.id)}
            strategy={columnSortingStrategy}
          >
            {isVerticalLayout ? (
              <div className="pb-6 space-y-6">
                {rows.map((rowColumns, rowIndex) => {
                  const rowHeight = getRowHeight(rowIndex)
                  const columnCount = Math.max(
                    1,
                    Math.min(gridColumnCount, rowColumns.length || gridColumnCount)
                  )
                  return (
                    <div key={`row-${rowIndex}`} className="space-y-2">
                      <div
                        className="grid gap-5"
                        style={{
                          gridTemplateColumns: `repeat(${columnCount}, minmax(320px, 1fr))`
                        }}
                      >
                        {rowColumns.map((column) => (
                          <Column
                            key={column.id}
                            column={column}
                            boardId={boardId}
                            onTasksChange={loadBoard}
                            openTaskId={openTaskId}
                            onTaskOpenComplete={onTaskOpenComplete}
                            orientation={columnOrientation}
                            rowHeight={rowHeight}
                          />
                        ))}
                      </div>
                      <div className="flex justify-center">
                        <button
                          type="button"
                          onMouseDown={(event) => startRowResize(rowIndex, rowHeight, event)}
                          className="btn-secondary px-3 py-1.5 text-[11px] flex items-center gap-2 cursor-ns-resize"
                          title="Drag to resize this row of columns"
                        >
                          <MoveVertical className="w-4 h-4" />
                          Row height
                        </button>
                      </div>
                    </div>
                  )
                })}
                <div className="flex items-center justify-center">
                  <button
                    onClick={() => setShowCreateColumn(true)}
                    className="btn-secondary w-full max-w-sm h-fit p-5 border border-dashed"
                  >
                    <span className="flex items-center justify-center gap-3 font-black text-sm uppercase tracking-wider">
                      <Plus className="w-5 h-5 stroke-[3px]" />
                      Add Column
                    </span>
                  </button>
                </div>
              </div>
            ) : (
              <div
                className="flex flex-nowrap gap-4 pb-3 h-full"
                style={{ minWidth: 'max-content' }}
              >
                {filteredColumns.map((column) => (
                  <Column
                    key={column.id}
                    column={column}
                    boardId={boardId}
                    onTasksChange={loadBoard}
                    openTaskId={openTaskId}
                    onTaskOpenComplete={onTaskOpenComplete}
                    orientation={columnOrientation}
                  />
                ))}
                <button
                  onClick={() => setShowCreateColumn(true)}
                  className="add-column-ghost w-64 shrink-0 h-fit p-4 flex items-center justify-center gap-2 text-xs font-black uppercase tracking-wider"
                >
                  <Plus className="w-4 h-4 stroke-[3px]" />
                  Add Column
                </button>
              </div>
            )}
          </SortableContext>
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
