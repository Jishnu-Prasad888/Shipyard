export type ExportFormat = 'json' | 'csv' | 'md'
export type ExportSchema = 1 | 2

export type ExportRecord = Record<string, unknown>

export interface WorkspaceExportRecord extends ExportRecord {
  id: string
  name: string
  color?: string
  parentWorkspaceId?: string
}

export interface ProjectExportRecord extends ExportRecord {
  id: string
  name: string
  color?: string
  workspaceId?: string
  boardIds?: unknown
  tags?: unknown
}

export interface BoardExportRecord extends ExportRecord {
  id: string
  name: string
  projectId: string
  tags?: unknown
  columns?: unknown
}

export interface ColumnExportRecord extends ExportRecord {
  id: string
  name: string
  boardId: string
  tasks?: unknown
}

export interface TaskExportRecord extends ExportRecord {
  id: string
  title: string
  columnId: string
  boardId?: string
  tags?: unknown
  status?: unknown
  connectedTaskIds?: unknown
  connectedColumnIds?: unknown
  subtasks?: unknown
}

export interface SubtaskExportRecord extends ExportRecord {
  id: string
  taskId: string
}

export interface StatusExportRecord extends ExportRecord {
  id: string
  boardId: string
}

export interface ConnectionExportRecord extends ExportRecord {
  id: string
  boardId: string
  fromId: string
  toId: string
  type: string
}

export interface TagExportRecord extends ExportRecord {
  id: string
}

export interface ExportData {
  workspaces: WorkspaceExportRecord[]
  projects: ProjectExportRecord[]
  boards: BoardExportRecord[]
  columns: ColumnExportRecord[]
  tasks: TaskExportRecord[]
  subtasks: SubtaskExportRecord[]
  statuses: StatusExportRecord[]
  connections: ConnectionExportRecord[]
  tags: TagExportRecord[]
}

const parseArray = (value: unknown): unknown[] => {
  if (Array.isArray(value)) return value
  if (typeof value !== 'string') return []
  try {
    const parsed = JSON.parse(value)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

const parseJson = (value: unknown): unknown => {
  if (typeof value !== 'string') return value
  try {
    return JSON.parse(value)
  } catch {
    return value
  }
}

const canonicalTask = (task: TaskExportRecord): TaskExportRecord => ({
  ...task,
  tags: parseArray(task.tags),
  status: parseJson(task.status),
  connectedTaskIds: parseArray(task.connectedTaskIds),
  connectedColumnIds: parseArray(task.connectedColumnIds),
  subtasks: parseArray(task.subtasks)
})

const canonicalProject = (project: ProjectExportRecord): ProjectExportRecord => ({
  ...project,
  tags: parseArray(project.tags),
  boardIds: parseArray(project.boardIds)
})

export const canonicalExportData = (data: ExportData): ExportData => ({
  workspaces: data.workspaces.map((item) => ({ ...item })),
  projects: data.projects.map(canonicalProject),
  boards: data.boards.map((item) => ({ ...item, tags: parseArray(item.tags) })),
  columns: data.columns.map((item) => ({ ...item })),
  tasks: data.tasks.map(canonicalTask),
  subtasks: data.subtasks.map((item) => ({ ...item })),
  statuses: data.statuses.map((item) => ({ ...item })),
  connections: data.connections.map((item) => ({ ...item })),
  tags: data.tags.map((item) => ({ ...item }))
})

export const toLegacyExportData = (data: ExportData): Record<string, ExportRecord[]> => ({
  folders: data.workspaces.map(({ parentWorkspaceId, ...workspace }) => ({
    ...workspace,
    parentId: parentWorkspaceId
  })),
  docks: data.projects.map(({ workspaceId, ...project }) => ({
    ...project,
    folderId: workspaceId
  })),
  boards: data.boards.map(({ projectId, columns, ...board }) => ({
    ...board,
    dockId: projectId,
    ...(columns === undefined ? {} : { lists: columns })
  })),
  lists: data.columns.map(({ tasks, ...column }) => ({
    ...column,
    ...(tasks === undefined ? {} : { cards: tasks })
  })),
  cards: data.tasks.map(
    ({ columnId, connectedTaskIds, connectedColumnIds, subtasks, ...task }) => ({
      ...task,
      listId: columnId,
      connectedCardIds: connectedTaskIds,
      connectedListIds: connectedColumnIds,
      subCards: subtasks
    })
  ),
  subcards: data.subtasks.map(({ taskId, ...subtask }) => ({ ...subtask, cardId: taskId })),
  statuses: data.statuses,
  connections: data.connections.map((connection) => ({
    ...connection,
    type:
      connection.type === 'task-to-task'
        ? 'card-to-card'
        : connection.type === 'column-to-column'
          ? 'list-to-list'
          : connection.type
  })),
  tags: data.tags
})

const csvValue = (value: unknown): string => {
  const stringValue =
    value == null ? '' : typeof value === 'object' ? JSON.stringify(value) : String(value)
  return /[",\n]/.test(stringValue) ? `"${stringValue.replace(/"/g, '""')}"` : stringValue
}

const toCsv = (rows: ExportRecord[]): string => {
  if (!rows.length) return ''
  const keys = Array.from(new Set(rows.flatMap((row) => Object.keys(row))))
  return [
    keys.join(','),
    ...rows.map((row) => keys.map((key) => csvValue(row[key])).join(','))
  ].join('\n')
}

const toMarkdown = (label: string, rows: ExportRecord[]): string => {
  if (!rows.length) return `## ${label}\n_No data_\n`
  const keys = Array.from(new Set(rows.flatMap((row) => Object.keys(row))))
  const value = (item: unknown): string =>
    String(item == null ? '' : typeof item === 'object' ? JSON.stringify(item) : item).replace(
      /\|/g,
      '\\|'
    )
  return (
    [
      `## ${label}`,
      `| ${keys.join(' | ')} |`,
      `| ${keys.map(() => '---').join(' | ')} |`,
      ...rows.map((row) => `| ${keys.map((key) => value(row[key])).join(' | ')} |`)
    ].join('\n') + '\n'
  )
}

export const buildExportContent = (
  input: ExportData,
  format: ExportFormat,
  schemaVersion: ExportSchema = 2
): string => {
  const canonical = canonicalExportData(input)
  const arrays = schemaVersion === 2 ? canonical : toLegacyExportData(canonical)
  const payload =
    schemaVersion === 2
      ? {
          $schema: 'shipyard-export',
          schemaVersion: 2,
          product: 'Shipyard',
          exportedAt: new Date().toISOString(),
          ...arrays
        }
      : { schemaVersion: 1, ...arrays }
  if (format === 'json') return JSON.stringify(payload, null, 2)

  const sections = Object.entries(arrays)
  if (format === 'csv') {
    return sections.map(([label, rows]) => `# ${label.toUpperCase()}\n${toCsv(rows)}`).join('\n\n')
  }
  return sections
    .map(([label, rows]) => toMarkdown(label[0].toUpperCase() + label.slice(1), rows))
    .join('\n')
}
