import { Board, Column, Project, Status, Subtask, Tag, Task } from '@shared/types'

const toNumber = (value: any, fallback = Date.now()): number => {
  const n = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(n) ? n : fallback
}

const parseJsonArray = <T>(value: any, fallback: T[]): T[] => {
  if (Array.isArray(value)) return value as T[]
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value)
      return Array.isArray(parsed) ? parsed : fallback
    } catch {
      return fallback
    }
  }
  return fallback
}

const parseStringArray = (value: any): string[] => {
  const arr = parseJsonArray<string>(value, [])
  return arr.map((v) => String(v)).filter(Boolean)
}

const parseTags = (value: any): Tag[] => {
  const arr = parseJsonArray<any>(value, [])
  return arr
    .filter((t) => t && (t.name || t.id))
    .map((t) => ({
      id: String(t.id ?? t.name ?? Math.random().toString(36).slice(2)),
      name: String(t.name ?? t.id ?? ''),
      color: t.color || '#2563eb'
    }))
}

const parseStatusValue = (value: any, boardId = ''): Status | null => {
  if (value == null) return null
  let raw = value
  if (typeof value === 'string') {
    try {
      raw = JSON.parse(value)
    } catch {
      return null
    }
  }
  if (!raw || !raw.id) return null
  return {
    id: String(raw.id),
    name: raw.name || 'Unspecified',
    color: raw.color || '#6b7280',
    boardId: raw.boardId || boardId
  }
}

const parseSubtasks = (value: any): Subtask[] => {
  const arr = parseJsonArray<any>(value, [])
  return arr
    .filter((subtask) => subtask && subtask.id)
    .map((subtask) => ({
      id: String(subtask.id),
      title: subtask.title || '',
      completed: subtask.completed === true || subtask.completed === 1 || subtask.completed === '1',
      taskId: String(subtask.taskId),
      createdAt: toNumber(subtask.createdAt ?? Date.now())
    }))
}

export const parseTask = (raw: any): Task => {
  const status =
    parseStatusValue(raw.status, raw.boardId) ||
    ({ id: '__unknown__', name: 'Unspecified', color: '#6b7280', boardId: raw.boardId || '' } as Status)

  return {
    id: String(raw.id),
    title: raw.title || '',
    description: raw.description || '',
    columnId: String(raw.columnId),
    boardId: raw.boardId ? String(raw.boardId) : undefined,
    order: Number(raw.order) || 0,
    color: raw.color || undefined,
    tags: parseTags(raw.tags),
    deadline: raw.deadline ? toNumber(raw.deadline) : undefined,
    status,
    notes: raw.notes || '',
    subtasks: parseSubtasks(raw.subtasks),
    connectedTaskIds: parseStringArray(raw.connectedTaskIds),
    connectedColumnIds: parseStringArray(raw.connectedColumnIds),
    createdAt: toNumber(raw.createdAt),
    updatedAt: toNumber(raw.updatedAt)
  }
}

export const parseColumn = (raw: any): Column => {
  const tasks = parseJsonArray<any>(raw.tasks, []).map(parseTask)
  return {
    id: String(raw.id),
    name: raw.name || '',
    boardId: String(raw.boardId),
    tasks,
    order: Number(raw.order) || 0,
    color: raw.color || undefined,
    createdAt: toNumber(raw.createdAt),
    updatedAt: toNumber(raw.updatedAt)
  }
}

export const parseBoard = (raw: any): Board => {
  const columns = parseJsonArray<any>(raw.columns, []).map(parseColumn)
  return {
    id: String(raw.id),
    name: raw.name || '',
    description: raw.description || undefined,
    projectId: String(raw.projectId),
    columns,
    connections: parseJsonArray(raw.connections, []),
    color: raw.color || undefined,
    tags: parseStringArray(raw.tags),
    createdAt: toNumber(raw.createdAt),
    updatedAt: toNumber(raw.updatedAt)
  }
}

export const parseProject = (raw: any): Project => {
  return {
    id: String(raw.id),
    name: raw.name || '',
    description: raw.description || undefined,
    workspaceId: raw.workspaceId || undefined,
    tags: parseJsonArray<string>(raw.tags, []).map((t) => String(t)),
    createdAt: toNumber(raw.createdAt),
    updatedAt: toNumber(raw.updatedAt),
    color: raw.color || undefined,
    boardIds: parseStringArray(raw.boardIds)
  }
}

// ── Fetch helpers ──

export const getProjects = async (): Promise<Project[]> => {
  const rows = await window.electron.db.findAll('projects')
  return (rows || []).map(parseProject)
}

export const getProjectById = async (projectId: string): Promise<Project | null> => {
  const row = await window.electron.db.findById('projects', projectId)
  return row ? parseProject(row) : null
}

export const getBoardsByProjectId = async (projectId: string): Promise<Board[]> => {
  const rows = await window.electron.db.findAll('boards')
  return (rows || [])
    .filter((board: any) => board.projectId === projectId)
    .map(parseBoard)
}

export const getBoardWithDetails = async (boardId: string): Promise<Board | null> => {
  const board = await window.electron.db.getBoardWithDetails(boardId)
  return board ? parseBoard(board) : null
}
