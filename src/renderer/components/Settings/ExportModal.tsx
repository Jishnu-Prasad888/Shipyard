import React, { useEffect, useRef, useState } from 'react'
import {
  CheckCircle,
  CheckSquare,
  ChevronDown,
  ChevronRight,
  Columns3,
  Download,
  FileCode,
  FileJson,
  FileText,
  Folder,
  FolderKanban,
  KanbanSquare,
  Loader,
  X,
  XCircle
} from 'lucide-react'
import {
  buildExportContent,
  ExportData,
  ExportFormat,
  ExportSchema,
  ProjectExportRecord,
  BoardExportRecord,
  ColumnExportRecord,
  TaskExportRecord,
  WorkspaceExportRecord
} from '../../lib/export'

interface ExportModalProps {
  onClose: () => void
}

type Check = 'all' | 'none' | 'partial'
type Selection = Record<string, boolean>

const slugify = (value: string): string => value.replace(/[^a-z0-9]/gi, '_').toLowerCase()
const selectionFor = (rows: Array<{ id: string }>, selected: boolean): Selection =>
  Object.fromEntries(rows.map((row) => [row.id, selected]))

const childCheck = (states: Check[], fallback: boolean): Check => {
  if (!states.length) return fallback ? 'all' : 'none'
  if (states.every((state) => state === 'all')) return 'all'
  if (states.every((state) => state === 'none')) return 'none'
  return 'partial'
}

const TriCheck: React.FC<{
  state: Check
  onChange: () => void
  label: React.ReactNode
  indent?: number
  color?: string
  expanded?: boolean
  onToggleExpand?: () => void
  count?: string
  icon?: React.ReactNode
}> = ({ state, onChange, label, indent = 0, color, expanded, onToggleExpand, count, icon }) => {
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!inputRef.current) return
    inputRef.current.indeterminate = state === 'partial'
    inputRef.current.checked = state === 'all'
  }, [state])

  return (
    <div
      className="flex items-center gap-2 px-2 py-1.5 rounded transition-all"
      style={{ paddingLeft: `${8 + indent * 16}px` }}
    >
      {onToggleExpand ? (
        <button
          onClick={onToggleExpand}
          className="w-4 h-4 flex items-center justify-center shrink-0"
          style={{ color: 'var(--color-muted)' }}
        >
          {expanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
        </button>
      ) : (
        <span className="w-4 shrink-0" />
      )}
      <input
        ref={inputRef}
        type="checkbox"
        className="w-3.5 h-3.5 shrink-0 cursor-pointer"
        style={{ accentColor: color || 'var(--color-primary)' }}
        onChange={onChange}
      />
      {color ? (
        <span
          className="w-2.5 h-2.5 border shrink-0"
          style={{ background: color, borderColor: 'var(--color-border-strong)' }}
        />
      ) : (
        icon
      )}
      <span className="text-xs font-bold flex-1 truncate" style={{ color: 'var(--color-text)' }}>
        {label}
      </span>
      {count && (
        <span
          className="text-[10px] font-black px-1.5 py-0.5 shrink-0"
          style={{
            color: 'var(--color-muted)',
            background: 'var(--color-background)',
            border: '1px solid var(--color-border)'
          }}
        >
          {count}
        </span>
      )}
    </div>
  )
}

export const ExportModal: React.FC<ExportModalProps> = ({ onClose }) => {
  const [data, setData] = useState<ExportData>({
    workspaces: [],
    projects: [],
    boards: [],
    columns: [],
    tasks: [],
    subtasks: [],
    statuses: [],
    connections: [],
    tags: []
  })
  const [selectedWorkspaces, setSelectedWorkspaces] = useState<Selection>({})
  const [selectedProjects, setSelectedProjects] = useState<Selection>({})
  const [selectedBoards, setSelectedBoards] = useState<Selection>({})
  const [selectedColumns, setSelectedColumns] = useState<Selection>({})
  const [selectedTasks, setSelectedTasks] = useState<Selection>({})
  const [expandedWorkspaces, setExpandedWorkspaces] = useState<Selection>({})
  const [expandedProjects, setExpandedProjects] = useState<Selection>({})
  const [expandedBoards, setExpandedBoards] = useState<Selection>({})
  const [expandedColumns, setExpandedColumns] = useState<Selection>({})
  const [format, setFormat] = useState<ExportFormat>('json')
  const [schemaVersion, setSchemaVersion] = useState<ExportSchema>(2)
  const [splitPerProject, setSplitPerProject] = useState(false)
  const [loading, setLoading] = useState(true)
  const [exporting, setExporting] = useState(false)
  const [result, setResult] = useState<{ ok: boolean; message: string; path?: string } | null>(null)

  useEffect(() => {
    let active = true
    void Promise.all([
      window.electron.db.findAll('workspaces'),
      window.electron.db.findAll('projects'),
      window.electron.db.findAll('boards'),
      window.electron.db.findAll('columns'),
      window.electron.db.findAll('tasks'),
      window.electron.db.findAll('subtasks'),
      window.electron.db.findAll('statuses'),
      window.electron.db.findAll('connections'),
      window.electron.db.findAll('tags')
    ]).then(
      ([workspaces, projects, boards, columns, tasks, subtasks, statuses, connections, tags]) => {
        if (!active) return
        setData({
          workspaces,
          projects,
          boards,
          columns,
          tasks,
          subtasks,
          statuses,
          connections,
          tags
        })
        setSelectedWorkspaces(selectionFor(workspaces, true))
        setSelectedProjects(selectionFor(projects, true))
        setSelectedBoards(selectionFor(boards, true))
        setSelectedColumns(selectionFor(columns, true))
        setSelectedTasks(selectionFor(tasks, true))
        setExpandedWorkspaces(selectionFor(workspaces, true))
        setExpandedProjects(selectionFor(projects, true))
        setExpandedBoards(selectionFor(boards, true))
        setExpandedColumns(selectionFor(columns, true))
        setLoading(false)
      }
    )
    return () => {
      active = false
    }
  }, [])

  const projectsForWorkspace = (workspaceId: string | null): ProjectExportRecord[] =>
    data.projects.filter((project) =>
      workspaceId ? project.workspaceId === workspaceId : !project.workspaceId
    )
  const boardsForProject = (projectId: string): BoardExportRecord[] =>
    data.boards.filter((board) => board.projectId === projectId)
  const columnsForBoard = (boardId: string): ColumnExportRecord[] =>
    data.columns.filter((column) => column.boardId === boardId)
  const tasksForColumn = (columnId: string): TaskExportRecord[] =>
    data.tasks.filter((task) => task.columnId === columnId)

  const columnCheck = (columnId: string): Check =>
    childCheck(
      tasksForColumn(columnId).map((task) => (selectedTasks[task.id] ? 'all' : 'none')),
      !!selectedColumns[columnId]
    )
  const boardCheck = (boardId: string): Check =>
    childCheck(
      columnsForBoard(boardId).map((column) => columnCheck(column.id)),
      !!selectedBoards[boardId]
    )
  const projectCheck = (projectId: string): Check =>
    childCheck(
      boardsForProject(projectId).map((board) => boardCheck(board.id)),
      !!selectedProjects[projectId]
    )

  const descendantWorkspaces = (workspaceId: string): WorkspaceExportRecord[] => {
    const children = data.workspaces.filter(
      (workspace) => workspace.parentWorkspaceId === workspaceId
    )
    return children.flatMap((workspace) => [workspace, ...descendantWorkspaces(workspace.id)])
  }

  const workspaceCheck = (workspaceId: string): Check => {
    const projectStates = projectsForWorkspace(workspaceId).map((project) =>
      projectCheck(project.id)
    )
    const childStates = data.workspaces
      .filter((workspace) => workspace.parentWorkspaceId === workspaceId)
      .map((workspace) => workspaceCheck(workspace.id))
    return childCheck([...projectStates, ...childStates], !!selectedWorkspaces[workspaceId])
  }

  const setColumnValue = (columnId: string, value: boolean): void => {
    setSelectedColumns((previous) => ({ ...previous, [columnId]: value }))
    setSelectedTasks((previous) => ({
      ...previous,
      ...Object.fromEntries(tasksForColumn(columnId).map((task) => [task.id, value]))
    }))
  }

  const setBoardValue = (boardId: string, value: boolean): void => {
    setSelectedBoards((previous) => ({ ...previous, [boardId]: value }))
    const columns = columnsForBoard(boardId)
    setSelectedColumns((previous) => ({
      ...previous,
      ...Object.fromEntries(columns.map((column) => [column.id, value]))
    }))
    const columnIds = new Set(columns.map((column) => column.id))
    setSelectedTasks((previous) => ({
      ...previous,
      ...Object.fromEntries(
        data.tasks.filter((task) => columnIds.has(task.columnId)).map((task) => [task.id, value])
      )
    }))
  }

  const setProjectValue = (projectId: string, value: boolean): void => {
    setSelectedProjects((previous) => ({ ...previous, [projectId]: value }))
    const boards = boardsForProject(projectId)
    const boardIds = new Set(boards.map((board) => board.id))
    const columns = data.columns.filter((column) => boardIds.has(column.boardId))
    const columnIds = new Set(columns.map((column) => column.id))
    setSelectedBoards((previous) => ({
      ...previous,
      ...Object.fromEntries(boards.map((board) => [board.id, value]))
    }))
    setSelectedColumns((previous) => ({
      ...previous,
      ...Object.fromEntries(columns.map((column) => [column.id, value]))
    }))
    setSelectedTasks((previous) => ({
      ...previous,
      ...Object.fromEntries(
        data.tasks.filter((task) => columnIds.has(task.columnId)).map((task) => [task.id, value])
      )
    }))
  }

  const setWorkspaceValue = (workspaceId: string, value: boolean): void => {
    const workspaces = [
      data.workspaces.find((workspace) => workspace.id === workspaceId),
      ...descendantWorkspaces(workspaceId)
    ].filter((workspace): workspace is WorkspaceExportRecord => Boolean(workspace))
    const workspaceIds = new Set(workspaces.map((workspace) => workspace.id))
    const projects = data.projects.filter(
      (project) => !!project.workspaceId && workspaceIds.has(project.workspaceId)
    )
    setSelectedWorkspaces((previous) => ({
      ...previous,
      ...Object.fromEntries(workspaces.map((workspace) => [workspace.id, value]))
    }))
    projects.forEach((project) => setProjectValue(project.id, value))
  }

  const selectAll = (value: boolean): void => {
    setSelectedWorkspaces(selectionFor(data.workspaces, value))
    setSelectedProjects(selectionFor(data.projects, value))
    setSelectedBoards(selectionFor(data.boards, value))
    setSelectedColumns(selectionFor(data.columns, value))
    setSelectedTasks(selectionFor(data.tasks, value))
  }

  const overallCheck = (): Check =>
    childCheck(
      [
        ...data.workspaces
          .filter((workspace) => !workspace.parentWorkspaceId)
          .map((workspace) => workspaceCheck(workspace.id)),
        ...projectsForWorkspace(null).map((project) => projectCheck(project.id))
      ],
      false
    )

  const selectData = (allowedProjectIds?: Set<string>): ExportData => {
    const projects = data.projects.filter(
      (project) =>
        (!allowedProjectIds || allowedProjectIds.has(project.id)) &&
        projectCheck(project.id) !== 'none'
    )
    const projectIds = new Set(projects.map((project) => project.id))
    const boards = data.boards.filter(
      (board) => projectIds.has(board.projectId) && boardCheck(board.id) !== 'none'
    )
    const boardIds = new Set(boards.map((board) => board.id))
    const columns = data.columns.filter(
      (column) => boardIds.has(column.boardId) && columnCheck(column.id) !== 'none'
    )
    const columnIds = new Set(columns.map((column) => column.id))
    const tasks = data.tasks.filter(
      (task) => columnIds.has(task.columnId) && selectedTasks[task.id]
    )
    const taskIds = new Set(tasks.map((task) => task.id))
    const subtasks = data.subtasks.filter((subtask) => taskIds.has(subtask.taskId))
    const workspaceIds = new Set<string>()
    const includeWorkspaceAncestors = (workspaceId?: string | null): void => {
      if (!workspaceId || workspaceIds.has(workspaceId)) return
      workspaceIds.add(workspaceId)
      includeWorkspaceAncestors(
        data.workspaces.find((workspace) => workspace.id === workspaceId)?.parentWorkspaceId
      )
    }
    projects.forEach((project) => includeWorkspaceAncestors(project.workspaceId))
    if (!allowedProjectIds) {
      data.workspaces
        .filter(
          (workspace) => selectedWorkspaces[workspace.id] && workspaceCheck(workspace.id) !== 'none'
        )
        .forEach((workspace) => includeWorkspaceAncestors(workspace.id))
    }

    return {
      workspaces: data.workspaces.filter((workspace) => workspaceIds.has(workspace.id)),
      projects: projects.map((project) => ({
        ...project,
        boardIds: boards.filter((board) => board.projectId === project.id).map((board) => board.id)
      })),
      boards,
      columns,
      tasks: tasks.map((task) => ({
        ...task,
        connectedTaskIds: parseIds(task.connectedTaskIds).filter((id) => taskIds.has(id)),
        connectedColumnIds: parseIds(task.connectedColumnIds).filter((id) => columnIds.has(id)),
        subtasks: subtasks.filter((subtask) => subtask.taskId === task.id)
      })),
      subtasks,
      statuses: data.statuses.filter((status) => boardIds.has(status.boardId)),
      connections: data.connections.filter(
        (connection) =>
          boardIds.has(connection.boardId) &&
          ((connection.type === 'task-to-task' &&
            taskIds.has(connection.fromId) &&
            taskIds.has(connection.toId)) ||
            (connection.type === 'column-to-column' &&
              columnIds.has(connection.fromId) &&
              columnIds.has(connection.toId)))
      ),
      tags: data.tags
    }
  }

  const handleExport = async (): Promise<void> => {
    const projectIds = new Set(
      data.projects
        .filter((project) => projectCheck(project.id) !== 'none')
        .map((project) => project.id)
    )
    if (!projectIds.size) return
    setExporting(true)
    setResult(null)
    try {
      if (splitPerProject) {
        const files = data.projects
          .filter((project) => projectIds.has(project.id))
          .map((project) => ({
            name: `shipyard-${slugify(project.name)}`,
            ext: format,
            content: buildExportContent(selectData(new Set([project.id])), format, schemaVersion)
          }))
        const response = await window.electron.export.saveFolder(files)
        if (response?.success) {
          setResult({
            ok: true,
            message: `Exported ${response.count} project file(s) to ${response.folder}`,
            path: response.folder
          })
        } else if (response?.error) {
          setResult({ ok: false, message: response.error })
        }
      } else {
        const response = await window.electron.export.saveFile({
          defaultName: schemaVersion === 2 ? 'shipyard-export' : 'shipyard-export-legacy-v1',
          content: buildExportContent(selectData(), format, schemaVersion),
          ext: format
        })
        if (response?.success) {
          setResult({ ok: true, message: `Saved to ${response.filePath}`, path: response.filePath })
        } else if (response?.error) {
          setResult({ ok: false, message: response.error })
        }
      }
    } catch (error) {
      setResult({ ok: false, message: error instanceof Error ? error.message : 'Export failed' })
    } finally {
      setExporting(false)
    }
  }

  const selectedProjectCount = data.projects.filter(
    (project) => projectCheck(project.id) !== 'none'
  ).length
  const selectedBoardCount = data.boards.filter((board) => boardCheck(board.id) !== 'none').length
  const selectedColumnCount = data.columns.filter(
    (column) => columnCheck(column.id) !== 'none'
  ).length
  const selectedTaskCount = data.tasks.filter((task) => selectedTasks[task.id]).length

  const renderProject = (project: ProjectExportRecord, indent: number): React.ReactNode => {
    const boards = boardsForProject(project.id)
    const isExpanded = !!expandedProjects[project.id]
    return (
      <div key={project.id}>
        <TriCheck
          state={projectCheck(project.id)}
          onChange={() => setProjectValue(project.id, projectCheck(project.id) !== 'all')}
          label={project.name}
          color={project.color}
          indent={indent}
          expanded={isExpanded}
          onToggleExpand={() =>
            setExpandedProjects((previous) => ({ ...previous, [project.id]: !isExpanded }))
          }
          count={`${boards.length} boards`}
        />
        {isExpanded &&
          boards.map((board) => {
            const columns = columnsForBoard(board.id)
            const boardExpanded = !!expandedBoards[board.id]
            return (
              <div key={board.id}>
                <TriCheck
                  state={boardCheck(board.id)}
                  onChange={() => setBoardValue(board.id, boardCheck(board.id) !== 'all')}
                  label={board.name}
                  indent={indent + 1}
                  icon={<KanbanSquare className="w-3 h-3" />}
                  expanded={boardExpanded}
                  onToggleExpand={() =>
                    setExpandedBoards((previous) => ({ ...previous, [board.id]: !boardExpanded }))
                  }
                  count={`${columns.length} columns`}
                />
                {boardExpanded &&
                  columns.map((column) => {
                    const tasks = tasksForColumn(column.id)
                    const columnExpanded = !!expandedColumns[column.id]
                    return (
                      <div key={column.id}>
                        <TriCheck
                          state={columnCheck(column.id)}
                          onChange={() =>
                            setColumnValue(column.id, columnCheck(column.id) !== 'all')
                          }
                          label={column.name}
                          indent={indent + 2}
                          icon={<Columns3 className="w-3 h-3" />}
                          expanded={columnExpanded}
                          onToggleExpand={() =>
                            setExpandedColumns((previous) => ({
                              ...previous,
                              [column.id]: !columnExpanded
                            }))
                          }
                          count={`${tasks.length} tasks`}
                        />
                        {columnExpanded &&
                          tasks.map((task) => (
                            <TriCheck
                              key={task.id}
                              state={selectedTasks[task.id] ? 'all' : 'none'}
                              onChange={() =>
                                setSelectedTasks((previous) => ({
                                  ...previous,
                                  [task.id]: !previous[task.id]
                                }))
                              }
                              label={task.title}
                              indent={indent + 3}
                              icon={<CheckSquare className="w-3 h-3" />}
                            />
                          ))}
                      </div>
                    )
                  })}
              </div>
            )
          })}
      </div>
    )
  }

  const renderWorkspaces = (parentWorkspaceId: string | null = null, indent = 0): React.ReactNode =>
    data.workspaces
      .filter((workspace) => (workspace.parentWorkspaceId || null) === parentWorkspaceId)
      .map((workspace) => {
        const projects = projectsForWorkspace(workspace.id)
        const isExpanded = !!expandedWorkspaces[workspace.id]
        const childCount = data.workspaces.filter(
          (child) => child.parentWorkspaceId === workspace.id
        ).length
        return (
          <div key={workspace.id}>
            <TriCheck
              state={workspaceCheck(workspace.id)}
              onChange={() =>
                setWorkspaceValue(workspace.id, workspaceCheck(workspace.id) !== 'all')
              }
              label={<span className="font-black">{workspace.name}</span>}
              color={workspace.color}
              indent={indent}
              expanded={isExpanded}
              onToggleExpand={() =>
                setExpandedWorkspaces((previous) => ({ ...previous, [workspace.id]: !isExpanded }))
              }
              count={`${projects.length} projects`}
            />
            {isExpanded && (
              <>
                {renderWorkspaces(workspace.id, indent + 1)}
                {projects.map((project) => renderProject(project, indent + 1))}
                {!childCount && !projects.length && (
                  <p className="px-8 py-1 text-[10px] font-bold uppercase text-muted">Empty</p>
                )}
              </>
            )}
          </div>
        )
      })

  const unassignedProjects = projectsForWorkspace(null)

  return (
    <div
      className="fixed inset-0 bg-black/70 flex items-center justify-center z-[55]"
      onClick={onClose}
    >
      <div
        className="w-full max-w-4xl max-h-[90vh] flex flex-col animate-brutal-in"
        onClick={(event) => event.stopPropagation()}
        style={{
          background: 'var(--color-surface)',
          border: '4px solid var(--color-border-strong)',
          boxShadow: 'var(--shadow-brutal-lg)'
        }}
      >
        <div
          className="flex items-center justify-between px-5 py-3 border-b-4 shrink-0"
          style={{ background: 'var(--color-primary)', borderColor: 'var(--color-border-strong)' }}
        >
          <h2 className="flex items-center gap-2 text-base font-black text-white uppercase tracking-wider">
            <Download className="w-4 h-4" /> Export Data
          </h2>
          <button
            onClick={onClose}
            className="w-7 h-7 border-2 border-white text-white flex items-center justify-center"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex flex-1 overflow-hidden">
          <div
            className="flex-1 overflow-auto border-r-2 flex flex-col"
            style={{ borderColor: 'var(--color-border)' }}
          >
            <div
              className="flex items-center justify-between px-3 py-2 border-b-2 shrink-0"
              style={{ borderColor: 'var(--color-border)', background: 'var(--color-background)' }}
            >
              <TriCheck
                state={overallCheck()}
                onChange={() => selectAll(overallCheck() !== 'all')}
                label={
                  <span className="font-black uppercase tracking-widest text-[10px]">
                    Select All
                  </span>
                }
              />
              <div
                className="flex gap-2 text-[10px] font-black uppercase"
                style={{ color: 'var(--color-muted)' }}
              >
                <span>{selectedProjectCount} projects</span>
                <span>{selectedBoardCount} boards</span>
                <span>{selectedColumnCount} columns</span>
                <span>{selectedTaskCount} tasks</span>
              </div>
            </div>
            {loading ? (
              <div className="flex-1 flex items-center justify-center">
                <Loader className="w-6 h-6 animate-spin" />
              </div>
            ) : (
              <div className="flex-1 overflow-auto py-1">
                {renderWorkspaces()}
                <div className="mt-2">
                  <div
                    className="flex items-center gap-2 px-3 py-1"
                    style={{ color: 'var(--color-muted)' }}
                  >
                    <FolderKanban className="w-3 h-3" />
                    <span className="text-[10px] font-black uppercase tracking-widest">
                      Unassigned Projects
                    </span>
                  </div>
                  {unassignedProjects.length ? (
                    unassignedProjects.map((project) => renderProject(project, 1))
                  ) : (
                    <p className="px-8 py-1 text-[10px] font-bold uppercase text-muted">
                      No unassigned projects
                    </p>
                  )}
                </div>
              </div>
            )}
          </div>

          <div
            className="w-60 shrink-0 flex flex-col overflow-auto p-4 space-y-5"
            style={{ background: 'var(--color-background)' }}
          >
            <div>
              <p className="text-[9px] font-black uppercase tracking-widest mb-2">Format</p>
              {(
                [
                  ['json', FileJson, 'JSON'],
                  ['csv', FileText, 'CSV'],
                  ['md', FileCode, 'Markdown']
                ] as const
              ).map(([value, Icon, label]) => (
                <button
                  key={value}
                  onClick={() => setFormat(value)}
                  className="w-full flex items-center gap-2 px-3 py-2 mb-1 border-2 text-xs font-black uppercase"
                  style={{
                    borderColor: format === value ? 'var(--color-primary)' : 'var(--color-border)',
                    color: format === value ? 'var(--color-primary)' : 'var(--color-text)'
                  }}
                >
                  <Icon className="w-3.5 h-3.5" /> {label}
                </button>
              ))}
            </div>
            <div>
              <p className="text-[9px] font-black uppercase tracking-widest mb-2">Schema</p>
              <select
                value={schemaVersion}
                onChange={(event) => setSchemaVersion(Number(event.target.value) as ExportSchema)}
                className="w-full border-2 px-2 py-2 text-xs font-bold"
              >
                <option value={2}>Canonical v2</option>
                <option value={1}>Legacy v1</option>
              </select>
            </div>
            <label className="flex items-start gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={splitPerProject}
                onChange={(event) => setSplitPerProject(event.target.checked)}
              />
              <span className="text-xs font-black">
                Split per project
                <small className="block text-muted font-bold">One shipyard file per project</small>
              </span>
            </label>
            <div
              className="border-t-2 pt-3 space-y-1 text-[10px] font-bold"
              style={{ borderColor: 'var(--color-border)' }}
            >
              <p className="font-black uppercase">Will export</p>
              <p>
                <Folder className="w-3 h-3 inline mr-1" />
                {selectedProjectCount} Projects
              </p>
              <p>
                <KanbanSquare className="w-3 h-3 inline mr-1" />
                {selectedBoardCount} Boards
              </p>
              <p>
                <Columns3 className="w-3 h-3 inline mr-1" />
                {selectedColumnCount} Columns
              </p>
              <p>
                <CheckSquare className="w-3 h-3 inline mr-1" />
                {selectedTaskCount} Tasks
              </p>
            </div>
            <button
              onClick={handleExport}
              disabled={exporting || selectedProjectCount === 0}
              className="btn-primary w-full text-xs disabled:opacity-40 mt-auto"
            >
              {exporting ? (
                <Loader className="w-4 h-4 animate-spin" />
              ) : (
                <Download className="w-4 h-4" />
              )}
              {exporting ? 'Exporting...' : 'Export'}
            </button>
            {result && (
              <div
                className="p-3 border-2 text-[10px] font-bold"
                style={{ color: result.ok ? '#059669' : '#dc2626' }}
              >
                <div className="flex items-start gap-1.5">
                  {result.ok ? (
                    <CheckCircle className="w-3.5 h-3.5" />
                  ) : (
                    <XCircle className="w-3.5 h-3.5" />
                  )}
                  <span className="break-all">{result.message}</span>
                </div>
                {result.ok && result.path && (
                  <button
                    onClick={() => window.electron.export.openItem(result.path!)}
                    className="mt-2 underline font-black uppercase"
                  >
                    Open {splitPerProject ? 'Folder' : 'File'}
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

const parseIds = (value: unknown): string[] => {
  if (Array.isArray(value)) return value.map(String)
  if (typeof value !== 'string') return []
  try {
    const parsed = JSON.parse(value)
    return Array.isArray(parsed) ? parsed.map(String) : []
  } catch {
    return []
  }
}
