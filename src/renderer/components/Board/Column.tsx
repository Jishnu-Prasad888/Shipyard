import React, { useState, useEffect, useRef } from 'react'
import { useDroppable } from '@dnd-kit/core'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import {
  Plus,
  Edit2,
  Trash2,
  Eye,
  EyeOff,
  Download,
  MoveHorizontal,
  MoveVertical
} from 'lucide-react'
import { Task } from './Task'
import { CreateTaskModal } from './CreateTaskModal'

interface ColumnProps {
  column: any
  boardId: string
  onTasksChange: () => void
  openTaskId?: string | null
  onTaskOpenComplete?: () => void
  orientation: 'horizontal' | 'vertical'
  rowHeight?: number
}

// Default statuses matching TaskDetailsModal
const DEFAULT_STATUSES = [
  { id: '__todo__', name: 'To Do', color: '#6b7280' },
  { id: '__in_progress__', name: 'In Progress', color: '#f59e0b' },
  { id: '__done__', name: 'Done', color: '#10b981' }
]

export const Column: React.FC<ColumnProps> = ({
  column,
  boardId,
  onTasksChange,
  openTaskId,
  onTaskOpenComplete,
  orientation,
  rowHeight
}) => {
  const [showCreateTask, setShowCreateTask] = useState(false)
  const [isEditing, setIsEditing] = useState(false)
  const [editedName, setEditedName] = useState(column.name)
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null)
  const [hideStatuses, setHideStatuses] = useState<string[]>([])
  const [showHidePanel, setShowHidePanel] = useState(false)
  const [boardStatuses, setBoardStatuses] = useState<any[]>([])
  const hidePanelRef = useRef<HTMLDivElement | null>(null)

  // Per-column dimensions are persisted independently.
  const MIN_WIDTH = 260
  const MAX_WIDTH = 520
  const DEFAULT_WIDTH = 320
  const [width, setWidth] = useState(() => {
    if (typeof window === 'undefined') return DEFAULT_WIDTH
    const raw = localStorage.getItem(`shipyard:column-width:${column.id}`)
    const parsed = raw ? Number(raw) : NaN
    if (Number.isFinite(parsed)) return Math.min(Math.max(parsed, MIN_WIDTH), MAX_WIDTH)
    return DEFAULT_WIDTH
  })
  const resizeStartRef = useRef<{ x: number; width: number } | null>(null)

  const MIN_HEIGHT = 320
  const MAX_HEIGHT = 1400
  const DEFAULT_HEIGHT = 680
  const [height, setHeight] = useState(() => {
    if (typeof window === 'undefined') return DEFAULT_HEIGHT
    const raw = localStorage.getItem(`shipyard:column-height:${column.id}`)
    const parsed = raw ? Number(raw) : NaN
    if (Number.isFinite(parsed)) return Math.min(Math.max(parsed, MIN_HEIGHT), MAX_HEIGHT)
    return DEFAULT_HEIGHT
  })
  const resizeYStartRef = useRef<{ y: number; height: number } | null>(null)

  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: column.id,
    data: { type: 'column' }
  })

  const { setNodeRef: setDropRef, isOver } = useDroppable({
    id: `column-drop-${column.id}`,
    data: { type: 'column-drop', columnId: column.id }
  })

  const handleResize = (event: MouseEvent) => {
    if (!resizeStartRef.current) return
    const delta = event.clientX - resizeStartRef.current.x
    const next = Math.min(Math.max(resizeStartRef.current.width + delta, MIN_WIDTH), MAX_WIDTH)
    setWidth(next)
  }

  const handleHeightResize = (event: MouseEvent) => {
    if (!resizeYStartRef.current) return
    const delta = event.clientY - resizeYStartRef.current.y
    const next = Math.min(Math.max(resizeYStartRef.current.height + delta, MIN_HEIGHT), MAX_HEIGHT)
    setHeight(next)
  }

  const stopResize = () => {
    window.removeEventListener('mousemove', handleResize)
    window.removeEventListener('mouseup', stopResize)
    resizeStartRef.current = null
  }

  const stopHeightResize = () => {
    window.removeEventListener('mousemove', handleHeightResize)
    window.removeEventListener('mouseup', stopHeightResize)
    resizeYStartRef.current = null
  }

  const handleResizeStart = (event: React.MouseEvent) => {
    event.stopPropagation()
    event.preventDefault()
    resizeStartRef.current = { x: event.clientX, width }
    window.addEventListener('mousemove', handleResize)
    window.addEventListener('mouseup', stopResize)
  }

  const resetWidth = () => setWidth(DEFAULT_WIDTH)

  const handleHeightResizeStart = (event: React.MouseEvent) => {
    event.stopPropagation()
    event.preventDefault()
    resizeYStartRef.current = { y: event.clientY, height }
    window.addEventListener('mousemove', handleHeightResize)
    window.addEventListener('mouseup', stopHeightResize)
  }

  const resetHeight = () => setHeight(DEFAULT_HEIGHT)

  useEffect(() => {
    if (typeof window === 'undefined') return
    localStorage.setItem(`shipyard:column-width:${column.id}`, String(width))
  }, [column.id, width])

  useEffect(() => {
    if (orientation === 'vertical') return
    if (typeof window === 'undefined') return
    localStorage.setItem(`shipyard:column-height:${column.id}`, String(height))
  }, [column.id, height, orientation])

  useEffect(() => {
    return () => {
      stopResize()
      stopHeightResize()
    }
  }, [])

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1
  }

  const effectiveHeight = orientation === 'vertical' && rowHeight ? rowHeight : height

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (hidePanelRef.current && !hidePanelRef.current.contains(e.target as Node)) {
        setShowHidePanel(false)
      }

      if (contextMenu && !(e.target as Element).closest('.context-menu')) {
        setContextMenu(null)
      }
    }

    window.addEventListener('mousedown', handleClickOutside)

    return () => {
      window.removeEventListener('mousedown', handleClickOutside)
    }
  }, [contextMenu])

  useEffect(() => {
    loadBoardStatuses()
  }, [boardId])

  const loadBoardStatuses = async () => {
    const dbStatuses = await window.electron.db.findAll('statuses')
    const filtered = dbStatuses.filter((s: any) => s.boardId === boardId)
    setBoardStatuses([...DEFAULT_STATUSES, ...filtered])
  }

  const handleUpdateColumn = async () => {
    if (editedName.trim() && editedName !== column.name) {
      await window.electron.db.update('columns', column.id, {
        name: editedName,
        updatedAt: Date.now()
      })
      column.name = editedName
    }
    setIsEditing(false)
  }

  const handleDeleteColumn = async () => {
    setContextMenu(null)
    // Snapshot for undo
    const columnSnapshot = { ...column }
    const taskSnapshots = [...(column.tasks || [])]
    const allSubtasks = await window.electron.db.findAll('subtasks')
    const subtaskSnapshots = allSubtasks.filter((subtask: any) =>
      taskSnapshots.some((task: any) => task.id === subtask.taskId)
    )

    // Delete immediately
    for (const task of taskSnapshots) {
      await window.electron.db.delete('tasks', task.id)
    }
    await window.electron.db.delete('columns', column.id)
    onTasksChange()

    window.dispatchEvent(
      new CustomEvent('show-toast', {
        detail: {
          message: `Column "${column.name}" deleted`,
          onUndo: async () => {
            await window.electron.db.create('columns', {
              id: columnSnapshot.id,
              name: columnSnapshot.name,
              boardId: columnSnapshot.boardId,
              order: columnSnapshot.order,
              createdAt: columnSnapshot.createdAt
            })
            for (const task of taskSnapshots) {
              await window.electron.db.create('tasks', task)
            }
            for (const subtask of subtaskSnapshots) {
              await window.electron.db.create('subtasks', subtask)
            }
            onTasksChange()
          }
        }
      })
    )
  }

  const handleExportColumn = async () => {
    setContextMenu(null)
    const columnSnapshot = { ...column }
    const taskSnapshots = [...(column.tasks || [])]

    // Clean items
    const cleanColumn = (() => {
      const { id, createdAt, updatedAt, boardId, columnId, order, ...rest } = columnSnapshot
      return rest
    })()

    const cleanTasks = taskSnapshots.map((task) => {
      const { id, createdAt, updatedAt, boardId, columnId, order, ...rest } = task

      // Basic parse
      const tags = (() => {
        try {
          return JSON.parse(rest.tags)
        } catch {
          return rest.tags
        }
      })()
      if (Array.isArray(tags)) rest.tags = tags.map((t: any) => t.name).join(', ')

      const subtasks = (() => {
        try {
          return JSON.parse(rest.subtasks)
        } catch {
          return rest.subtasks
        }
      })()
      if (Array.isArray(subtasks))
        rest.subtasks = subtasks
          .map((subtask: any) => `${subtask.completed ? '[x]' : '[ ]'} ${subtask.title}`)
          .join('; ')

      const status = (() => {
        try {
          return JSON.parse(rest.status)
        } catch {
          return rest.status
        }
      })()
      if (status && status.name) rest.status = status.name

      return rest
    })

    // Turn to markdown
    const md =
      `## Column: ${cleanColumn.name}\n` +
      (cleanTasks.length
        ? `| ${Object.keys(cleanTasks[0]).join(' | ')} |\n| ${Object.keys(cleanTasks[0])
            .map(() => '---')
            .join(' | ')} |\n` +
          cleanTasks
            .map(
              (c) =>
                `| ${Object.keys(c)
                  .map((k) => String(c[k] ?? ''))
                  .join(' | ')} |`
            )
            .join('\n')
        : '_No tasks_')

    const res = await (window.electron as any).export.saveFile({
      defaultName: `column-${cleanColumn.name.replace(/[^a-z0-9]/gi, '_').toLowerCase()}`,
      content: md,
      ext: 'md'
    })

    if (res?.success) {
      window.dispatchEvent(
        new CustomEvent('show-toast', {
          detail: { message: `Exported column to ${res.filePath}` }
        })
      )
      // As requested, also open it:
      ;(window.electron as any).export.openItem(res.filePath)
    }
  }

  const handleCreateTask = async (taskData: any) => {
    const newTask = {
      ...taskData,
      columnId: column.id,
      boardId,
      order: column.tasks?.length || 0,
      createdAt: Date.now(),
      updatedAt: Date.now()
    }

    await window.electron.db.create('tasks', newTask)
    onTasksChange()
    setShowCreateTask(false)
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

  const visibleTasks = (column.tasks || []).filter((task: any) => {
    if (hideStatuses.length === 0) return true
    const status =
      typeof task.status === 'string' && task.status.startsWith('{')
        ? JSON.parse(task.status)
        : task.status
    if (!status) return true
    return !hideStatuses.includes(status.name)
  })

  const hiddenCount = (column.tasks?.length || 0) - visibleTasks.length
  const taskCount = column.tasks?.length || 0
  const columnColor = column.color || '#2563eb'

  return (
    <>
      <div
        ref={setNodeRef}
        style={{
          ...style,
          width: orientation === 'vertical' ? '100%' : width,
          minWidth: orientation === 'vertical' ? MIN_WIDTH : MIN_WIDTH,
          maxWidth: orientation === 'vertical' ? '100%' : MAX_WIDTH,
          flexShrink: orientation === 'vertical' ? 1 : 0,
          height: effectiveHeight,
          maxHeight: effectiveHeight,
          minHeight: MIN_HEIGHT,
          overflow: 'visible'
        }}
        className="column relative"
        onContextMenu={openContextMenu}
      >
        {/* Column header */}
        <div
          className="flex items-center justify-between pb-3 border-b-2 shrink-0"
          style={{ borderColor: 'var(--color-border-strong)' }}
        >
          {isEditing ? (
            <input
              type="text"
              value={editedName}
              onChange={(e) => setEditedName(e.target.value)}
              onBlur={handleUpdateColumn}
              onKeyDown={(e) => e.key === 'Enter' && handleUpdateColumn()}
              className="aero-input flex-1 px-2 py-1 bg-transparent text-sm font-semibold focus:outline-none"
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
                style={{ backgroundColor: columnColor, borderColor: 'var(--color-border-strong)' }}
              />
              <h3
                className="font-black text-xs uppercase tracking-wider truncate"
                style={{ color: 'var(--color-text)' }}
              >
                {column.name}
              </h3>
              <span
                className="text-[10px] font-black px-1.5 py-0.5 shrink-0 border-2 ml-auto"
                style={{
                  borderColor: columnColor,
                  color: columnColor,
                  background: columnColor + '15'
                }}
              >
                {taskCount}
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
              title="Hide tasks by status"
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
                className="aero-window absolute right-0 top-full mt-1 z-50 min-w-[200px] animate-brutal-in"
                style={{
                  background: 'var(--color-surface)',
                  border: '1px solid var(--color-border-strong)',
                  boxShadow: 'var(--shadow-window)'
                }}
                onClick={(e) => e.stopPropagation()}
                ref={hidePanelRef}
              >
                <div
                  className="aero-titlebar px-3 py-2 text-[10px] font-semibold border-b"
                  style={{
                    color: 'white',
                    background: 'var(--color-primary)',
                    borderColor: 'var(--color-border-strong)'
                  }}
                >
                  Hide Tasks by Status
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
              <div
                className="w-4 h-0.5 rounded"
                style={{ background: 'var(--color-border-strong)' }}
              />
              <div
                className="w-4 h-0.5 rounded"
                style={{ background: 'var(--color-border-strong)' }}
              />
              <div
                className="w-4 h-0.5 rounded"
                style={{ background: 'var(--color-border-strong)' }}
              />
            </div>
          </div>
        </div>

        {/* Hidden task notice */}
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
            {hiddenCount} tasks hidden
          </div>
        )}

        {/* Tasks */}
        <div
          ref={setDropRef}
          className="flex-1 space-y-2 min-h-[40px] overflow-y-auto"
          style={
            isOver
              ? {
                  background: 'var(--color-primary-soft)',
                  borderRadius: '12px',
                  padding: '6px'
                }
              : undefined
          }
        >
          {visibleTasks.map((task: any) => (
            <Task
              key={task.id}
              task={task}
              onUpdate={onTasksChange}
              autoOpenId={openTaskId}
              onAutoOpenComplete={onTaskOpenComplete}
            />
          ))}
          {visibleTasks.length === 0 && (
            <div
              className="text-xs font-bold text-center border-2 border-dashed rounded-lg py-4"
              style={{
                borderColor: 'var(--color-border)',
                color: 'var(--color-muted)',
                background: 'var(--color-background)'
              }}
            >
              Drag tasks here
            </div>
          )}
        </div>

        {/* Add task */}
        <div className="shrink-0 pt-2 mt-auto">
          <button
            onClick={() => setShowCreateTask(true)}
            className="btn-secondary flex items-center justify-center gap-2 w-full px-3 py-2 border border-dashed transition-all duration-150 group text-xs"
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
            Add Task
          </button>
        </div>

        {/* Horizontal resize handle (only in horizontal layout) */}
        {orientation === 'horizontal' && (
          <button
            type="button"
            onMouseDown={handleResizeStart}
            onDoubleClick={resetWidth}
            className="absolute -right-3 top-1/2 -translate-y-1/2 w-7 h-10 rounded-md flex items-center justify-center cursor-ew-resize"
            style={{
              border: '2px solid var(--color-border-strong)',
              background: 'var(--color-background)',
              boxShadow: '1px 1px 0 var(--color-border-strong)'
            }}
            title="Drag to resize · Double-click to reset"
          >
            <MoveHorizontal className="w-4 h-4" style={{ color: 'var(--color-muted)' }} />
          </button>
        )}

        {/* Vertical resize handle, used when row height is not shared. */}
        {orientation === 'horizontal' && (
          <button
            type="button"
            onMouseDown={handleHeightResizeStart}
            onDoubleClick={resetHeight}
            className="absolute -bottom-3 left-1/2 -translate-x-1/2 w-16 h-7 rounded-md flex items-center justify-center cursor-ns-resize"
            style={{
              border: '2px solid var(--color-border-strong)',
              background: 'var(--color-background)',
              boxShadow: '1px 1px 0 var(--color-border-strong)'
            }}
            title="Drag to change height · Double-click to reset"
          >
            <MoveVertical className="w-4 h-4" style={{ color: 'var(--color-muted)' }} />
          </button>
        )}
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
            style={{
              background: 'var(--color-primary)',
              borderColor: 'var(--color-border-strong)'
            }}
          >
            {column.name}
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
            Edit Column
          </button>
          <button
            className="context-menu-item border-b-2"
            style={{ borderColor: 'var(--color-border)' }}
            onClick={handleExportColumn}
          >
            <Download className="w-4 h-4" />
            Export Column
          </button>
          <button
            className="context-menu-item border-b-2 danger"
            style={{ borderColor: 'var(--color-border)' }}
            onClick={handleDeleteColumn}
          >
            <Trash2 className="w-4 h-4" />
            Delete Column
          </button>
          <button
            className="context-menu-item"
            onClick={() => {
              setShowCreateTask(true)
              setContextMenu(null)
            }}
          >
            <Plus className="w-4 h-4" />
            Add Task
          </button>
        </div>
      )}

      {showCreateTask && (
        <CreateTaskModal
          onClose={() => setShowCreateTask(false)}
          onCreate={handleCreateTask}
          boardId={boardId}
        />
      )}
    </>
  )
}
