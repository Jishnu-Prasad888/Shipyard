/**
 * Data and layout for the overview dashboard: which tasks a widget looks at
 * (its scope), the numbers each widget shows, and the saved widget layout.
 * Everything here is pure so it can be tested without the app.
 */
import { workspaceWithDescendants } from './hierarchy'

// ── Data ──────────────────────────────────────────────────────────────

export interface DashWorkspace {
  id: string
  name: string
  color?: string
  parentWorkspaceId?: string | null
}
export interface DashProject {
  id: string
  name: string
  color?: string
  workspaceId?: string | null
  githubRepo?: string
}
export interface DashBoard {
  id: string
  name: string
  projectId: string
  color?: string
}
export interface DashColumn {
  id: string
  name: string
  boardId: string
}
export interface DashTask {
  id: string
  title: string
  columnId: string
  boardId?: string
  deadline?: number
  status?: { name?: string; color?: string } | null
  tags: { name: string; color?: string }[]
  createdAt: number
  updatedAt: number
}
export interface DashSubtask {
  taskId: string
  completed: boolean
}

export interface DashboardData {
  workspaces: DashWorkspace[]
  projects: DashProject[]
  boards: DashBoard[]
  columns: DashColumn[]
  tasks: DashTask[]
  subtasks: DashSubtask[]
}

/** A task joined with where it lives. */
export interface TaskEntry {
  task: DashTask
  board: DashBoard
  project: DashProject
  column?: DashColumn
  done: boolean
}

// ── Scope ─────────────────────────────────────────────────────────────

export type DashboardScope =
  /** Follow the workspace selected on the overview. */
  | { kind: 'overview' }
  | { kind: 'all' }
  | { kind: 'unassigned' }
  | { kind: 'workspace'; id: string }
  | { kind: 'project'; id: string }
  | { kind: 'board'; id: string }

/** The overview's own workspace filter. */
export type OverviewFilter = 'all' | 'unassigned' | string

export const resolveScope = (scope: DashboardScope, overview: OverviewFilter): DashboardScope => {
  if (scope.kind !== 'overview') return scope
  if (overview === 'all') return { kind: 'all' }
  if (overview === 'unassigned') return { kind: 'unassigned' }
  return { kind: 'workspace', id: overview }
}

/** Projects a scope covers; a workspace includes its sub-workspaces. */
export const projectsInScope = (
  data: DashboardData,
  scope: DashboardScope,
  overview: OverviewFilter = 'all'
): DashProject[] => {
  const resolved = resolveScope(scope, overview)
  switch (resolved.kind) {
    case 'all':
    case 'overview':
      return data.projects
    case 'unassigned': {
      const known = new Set(data.workspaces.map((workspace) => workspace.id))
      return data.projects.filter(
        (project) => !project.workspaceId || !known.has(project.workspaceId)
      )
    }
    case 'workspace': {
      const ids = workspaceWithDescendants(data.workspaces, resolved.id)
      return data.projects.filter(
        (project) => !!project.workspaceId && ids.has(project.workspaceId)
      )
    }
    case 'project':
      return data.projects.filter((project) => project.id === resolved.id)
    case 'board': {
      const board = data.boards.find((candidate) => candidate.id === resolved.id)
      return board ? data.projects.filter((project) => project.id === board.projectId) : []
    }
  }
}

// Status or column names that mean the work is finished.
const DONE_NAMES = new Set([
  'done',
  'complete',
  'completed',
  'closed',
  'resolved',
  'shipped',
  'released',
  'fixed',
  "won't fix",
  'wont fix'
])

const isDoneName = (name?: string): boolean =>
  !!name && DONE_NAMES.has(name.trim().toLowerCase().replace(/[‘’]/g, "'"))

/** Finished if its status or its column says so. */
export const isTaskDone = (task: DashTask, column?: DashColumn): boolean =>
  isDoneName(task.status?.name) || isDoneName(column?.name)

/** Every task the scope covers, with its board, project and column. */
export const tasksInScope = (
  data: DashboardData,
  scope: DashboardScope,
  overview: OverviewFilter = 'all'
): TaskEntry[] => {
  const resolved = resolveScope(scope, overview)
  const projects = new Map(projectsInScope(data, resolved).map((project) => [project.id, project]))
  const boards = new Map(
    data.boards
      .filter((board) => projects.has(board.projectId))
      .filter((board) => resolved.kind !== 'board' || board.id === resolved.id)
      .map((board) => [board.id, board])
  )
  const columns = new Map(data.columns.map((column) => [column.id, column]))
  const entries: TaskEntry[] = []
  for (const task of data.tasks) {
    const column = columns.get(task.columnId)
    const boardId = column?.boardId || task.boardId
    const board = boardId ? boards.get(boardId) : undefined
    if (!board) continue
    entries.push({
      task,
      board,
      project: projects.get(board.projectId)!,
      column,
      done: isTaskDone(task, column)
    })
  }
  return entries
}

// ── Aggregations ──────────────────────────────────────────────────────

const DAY = 24 * 60 * 60 * 1000

export interface Summary {
  total: number
  done: number
  open: number
  overdue: number
  dueSoon: number
  /** Whole percent, 0 when there are no tasks. */
  completion: number
  subtasksDone: number
  subtasksTotal: number
}

export const summarize = (
  entries: TaskEntry[],
  subtasks: DashSubtask[],
  now: number,
  soonDays = 7
): Summary => {
  const done = entries.filter((entry) => entry.done).length
  const open = entries.filter((entry) => !entry.done)
  const ids = new Set(entries.map((entry) => entry.task.id))
  const ownSubtasks = subtasks.filter((subtask) => ids.has(subtask.taskId))
  return {
    total: entries.length,
    done,
    open: open.length,
    overdue: open.filter((entry) => entry.task.deadline && entry.task.deadline < now).length,
    dueSoon: open.filter(
      (entry) =>
        entry.task.deadline &&
        entry.task.deadline >= now &&
        entry.task.deadline <= now + soonDays * DAY
    ).length,
    completion: entries.length ? Math.round((done / entries.length) * 100) : 0,
    subtasksDone: ownSubtasks.filter((subtask) => subtask.completed).length,
    subtasksTotal: ownSubtasks.length
  }
}

export interface CountRow {
  key: string
  label: string
  color?: string
  count: number
}

/** Tasks per status (or per column when a task has no real status). */
export const statusBreakdown = (entries: TaskEntry[]): CountRow[] => {
  const rows = new Map<string, CountRow>()
  for (const { task, column } of entries) {
    const name =
      task.status?.name && task.status.name !== 'Unspecified'
        ? task.status.name
        : column?.name || 'No status'
    const key = name.toLowerCase()
    const row = rows.get(key) || { key, label: name, color: task.status?.color, count: 0 }
    row.count++
    rows.set(key, row)
  }
  return [...rows.values()].sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))
}

/** Most used tags (by name, case-insensitive). */
export const tagCounts = (entries: TaskEntry[], limit = 12): CountRow[] => {
  const rows = new Map<string, CountRow>()
  for (const { task } of entries) {
    for (const tag of task.tags) {
      if (!tag?.name) continue
      const key = tag.name.toLowerCase()
      const row = rows.get(key) || { key, label: tag.name, color: tag.color, count: 0 }
      row.count++
      rows.set(key, row)
    }
  }
  return [...rows.values()]
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))
    .slice(0, limit)
}

/** Open tasks due within `days` (not yet overdue), soonest first. */
export const upcomingDeadlines = (
  entries: TaskEntry[],
  now: number,
  days: number,
  limit: number
): TaskEntry[] =>
  entries
    .filter(
      (entry) =>
        !entry.done &&
        entry.task.deadline !== undefined &&
        entry.task.deadline >= now &&
        entry.task.deadline <= now + days * DAY
    )
    .sort((a, b) => a.task.deadline! - b.task.deadline!)
    .slice(0, limit)

/** Open tasks past their deadline, most overdue first. */
export const overdueTasks = (entries: TaskEntry[], now: number, limit: number): TaskEntry[] =>
  entries
    .filter(
      (entry) => !entry.done && entry.task.deadline !== undefined && entry.task.deadline < now
    )
    .sort((a, b) => a.task.deadline! - b.task.deadline!)
    .slice(0, limit)

export const recentlyUpdated = (entries: TaskEntry[], limit: number): TaskEntry[] =>
  [...entries].sort((a, b) => b.task.updatedAt - a.task.updatedAt).slice(0, limit)

export interface ProgressRow {
  id: string
  label: string
  sublabel?: string
  color?: string
  done: number
  total: number
}

/** Done / total per project or per board, busiest first. */
export const progressBy = (entries: TaskEntry[], groupBy: 'project' | 'board'): ProgressRow[] => {
  const rows = new Map<string, ProgressRow>()
  for (const entry of entries) {
    const id = groupBy === 'project' ? entry.project.id : entry.board.id
    const row = rows.get(id) || {
      id,
      label: groupBy === 'project' ? entry.project.name : entry.board.name,
      sublabel: groupBy === 'board' ? entry.project.name : undefined,
      color: entry.board.color || entry.project.color,
      done: 0,
      total: 0
    }
    row.total++
    if (entry.done) row.done++
    rows.set(id, row)
  }
  return [...rows.values()].sort((a, b) => b.total - a.total || a.label.localeCompare(b.label))
}

/** Tasks created and finished (by last update) per day over the last `days`. */
export const activityByDay = (
  entries: TaskEntry[],
  now: number,
  days: number
): { day: number; created: number; completed: number }[] => {
  const end = new Date(now)
  end.setHours(0, 0, 0, 0)
  const start = end.getTime() - (days - 1) * DAY
  const buckets = Array.from({ length: days }, (_, index) => ({
    day: start + index * DAY,
    created: 0,
    completed: 0
  }))
  const indexOf = (time: number): number => {
    const date = new Date(time)
    date.setHours(0, 0, 0, 0)
    // Round to absorb daylight-saving shifts.
    return Math.round((date.getTime() - start) / DAY)
  }
  for (const entry of entries) {
    const created = indexOf(entry.task.createdAt)
    if (created >= 0 && created < days) buckets[created].created++
    if (entry.done) {
      const completed = indexOf(entry.task.updatedAt)
      if (completed >= 0 && completed < days) buckets[completed].completed++
    }
  }
  return buckets
}

/** Linked GitHub repositories of the projects in scope. */
export const reposInScope = (projects: DashProject[]): string[] => [
  ...new Set(projects.map((project) => project.githubRepo).filter((repo): repo is string => !!repo))
]

// ── Layout ────────────────────────────────────────────────────────────

export type WidgetKind =
  | 'summary'
  | 'status'
  | 'deadlines'
  | 'overdue'
  | 'recent'
  | 'tags'
  | 'progress'
  | 'activity'
  | 'github'

export type WidgetSize = 1 | 2 | 3

export interface WidgetConfig {
  id: string
  kind: WidgetKind
  /** Custom title; the kind's name is used when empty. */
  title?: string
  scope: DashboardScope
  size: WidgetSize
  /** Days ahead (deadlines) or back (activity). */
  days?: number
  /** Rows to list. */
  limit?: number
  groupBy?: 'project' | 'board'
  github?: 'pulls' | 'issues' | 'commits'
}

export const WIDGET_KINDS: {
  kind: WidgetKind
  label: string
  description: string
  defaults: Partial<WidgetConfig>
}[] = [
  {
    kind: 'summary',
    label: 'Summary',
    description: 'Totals: open, done, overdue, due soon and completion.',
    defaults: { size: 3 }
  },
  {
    kind: 'status',
    label: 'Status breakdown',
    description: 'How many tasks are in each status.',
    defaults: { size: 1 }
  },
  {
    kind: 'deadlines',
    label: 'Upcoming deadlines',
    description: 'Open tasks due in the next days.',
    defaults: { size: 1, days: 14, limit: 8 }
  },
  {
    kind: 'overdue',
    label: 'Overdue',
    description: 'Open tasks past their deadline.',
    defaults: { size: 1, limit: 8 }
  },
  {
    kind: 'recent',
    label: 'Recently updated',
    description: 'Tasks changed most recently.',
    defaults: { size: 1, limit: 8 }
  },
  {
    kind: 'tags',
    label: 'Tags',
    description: 'The most used tags.',
    defaults: { size: 1, limit: 12 }
  },
  {
    kind: 'progress',
    label: 'Progress',
    description: 'Done vs. total for each project or board.',
    defaults: { size: 2, groupBy: 'project', limit: 8 }
  },
  {
    kind: 'activity',
    label: 'Activity',
    description: 'Tasks created, and done tasks by the day they were last edited.',
    defaults: { size: 2, days: 14 }
  },
  {
    kind: 'github',
    label: 'GitHub',
    description: "Pull requests, issues or commits from the projects' linked repositories.",
    defaults: { size: 1, github: 'pulls', limit: 8 }
  }
]

export const widgetKindInfo = (kind: WidgetKind) =>
  WIDGET_KINDS.find((info) => info.kind === kind) || WIDGET_KINDS[0]

let idCounter = 0
const newWidgetId = (): string =>
  `w-${Date.now().toString(36)}-${(idCounter++).toString(36)}-${Math.random().toString(36).slice(2, 6)}`

export const createWidget = (kind: WidgetKind, scope: DashboardScope = { kind: 'overview' }) => {
  const info = widgetKindInfo(kind)
  return {
    size: 1 as WidgetSize,
    ...info.defaults,
    id: newWidgetId(),
    kind,
    scope
  } as WidgetConfig
}

export const DEFAULT_LAYOUT: WidgetConfig[] = [
  { id: 'default-summary', kind: 'summary', scope: { kind: 'overview' }, size: 3 },
  {
    id: 'default-deadlines',
    kind: 'deadlines',
    scope: { kind: 'overview' },
    size: 1,
    days: 14,
    limit: 8
  },
  { id: 'default-overdue', kind: 'overdue', scope: { kind: 'overview' }, size: 1, limit: 8 },
  { id: 'default-status', kind: 'status', scope: { kind: 'overview' }, size: 1 },
  {
    id: 'default-progress',
    kind: 'progress',
    scope: { kind: 'overview' },
    size: 2,
    groupBy: 'project',
    limit: 8
  },
  { id: 'default-recent', kind: 'recent', scope: { kind: 'overview' }, size: 1, limit: 8 }
]

const clampInt = (value: unknown, min: number, max: number): number | undefined =>
  typeof value === 'number' && Number.isFinite(value)
    ? Math.min(max, Math.max(min, Math.round(value)))
    : undefined

const parseScope = (value: unknown): DashboardScope => {
  const raw = (value || {}) as Record<string, unknown>
  if (raw.kind === 'all' || raw.kind === 'unassigned') return { kind: raw.kind }
  if (
    (raw.kind === 'workspace' || raw.kind === 'project' || raw.kind === 'board') &&
    typeof raw.id === 'string' &&
    raw.id
  )
    return { kind: raw.kind, id: raw.id }
  return { kind: 'overview' }
}

/** Validates a stored layout; anything unusable is dropped. */
export const parseLayout = (stored: string | null): WidgetConfig[] => {
  if (!stored) return DEFAULT_LAYOUT
  let raw: unknown
  try {
    raw = JSON.parse(stored)
  } catch {
    return DEFAULT_LAYOUT
  }
  if (!Array.isArray(raw)) return DEFAULT_LAYOUT
  const seen = new Set<string>()
  const widgets: WidgetConfig[] = []
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue
    const kind = (item as any).kind
    if (!WIDGET_KINDS.some((info) => info.kind === kind)) continue
    let id = typeof (item as any).id === 'string' && (item as any).id ? (item as any).id : ''
    if (!id || seen.has(id)) id = newWidgetId()
    seen.add(id)
    const groupBy = (item as any).groupBy
    const github = (item as any).github
    widgets.push({
      id,
      kind,
      title: typeof (item as any).title === 'string' ? (item as any).title.slice(0, 80) : undefined,
      scope: parseScope((item as any).scope),
      size: (clampInt((item as any).size, 1, 3) || 1) as WidgetSize,
      days: clampInt((item as any).days, 1, 365),
      limit: clampInt((item as any).limit, 1, 50),
      groupBy: groupBy === 'board' || groupBy === 'project' ? groupBy : undefined,
      github: github === 'pulls' || github === 'issues' || github === 'commits' ? github : undefined
    })
  }
  // An empty array is a deliberate "no widgets" choice and is kept.
  return widgets
}
