import { Board, Card, Dock, List, Status, SubCard, Tag } from '@shared/types'

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

const parseSubCards = (value: any): SubCard[] => {
  const arr = parseJsonArray<any>(value, [])
  return arr
    .filter((sc) => sc && sc.id)
    .map((sc) => ({
      id: String(sc.id),
      title: sc.title || '',
      completed: sc.completed === true || sc.completed === 1 || sc.completed === '1',
      cardId: String(sc.cardId ?? sc.card_id ?? ''),
      createdAt: toNumber(sc.createdAt ?? sc.created_at ?? Date.now())
    }))
}

export const parseCard = (raw: any): Card => {
  const status =
    parseStatusValue(raw.status, raw.boardId) ||
    ({ id: '__unknown__', name: 'Unspecified', color: '#6b7280', boardId: raw.boardId || '' } as Status)

  return {
    id: String(raw.id),
    title: raw.title || '',
    description: raw.description || '',
    listId: String(raw.listId),
    order: Number(raw.order) || 0,
    color: raw.color || undefined,
    tags: parseTags(raw.tags),
    deadline: raw.deadline ? toNumber(raw.deadline) : undefined,
    status,
    notes: raw.notes || '',
    subCards: parseSubCards(raw.subCards ?? raw.subcards),
    connectedCardIds: parseStringArray(raw.connectedCardIds),
    connectedListIds: parseStringArray(raw.connectedListIds),
    createdAt: toNumber(raw.createdAt),
    updatedAt: toNumber(raw.updatedAt)
  }
}

export const parseList = (raw: any): List => {
  const cards = parseJsonArray<any>(raw.cards, []).map(parseCard)
  return {
    id: String(raw.id),
    name: raw.name || '',
    boardId: String(raw.boardId),
    cards,
    order: Number(raw.order) || 0,
    color: raw.color || undefined,
    createdAt: toNumber(raw.createdAt),
    updatedAt: toNumber(raw.updatedAt)
  }
}

export const parseBoard = (raw: any): Board => {
  const lists = parseJsonArray<any>(raw.lists, []).map(parseList)
  return {
    id: String(raw.id),
    name: raw.name || '',
    dockId: String(raw.dockId),
    lists,
    connections: parseJsonArray(raw.connections, []),
    createdAt: toNumber(raw.createdAt),
    updatedAt: toNumber(raw.updatedAt)
  }
}

export const parseDock = (raw: any): Dock => {
  return {
    id: String(raw.id),
    name: raw.name || '',
    description: raw.description || undefined,
    folderId: raw.folderId || undefined,
    tags: parseJsonArray<string>(raw.tags, []).map((t) => String(t)),
    createdAt: toNumber(raw.createdAt),
    updatedAt: toNumber(raw.updatedAt),
    color: raw.color || undefined,
    boardIds: parseStringArray(raw.boardIds)
  }
}

// ── Fetch helpers ──

export const getDocks = async (): Promise<Dock[]> => {
  const rows = await window.electron.db.findAll('docks')
  return (rows || []).map(parseDock)
}

export const getDockById = async (dockId: string): Promise<Dock | null> => {
  const row = await window.electron.db.findById('docks', dockId)
  return row ? parseDock(row) : null
}

export const getBoardsByDockId = async (dockId: string): Promise<Board[]> => {
  const rows = await window.electron.db.findAll('boards')
  return (rows || [])
    .filter((b: any) => b.dockId === dockId)
    .map(parseBoard)
}

export const getBoardWithDetails = async (boardId: string): Promise<Board | null> => {
  const board = await window.electron.db.getBoardWithDetails(boardId)
  return board ? parseBoard(board) : null
}
