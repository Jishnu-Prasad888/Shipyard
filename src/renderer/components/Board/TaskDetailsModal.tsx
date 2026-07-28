import React, { useState, useEffect, useRef, useCallback } from 'react'
import { X, Calendar, Tag, CheckSquare, Link2, Plus, Trash2, Search, RotateCcw } from 'lucide-react'
import { MarkdownEditor } from './MarkdownEditor'
import { Subtask } from './Subtask'

interface TaskDetailsModalProps {
  task: any
  onClose: () => void
  onUpdate: () => void
}

const PRESET_COLORS = [
  '#ef4444',
  '#f59e0b',
  '#22c55e',
  '#3b82f6',
  '#8b5cf6',
  '#ec4899',
  '#06b6d4',
  '#f97316'
]

// Default statuses seeded for every board
const DEFAULT_STATUSES = [
  { id: '__todo__', name: 'To Do', color: '#6b7280', isDefault: true },
  { id: '__in_progress__', name: 'In Progress', color: '#f59e0b', isDefault: true },
  { id: '__done__', name: 'Done', color: '#10b981', isDefault: true }
]

interface StatusModalProps {
  onClose: () => void
  onCreate: (name: string, color: string) => void
}

const StatusModal: React.FC<StatusModalProps> = ({ onClose, onCreate }) => {
  const [name, setName] = useState('')
  const [color, setColor] = useState(PRESET_COLORS[0])

  const handleCreate = () => {
    if (name.trim()) {
      onCreate(name.trim(), color)
      onClose()
    }
  }

  return (
    <div
      className="fixed inset-0 flex items-center justify-center z-[60]"
      style={{ background: 'rgba(0,0,0,0.6)' }}
      onClick={onClose}
    >
      <div
        className="w-80 animate-brutal-in"
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'var(--color-surface)',
          border: '3px solid var(--color-border-strong)',
          boxShadow: 'var(--shadow-brutal)'
        }}
      >
        <div
          className="flex items-center justify-between px-4 py-3 border-b-2"
          style={{ background: 'var(--color-primary)', borderColor: 'var(--color-border-strong)' }}
        >
          <h3 className="text-sm font-black text-white uppercase tracking-wider">New Status</h3>
          <button
            onClick={onClose}
            className="w-6 h-6 border-2 border-white text-white flex items-center justify-center hover:bg-white/20"
          >
            <X className="w-3 h-3" />
          </button>
        </div>
        <div className="p-4 space-y-3">
          <div>
            <label className="block text-xs font-black uppercase tracking-wider mb-1">
              Status Name
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
              className="w-full px-3 py-2 border-2 text-sm font-bold focus:outline-none"
              style={{
                borderColor: 'var(--color-border-strong)',
                background: 'var(--color-background)',
                color: 'var(--color-text)'
              }}
              placeholder="e.g. In Review"
              autoFocus
            />
          </div>
          <div>
            <label className="block text-xs font-black uppercase tracking-wider mb-2">Color</label>
            <div className="flex gap-2 flex-wrap">
              {PRESET_COLORS.map((c) => (
                <button
                  key={c}
                  onClick={() => setColor(c)}
                  className="w-7 h-7 border-2 transition-all"
                  style={{
                    backgroundColor: c,
                    borderColor: color === c ? 'var(--color-border-strong)' : 'transparent',
                    boxShadow: color === c ? '2px 2px 0 var(--color-border-strong)' : 'none',
                    transform: color === c ? 'translate(-1px,-1px)' : 'none'
                  }}
                />
              ))}
            </div>
          </div>
          <div className="flex gap-2 pt-1">
            <button onClick={onClose} className="btn-secondary text-xs flex-1">
              Cancel
            </button>
            <button
              onClick={handleCreate}
              disabled={!name.trim()}
              className="btn-primary text-xs flex-1 disabled:opacity-40"
            >
              Create
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export const TaskDetailsModal: React.FC<TaskDetailsModalProps> = ({ task, onClose, onUpdate }) => {
  const [title, setTitle] = useState(task.title)
  const [description, setDescription] = useState(task.description || '')
  const [deadlineStr, setDeadlineStr] = useState(
    task.deadline ? new Date(task.deadline).toISOString().split('T')[0] : ''
  )
  const [status, setStatus] = useState<any>(
    typeof task.status === 'string' && task.status.startsWith('{')
      ? JSON.parse(task.status)
      : task.status || null
  )
  const [color, setColor] = useState(task.color || '')
  const [tags, setTags] = useState<any[]>(
    typeof task.tags === 'string' ? JSON.parse(task.tags || '[]') : task.tags || []
  )
  const [subtasks, setSubtasks] = useState<any[]>(task.subtasks || [])
  const [notes, setNotes] = useState(task.notes || '')
  const [availableStatuses, setAvailableStatuses] = useState<any[]>([])
  const [newTagName, setNewTagName] = useState('')
  const [newSubtaskTitle, setNewSubtaskTitle] = useState('')
  const [showStatusModal, setShowStatusModal] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [projectTagSuggestions, setProjectTagSuggestions] = useState<any[]>([])
  const [showTagSuggestions, setShowTagSuggestions] = useState(false)

  // Refs for autosave
  const lastSavedSubtasks = useRef<any[]>(task.subtasks || [])
  const isInitialRender = useRef(true)
  const initialState = useRef({
    title: task.title,
    description: task.description || '',
    deadlineStr: task.deadline ? new Date(task.deadline).toISOString().split('T')[0] : '',
    status:
      typeof task.status === 'string' && task.status.startsWith('{')
        ? JSON.parse(task.status)
        : task.status || null,
    color: task.color || '',
    tags: typeof task.tags === 'string' ? JSON.parse(task.tags || '[]') : task.tags || [],
    subtasks: task.subtasks || [],
    notes: task.notes || '',
    connectedTaskIds:
      typeof task.connectedTaskIds === 'string'
        ? JSON.parse(task.connectedTaskIds || '[]')
        : task.connectedTaskIds || []
  })

  const [connectedTaskIds, setConnectedTaskIds] = useState<string[]>(
    typeof task.connectedTaskIds === 'string'
      ? JSON.parse(task.connectedTaskIds || '[]')
      : task.connectedTaskIds || []
  )
  const [showLinkSearch, setShowLinkSearch] = useState(false)
  const [allTasks, setAllTasks] = useState<any[]>([])
  const [linkSearchQuery, setLinkSearchQuery] = useState('')
  const [connectedTaskDetails, setConnectedTaskDetails] = useState<any[]>([])

  useEffect(() => {
    loadStatuses()
    loadConnectedTasks()
    loadProjectTagSuggestions()
  }, [])

  // Debounced autosave
  useEffect(() => {
    if (isInitialRender.current) {
      isInitialRender.current = false
      return
    }
    const timer = setTimeout(() => {
      syncToDb(false)
    }, 1000)
    return () => clearTimeout(timer)
  }, [title, description, deadlineStr, status, color, tags, notes, connectedTaskIds, subtasks])

  const loadStatuses = async () => {
    const dbStatuses = await window.electron.db.findAll('statuses')
    const boardStatuses = dbStatuses
      .filter((s: any) => s.boardId === task.boardId)
      .map((s: any) => ({
        ...s,
        isDefault: s.isDefault ?? false
      }))

    setAvailableStatuses([...DEFAULT_STATUSES, ...boardStatuses])
  }

  const loadProjectTagSuggestions = async () => {
    const currentBoard = await window.electron.db.findById('boards', task.boardId)
    const projectId = currentBoard?.projectId
    const allBoards = await window.electron.db.findAll('boards')
    const allTasks = await window.electron.db.findAll('tasks')

    let relevantTasks: any[]
    if (projectId) {
      const projectBoardIds = new Set(
        allBoards.filter((board: any) => board.projectId === projectId).map((board: any) => board.id)
      )
      relevantTasks = allTasks.filter((candidate: any) => projectBoardIds.has(candidate.boardId) && candidate.id !== task.id)
    } else {
      relevantTasks = allTasks.filter((candidate: any) => candidate.boardId === task.boardId && candidate.id !== task.id)
    }

    const tagMap = new Map<string, any>()
    for (const candidate of relevantTasks) {
      const taskTags = typeof candidate.tags === 'string' ? JSON.parse(candidate.tags || '[]') : candidate.tags || []
      for (const t of taskTags) {
        if (t.name && !tagMap.has(t.name.toLowerCase())) {
          tagMap.set(t.name.toLowerCase(), t)
        }
      }
    }
    setProjectTagSuggestions(Array.from(tagMap.values()))
  }

  const loadConnectedTasks = async () => {
    const ids =
      typeof task.connectedTaskIds === 'string'
        ? JSON.parse(task.connectedTaskIds || '[]')
        : task.connectedTaskIds || []

    if (ids.length > 0) {
      const currentBoard = await window.electron.db.findById('boards', task.boardId)
      const projectId = currentBoard?.projectId
      const allBoards = await window.electron.db.findAll('boards')
      const boardMap: Record<string, string> = {}
      allBoards.forEach((b: any) => {
        boardMap[b.id] = b.name
      })

      const details = await Promise.all(
        ids.map((id: string) => window.electron.db.findById('tasks', id))
      )

      let filtered = details.filter((d: any) => d != null)

      if (projectId) {
        const projectBoardIds = new Set(
          allBoards.filter((board: any) => board.projectId === projectId).map((board: any) => board.id)
        )
        filtered = filtered.filter((detail: any) => projectBoardIds.has(detail.boardId))
      } else {
        filtered = filtered.filter((detail: any) => detail.boardId === task.boardId)
      }

      // Attach board name for display
      filtered = filtered.map((d: any) => ({ ...d, _boardName: boardMap[d.boardId] || '' }))
      setConnectedTaskDetails(filtered)
    }
  }

  // Shared save logic — closeAfter=true for manual save, false for autosave
  const syncToDb = useCallback(
    async (closeAfter: boolean) => {
      setIsSaving(true)
      try {
        const updatedTask = {
          ...task,
          title,
          description,
          deadline: deadlineStr ? new Date(deadlineStr).getTime() : null,
          status: status ? JSON.stringify(status) : null,
          color,
          tags: JSON.stringify(tags),
          notes,
          connectedTaskIds: JSON.stringify(connectedTaskIds),
          updatedAt: Date.now()
        }
        delete updatedTask.subtasks

        const oldSubtasks = lastSavedSubtasks.current

        for (const oldSubtask of oldSubtasks) {
          if (!subtasks.find((subtask: any) => subtask.id === oldSubtask.id)) {
            await window.electron.db.delete('subtasks', oldSubtask.id)
          }
        }

        for (const subtask of subtasks) {
          const oldSubtask = oldSubtasks.find((candidate: any) => candidate.id === subtask.id)
          if (!oldSubtask) {
            await window.electron.db.create('subtasks', {
              id: subtask.id,
              title: subtask.title,
              completed: subtask.completed ? 1 : 0,
              taskId: task.id,
              createdAt: subtask.createdAt || Date.now()
            })
          } else if (oldSubtask.completed !== subtask.completed || oldSubtask.title !== subtask.title) {
            await window.electron.db.update('subtasks', subtask.id, {
              title: subtask.title,
              completed: subtask.completed ? 1 : 0
            })
          }
        }

        await window.electron.db.update('tasks', task.id, updatedTask)
        lastSavedSubtasks.current = subtasks
        onUpdate()
        if (closeAfter) onClose()
      } finally {
        setIsSaving(false)
      }
    },
    [title, description, deadlineStr, status, color, tags, notes, connectedTaskIds, subtasks]
  )

  const handleSave = () => syncToDb(true)

  const handleUndoChanges = async () => {
    const s = initialState.current

    // Revert state
    setTitle(s.title)
    setDescription(s.description)
    setDeadlineStr(s.deadlineStr)
    setStatus(s.status)
    setColor(s.color)
    setTags(s.tags)
    setSubtasks(s.subtasks)
    setNotes(s.notes)
    setConnectedTaskIds(s.connectedTaskIds)

    // Revert DB (Silently sync the initial state back)
    const revertedTask = {
      ...task,
      title: s.title,
      description: s.description,
      deadline: s.deadlineStr ? new Date(s.deadlineStr).getTime() : null,
      status: s.status ? JSON.stringify(s.status) : null,
      color: s.color,
      tags: JSON.stringify(s.tags),
      notes: s.notes,
      connectedTaskIds: JSON.stringify(s.connectedTaskIds),
      updatedAt: Date.now()
    }
    delete revertedTask.subtasks

    const currentSubtasks = subtasks
    // Delete ones that didn't exist originally
    for (const subtask of currentSubtasks) {
      if (!s.subtasks.find((original: any) => original.id === subtask.id)) {
        await window.electron.db.delete('subtasks', subtask.id)
      }
    }
    // Re-create/Update ones that did exist
    for (const original of s.subtasks) {
      const match = currentSubtasks.find((subtask: any) => subtask.id === original.id)
      if (!match) {
        // Was deleted, re-create
        await window.electron.db.create('subtasks', original)
      } else if (match.completed !== original.completed || match.title !== original.title) {
        // Was changed, update back
        await window.electron.db.update('subtasks', original.id, {
          title: original.title,
          completed: original.completed ? 1 : 0
        })
      }
    }

    await window.electron.db.update('tasks', task.id, revertedTask)
    lastSavedSubtasks.current = s.subtasks
    onUpdate()
    onClose()
  }

  const handleAddTag = () => {
    if (newTagName.trim()) {
      const newTag = {
        id: Date.now().toString(),
        name: newTagName.trim(),
        color: PRESET_COLORS[tags.length % PRESET_COLORS.length]
      }
      setTags([...tags, newTag])
      setNewTagName('')
      setShowTagSuggestions(false)
    }
  }

  const handleAddTagFromSuggestion = (suggestion: any) => {
    // Don't add if already present
    if (tags.find((t: any) => t.name.toLowerCase() === suggestion.name.toLowerCase())) {
      setNewTagName('')
      setShowTagSuggestions(false)
      return
    }
    setTags([...tags, { ...suggestion, id: Date.now().toString() }])
    setNewTagName('')
    setShowTagSuggestions(false)
  }

  const handleRemoveTag = (tagId: string) => {
    setTags(tags.filter((t: any) => t.id !== tagId))
  }

  const handleAddSubtask = () => {
    if (newSubtaskTitle.trim()) {
      const newSubtask = {
        id: Date.now().toString(),
        title: newSubtaskTitle,
        completed: false,
        taskId: task.id,
        createdAt: Date.now()
      }
      setSubtasks([...subtasks, newSubtask])
      setNewSubtaskTitle('')
    }
  }

  const handleToggleSubtask = async (subtaskId: string) => {
    const updatedSubtasks = subtasks.map((subtask: any) =>
      subtask.id === subtaskId ? { ...subtask, completed: !subtask.completed } : subtask
    )
    setSubtasks(updatedSubtasks)
  }

  const handleDeleteSubtask = async (subtaskId: string) => {
    setSubtasks(subtasks.filter((subtask: any) => subtask.id !== subtaskId))
  }

  const handleCreateStatus = async (name: string, color: string) => {
    const newStatus = {
      name,
      color,
      boardId: task.boardId,
      isDefault: false
    }
    const created = await window.electron.db.create('statuses', newStatus)
    setAvailableStatuses([...availableStatuses, created])
    setStatus(created)
  }

  // ===== UPDATED: Delete any status (including default) =====
  const handleDeleteStatus = async (statusToDelete: any) => {
    // Determine if this is a default status (not stored in DB)
    const isDefault = statusToDelete.isDefault === true

    // Snapshot: for default, use the object itself; for custom, fetch from DB
    let statusSnapshot = isDefault
      ? { ...statusToDelete }
      : await window.electron.db.findById('statuses', statusToDelete.id)

    if (!statusSnapshot) {
      console.warn('Status snapshot not found, aborting delete')
      return
    }

    const allTasks = await window.electron.db.findAll('tasks')
    const affectedTasks = allTasks.filter((candidate: any) => {
      const taskStatus =
        typeof candidate.status === 'string' && candidate.status.startsWith('{') ? JSON.parse(candidate.status) : candidate.status
      return taskStatus && taskStatus.id === statusToDelete.id
    })
    const affectedTaskIds = affectedTasks.map((candidate: any) => candidate.id)

    // Update local state immediately
    if (status?.id === statusToDelete.id) setStatus(null)
    setAvailableStatuses((prev) => prev.filter((s) => s?.id !== statusToDelete.id))

    // Perform deletions
    if (!isDefault) {
      // Only delete from DB if it's a custom status
      await window.electron.db.delete('statuses', statusToDelete.id)
    }
    for (const taskId of affectedTaskIds) {
      await window.electron.db.update('tasks', taskId, { status: null })
    }

    // Show toast with safe undo
    window.dispatchEvent(
      new CustomEvent('show-toast', {
        detail: {
          message: `Status "${statusToDelete.name}" deleted`,
          onUndo: async () => {
            try {
              if (!isDefault) {
                // Re-create the status in DB
                statusSnapshot = await window.electron.db.create('statuses', statusSnapshot)
              }
              for (const taskId of affectedTaskIds) {
                await window.electron.db.update('tasks', taskId, {
                  status: JSON.stringify(statusSnapshot)
                })
              }
              if (affectedTaskIds.includes(task.id)) {
                setStatus(statusSnapshot)
              }
              // Refresh the entire status list to ensure consistency
              const freshStatuses = await window.electron.db.findAll('statuses')
              const boardFreshStatuses = freshStatuses
                .filter((s: any) => s.boardId === task.boardId)
                .map((s: any) => ({ ...s, isDefault: s.isDefault ?? false }))
              // Merge with DEFAULT_STATUSES, making sure we don't duplicate if a default was re-added
              const merged = [...DEFAULT_STATUSES, ...boardFreshStatuses].filter(
                (s, index, self) => self.findIndex((t) => t.id === s.id) === index
              )
              setAvailableStatuses(merged)
            } catch (error) {
              console.error('Undo failed:', error)
            }
          }
        }
      })
    )
  }

  const handleDeleteTagGlobal = async (tagToDelete: any) => {
    // 1. Snapshot
    const snapshotTag = { ...tagToDelete }

    // 2. Remove
    handleRemoveTag(tagToDelete.id)

    // 3. Toast
    window.dispatchEvent(
      new CustomEvent('show-toast', {
        detail: {
          message: `Tag "${tagToDelete.name}" removed`,
          onUndo: () => {
            setTags((prev) => {
              if (!prev.find((t) => t.id === snapshotTag.id)) {
                return [...prev, snapshotTag]
              }
              return prev
            })
          }
        }
      })
    )
  }

  const handleDeleteTask = async () => {
    // Capture state for undo
    const taskSnapshot = await window.electron.db.findById('tasks', task.id)
    const allSubtasks = await window.electron.db.findAll('subtasks')
    const taskSubtasks = allSubtasks.filter((subtask: any) => subtask.taskId === task.id)

    await window.electron.db.delete('tasks', task.id)

    // Trigger toast via custom event
    window.dispatchEvent(
      new CustomEvent('show-toast', {
        detail: {
          message: `Task "${title}" deleted`,
          onUndo: async () => {
            await window.electron.db.create('tasks', taskSnapshot)
            for (const subtask of taskSubtasks) {
              await window.electron.db.create('subtasks', subtask)
            }
            onUpdate()
          }
        }
      })
    )

    onUpdate()
    onClose()
  }

  // Task linking is scoped to the current project.
  const handleOpenLinkSearch = async () => {
    const currentBoard = await window.electron.db.findById('boards', task.boardId)
    const projectId = currentBoard?.projectId

    const allTasks = await window.electron.db.findAll('tasks')
    const allBoards = await window.electron.db.findAll('boards')
    const boardMap: Record<string, string> = {}
    allBoards.forEach((b: any) => {
      boardMap[b.id] = b.name
    })

    let filtered: any[]

    if (projectId) {
      const projectBoardIds = new Set(
        allBoards.filter((board: any) => board.projectId === projectId).map((board: any) => board.id)
      )
      filtered = allTasks.filter(
        (candidate: any) =>
          projectBoardIds.has(candidate.boardId) && candidate.id !== task.id && !connectedTaskIds.includes(candidate.id)
      )
    } else {
      filtered = allTasks.filter(
        (candidate: any) =>
          candidate.boardId === task.boardId && candidate.id !== task.id && !connectedTaskIds.includes(candidate.id)
      )
    }

    // Attach board name for display
    filtered = filtered.map((c: any) => ({ ...c, _boardName: boardMap[c.boardId] || '' }))

    setAllTasks(filtered)
    setShowLinkSearch(true)
  }

  const handleLinkTask = async (targetTaskId: string) => {
    const newConnectedIds = [...connectedTaskIds, targetTaskId]
    setConnectedTaskIds(newConnectedIds)

    const targetTask = await window.electron.db.findById('tasks', targetTaskId)
    if (targetTask) {
      const targetConnected =
        typeof targetTask.connectedTaskIds === 'string'
          ? JSON.parse(targetTask.connectedTaskIds || '[]')
          : targetTask.connectedTaskIds || []
      if (!targetConnected.includes(task.id)) {
        targetConnected.push(task.id)
        await window.electron.db.update('tasks', targetTaskId, {
          connectedTaskIds: JSON.stringify(targetConnected),
          updatedAt: Date.now()
        })
      }
    }

    // Update connected details
    const detail = await window.electron.db.findById('tasks', targetTaskId)
    if (detail) {
      setConnectedTaskDetails([...connectedTaskDetails, detail])
    }

    // Remove from available list
    setAllTasks(allTasks.filter((candidate: any) => candidate.id !== targetTaskId))
    setShowLinkSearch(false)
    setLinkSearchQuery('')
  }

  const handleUnlinkTask = async (targetTaskId: string) => {
    const newConnectedIds = connectedTaskIds.filter((id) => id !== targetTaskId)
    setConnectedTaskIds(newConnectedIds)
    setConnectedTaskDetails(connectedTaskDetails.filter((candidate: any) => candidate.id !== targetTaskId))

    // Remove reverse connection
    const targetTask = await window.electron.db.findById('tasks', targetTaskId)
    if (targetTask) {
      const targetConnected =
        typeof targetTask.connectedTaskIds === 'string'
          ? JSON.parse(targetTask.connectedTaskIds || '[]')
          : targetTask.connectedTaskIds || []
      const filtered = targetConnected.filter((id: string) => id !== task.id)
      await window.electron.db.update('tasks', targetTaskId, {
        connectedTaskIds: JSON.stringify(filtered),
        updatedAt: Date.now()
      })
    }
  }

  const filteredLinkTasks = allTasks.filter((candidate: any) =>
    candidate.title.toLowerCase().includes(linkSearchQuery.toLowerCase())
  )

  const completedCount = subtasks.filter((subtask: any) => subtask.completed).length

  const currentStatus = availableStatuses.find(
    (s) => s.id === (status?.id || '') || s.name === status?.name
  )

  return (
    <>
      <div
        className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
        onClick={onClose}
      >
        <div
          className="w-full max-w-4xl max-h-[90vh] surface rounded-xl flex flex-col"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b border-border">
            <textarea
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="text-xl font-bold bg-transparent border-none focus:outline-none focus:ring-2 focus:ring-primary rounded px-2 flex-1 resize-none overflow-hidden break-words whitespace-pre-wrap leading-tight py-2"
              rows={1}
              placeholder="Task title"
              onInput={(e) => {
                e.currentTarget.style.height = 'auto'
                e.currentTarget.style.height = e.currentTarget.scrollHeight + 'px'
              }}
              ref={(el) => {
                if (el) {
                  el.style.height = 'auto'
                  el.style.height = el.scrollHeight + 'px'
                }
              }}
              style={
                currentStatus?.id === '__completed__'
                  ? { textDecoration: 'line-through', opacity: 0.7 }
                  : {}
              }
            />
            <div className="flex items-center gap-2">
              <button
                onClick={handleDeleteTask}
                className="p-2 rounded-lg hover:bg-alert/10 text-muted hover:text-alert transition"
                title="Delete task"
              >
                <Trash2 className="w-5 h-5" />
              </button>
              <button onClick={onClose} className="p-2 rounded-lg hover:bg-primary-soft transition">
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-auto p-6">
            <div className="grid grid-cols-3 gap-6">
              {/* Main Content */}
              <div className="col-span-2 space-y-6">
                {/* Description */}
                <div>
                  <h3 className="font-medium mb-2">Description</h3>
                  <textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    className="w-full px-3 py-2 border border-border rounded-lg bg-surface text-text focus:outline-none focus:border-primary"
                    rows={4}
                    placeholder="Add a description..."
                  />
                </div>

                  {/* Subtasks */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="font-medium">
                      Subtasks{' '}
                      {subtasks.length > 0 && (
                        <span className="text-sm text-muted font-normal">
                          ({completedCount}/{subtasks.length})
                        </span>
                      )}
                    </h3>
                  </div>

                  {/* Progress bar */}
                  {subtasks.length > 0 && (
                    <div className="w-full h-2 bg-border rounded-full mb-3 overflow-hidden">
                      <div
                        className="h-full bg-primary rounded-full transition-all duration-300"
                        style={{
                          width: `${(completedCount / subtasks.length) * 100}%`
                        }}
                      />
                    </div>
                  )}

                  <div className="space-y-2">
                    {subtasks.map((subtask: any) => (
                      <Subtask
                        key={subtask.id}
                        subtask={subtask}
                        onToggle={handleToggleSubtask}
                        onDelete={handleDeleteSubtask}
                      />
                    ))}

                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={newSubtaskTitle}
                        onChange={(e) => setNewSubtaskTitle(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleAddSubtask()}
                        className="flex-1 px-3 py-2 border border-border rounded-lg bg-surface text-text focus:outline-none focus:border-primary"
                        placeholder="Add a subtask..."
                      />
                      <button
                        onClick={handleAddSubtask}
                        className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-opacity-90 transition"
                      >
                        Add
                      </button>
                    </div>
                  </div>
                </div>

                {/* Notes (Markdown) */}
                <div>
                  <h3 className="font-medium mb-2">Notes</h3>
                  <MarkdownEditor value={notes} onChange={setNotes} />
                </div>
              </div>

              {/* Sidebar */}
              <div className="space-y-4">
                {/* Status */}
                <div className="p-4 border border-border rounded-lg">
                  <h4 className="font-medium mb-2 flex items-center gap-2">
                    <CheckSquare className="w-4 h-4" />
                    Status
                  </h4>

                  {/* Status chips */}
                  <div className="flex flex-wrap gap-2 mb-3">
                    {availableStatuses
                      .filter((s) => s && typeof s === 'object' && s.id) // Ensure valid objects
                      .map((s: any) => {
                        const isSelected = status?.id === s.id || status?.name === s.name

                        return (
                          <div key={s.id} className="inline-flex items-center gap-1">
                            <button
                              onClick={() => setStatus(isSelected ? null : s)}
                              className="text-[10px] px-2 py-1 font-black uppercase tracking-wider border-2"
                              style={{
                                backgroundColor: isSelected ? s.color : s.color + '15',
                                color: isSelected ? 'white' : s.color,
                                borderColor: s.color
                              }}
                            >
                              {s.name}
                            </button>

                            {/* Trash icon now shows for ALL statuses (including default) */}
                            <button
                              onClick={() => handleDeleteStatus(s)}
                              className="p-1 rounded hover:bg-red-500/10"
                            >
                              <Trash2 className="w-4 h-4 text-red-500" />
                            </button>
                          </div>
                        )
                      })}
                  </div>

                  <button
                    onClick={() => setShowStatusModal(true)}
                    className="text-sm text-primary hover:underline flex items-center gap-1 font-bold"
                  >
                    <Plus className="w-3 h-3" />
                    Add new status
                  </button>
                </div>

                {/* Deadline */}
                <div className="p-4 border border-border rounded-lg">
                  <h4 className="font-medium mb-2 flex items-center gap-2">
                    <Calendar className="w-4 h-4" />
                    Deadline
                  </h4>
                  <input
                    type="date"
                    value={deadlineStr}
                    onChange={(e) => setDeadlineStr(e.target.value)}
                    className="w-full px-3 py-2 border border-border rounded-lg bg-surface text-text focus:outline-none focus:border-primary"
                  />
                  {deadlineStr && (
                    <button
                      onClick={() => setDeadlineStr('')}
                      className="mt-2 text-sm text-alert hover:underline"
                    >
                      Clear deadline
                    </button>
                  )}
                </div>

                {/* Color */}
                <div className="p-4 border border-border rounded-lg">
                  <h4 className="font-medium mb-2">Task Color</h4>
                  <div className="flex flex-wrap gap-2">
                    {PRESET_COLORS.map((c) => (
                      <button
                        key={c}
                        onClick={() => setColor(color === c ? '' : c)}
                        className={`w-7 h-7 rounded-full transition-transform ${
                          color === c
                            ? 'ring-2 ring-offset-2 ring-primary scale-110'
                            : 'hover:scale-110'
                        }`}
                        style={{ backgroundColor: c }}
                      />
                    ))}
                  </div>
                </div>

                {/* Tags */}
                <div className="p-4 border border-border rounded-lg">
                  <h4 className="font-medium mb-2 flex items-center gap-2">
                    <Tag className="w-4 h-4" />
                    Tags
                  </h4>
                  <div className="space-y-2">
                    <div className="relative">
                      <div className="flex gap-2 overflow-hidden">
                        <input
                          type="text"
                          value={newTagName}
                          onChange={(e) => {
                            setNewTagName(e.target.value)
                            setShowTagSuggestions(true)
                          }}
                          onFocus={() => setShowTagSuggestions(true)}
                          onBlur={() => setTimeout(() => setShowTagSuggestions(false), 200)}
                          onKeyDown={(e) => e.key === 'Enter' && handleAddTag()}
                          className="flex-1 min-w-0 px-3 py-2 border border-border rounded-lg bg-surface text-text focus:outline-none focus:border-primary text-sm"
                          placeholder="New tag..."
                        />
                        <button
                          onClick={handleAddTag}
                          className="shrink-0 px-3 py-2 bg-primary text-white rounded-lg hover:bg-opacity-90 transition"
                        >
                          <Plus className="w-4 h-4" />
                        </button>
                      </div>

                      {showTagSuggestions && (
                        <div className="absolute top-full left-0 right-0 mt-1 surface border border-border rounded-lg shadow-xl z-20 max-h-48 overflow-auto">
                          {projectTagSuggestions
                            .filter(
                              (s) =>
                                s.name.toLowerCase().includes(newTagName.toLowerCase()) &&
                                !tags.find(
                                  (t: any) => t.name.toLowerCase() === s.name.toLowerCase()
                                )
                            )
                            .map((suggestion) => (
                              <button
                                key={suggestion.id}
                                onMouseDown={(e) => {
                                  e.preventDefault()
                                  handleAddTagFromSuggestion(suggestion)
                                }}
                                className="w-full text-left px-3 py-2 hover:bg-primary-soft transition flex items-center gap-2"
                              >
                                <div
                                  className="w-2 h-2 rounded-full"
                                  style={{ backgroundColor: suggestion.color }}
                                />
                                <span className="text-sm">{suggestion.name}</span>
                              </button>
                            ))}
                        {projectTagSuggestions.filter(
                            (s) =>
                              s.name.toLowerCase().includes(newTagName.toLowerCase()) &&
                              !tags.find((t: any) => t.name.toLowerCase() === s.name.toLowerCase())
                          ).length === 0 &&
                            newTagName.trim() === '' && (
                              <div className="px-3 py-2 text-xs text-muted italic">
                              No other tags found in this project
                              </div>
                            )}
                        </div>
                      )}
                    </div>

                    <div className="flex flex-wrap gap-2 mt-2">
                      {tags.map((tag: any) => (
                        <span
                          key={tag.id}
                          className="tag flex items-center gap-1 cursor-context-menu"
                          title="Right-click to remove"
                          onContextMenu={(e) => {
                            e.preventDefault()
                            handleDeleteTagGlobal(tag)
                          }}
                          style={{ backgroundColor: tag.color + '20', color: tag.color }}
                        >
                          {tag.name}
                          <button
                            onClick={() => handleRemoveTag(tag.id)}
                            className="hover:text-alert"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </span>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Connected tasks in this project */}
                <div className="p-4 border border-border rounded-lg">
                  <h4 className="font-medium mb-2 flex items-center gap-2">
                    <Link2 className="w-4 h-4" />
                    Connected Tasks
                    <span className="text-[10px] text-muted font-normal ml-auto">same project</span>
                  </h4>

                  {connectedTaskDetails.length > 0 && (
                    <div className="space-y-2 mb-3">
                      {connectedTaskDetails.map((connectedTask: any) => (
                        <div
                          key={connectedTask.id}
                          className="flex items-center justify-between p-2 rounded-lg border border-border hover:border-primary/50 transition"
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <Link2 className="w-3.5 h-3.5 text-primary shrink-0" />
                            <div className="min-w-0">
                              <span className="text-sm break-words whitespace-pre-wrap block max-w-full leading-tight">
                                {connectedTask.title}
                              </span>
                              {connectedTask.boardId !== task.boardId && (
                                <span className="text-[10px] text-muted font-bold uppercase tracking-wider">
                                  {connectedTask._boardName || 'Other board'}
                                </span>
                              )}
                            </div>
                          </div>
                          <button
                            onClick={() => handleUnlinkTask(connectedTask.id)}
                            className="p-1 text-muted hover:text-alert transition"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  {showLinkSearch ? (
                    <div className="space-y-2">
                      <div className="relative">
                        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted" />
                        <input
                          type="text"
                          value={linkSearchQuery}
                          onChange={(e) => setLinkSearchQuery(e.target.value)}
                          className="w-full pl-8 pr-3 py-2 border border-border rounded-lg bg-surface text-text text-sm focus:outline-none focus:border-primary"
                          placeholder="Search tasks in this project..."
                          autoFocus
                        />
                      </div>
                      <div className="max-h-40 overflow-auto space-y-1">
                        {filteredLinkTasks.length > 0 ? (
                          filteredLinkTasks.map((candidate: any) => (
                            <button
                              key={candidate.id}
                              onClick={() => handleLinkTask(candidate.id)}
                              className="w-full text-left px-3 py-2 rounded-lg hover:bg-primary-soft transition"
                            >
                              <p className="text-sm break-words whitespace-pre-wrap leading-tight">
                                {candidate.title}
                              </p>
                              {candidate.boardId !== task.boardId && candidate._boardName && (
                                <p className="text-[10px] text-muted font-bold uppercase tracking-wider">
                                  {candidate._boardName}
                                </p>
                              )}
                            </button>
                          ))
                        ) : (
                          <p className="text-xs text-muted p-2">No tasks found in this project</p>
                        )}
                      </div>
                      <button
                        onClick={() => {
                          setShowLinkSearch(false)
                          setLinkSearchQuery('')
                        }}
                        className="text-xs text-muted hover:text-text"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={handleOpenLinkSearch}
                      className="w-full px-3 py-2 border border-dashed border-border rounded-lg hover:border-primary hover:bg-primary-soft transition text-muted hover:text-primary text-sm"
                    >
                      + Connect to task
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between p-4 border-t border-border">
            <span className="text-xs text-muted italic select-none">
              {isSaving ? '⏳ Saving…' : '✓ Auto-saved'}
            </span>
            <div className="flex gap-2">
              <button
                onClick={handleUndoChanges}
                className="px-4 py-2 border border-border rounded-lg hover:bg-primary-soft transition flex items-center gap-2"
              >
                <RotateCcw className="w-4 h-4" />
                Undo Changes
              </button>
              <button
                onClick={handleSave}
                disabled={isSaving}
                className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-opacity-90 transition disabled:opacity-60 disabled:cursor-not-allowed"
              >
                Save &amp; Close
              </button>
            </div>
          </div>
        </div>
      </div>

      {showStatusModal && (
        <StatusModal onClose={() => setShowStatusModal(false)} onCreate={handleCreateStatus} />
      )}
    </>
  )
}
