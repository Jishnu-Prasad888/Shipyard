import React, { useEffect, useRef, useState } from 'react'
import {
  Calendar,
  ChevronDown,
  ChevronRight,
  Edit2,
  Folder,
  FolderKanban,
  Home,
  KanbanSquare,
  Palette,
  Plus,
  Trash2,
  X
} from 'lucide-react'
import {
  DndContext,
  DragEndEvent,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors
} from '@dnd-kit/core'
import { ProjectModal } from '../Projects/ProjectModal'

interface SidebarProps {
  onSelectProject: (projectId: string) => void
  selectedProjectId: string | null
  onSelectBoard: (boardId: string) => void
  selectedBoardId: string | null
  onGoHome: () => void
  isHome: boolean
  onOpenCalendar: () => void
  isCalendar: boolean
  searchQuery?: string
  onDataChange?: () => void
}

type MenuTarget = {
  x: number
  y: number
  type: 'workspace' | 'project' | 'unassigned'
  id: string | null
}

const COLORS = [
  '#2563eb',
  '#0891b2',
  '#7c3aed',
  '#059669',
  '#d97706',
  '#dc2626',
  '#db2777',
  '#0f172a'
]

const MIN_WIDTH = 220
const MAX_WIDTH = 420
const DEFAULT_WIDTH = 280

export const Sidebar: React.FC<SidebarProps> = ({
  onSelectProject,
  selectedProjectId,
  onSelectBoard,
  selectedBoardId,
  onGoHome,
  isHome,
  onOpenCalendar,
  isCalendar,
  searchQuery = '',
  onDataChange
}) => {
  const [width, setWidth] = useState(() => {
    const storedWidth = Number(localStorage.getItem('shipyard:sidebar-width'))
    return Number.isFinite(storedWidth) && storedWidth > 0
      ? Math.min(Math.max(storedWidth, MIN_WIDTH), MAX_WIDTH)
      : DEFAULT_WIDTH
  })
  const resizeCleanupRef = useRef<(() => void) | null>(null)
  const [projects, setProjects] = useState<any[]>([])
  const [workspaces, setWorkspaces] = useState<any[]>([])
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [menu, setMenu] = useState<MenuTarget | null>(null)
  const [showProjectModal, setShowProjectModal] = useState(false)
  const [editingProject, setEditingProject] = useState<any>(null)
  const [showWorkspaceModal, setShowWorkspaceModal] = useState(false)
  const [workspaceName, setWorkspaceName] = useState('')
  const [targetWorkspaceId, setTargetWorkspaceId] = useState<string | null>(null)
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }))

  const matchesSearch = (value: string) => value.toLowerCase().includes(searchQuery.toLowerCase())
  const projectsForWorkspace = (workspaceId: string | null, filter = true) =>
    projects.filter(
      (project) =>
        (workspaceId ? project.workspaceId === workspaceId : !project.workspaceId) &&
        (!filter || !searchQuery || matchesSearch(project.name))
    )

  const workspaceMatches = (workspaceId: string, matchingIds?: Set<string>): boolean => {
    const workspace = workspaces.find((candidate) => candidate.id === workspaceId)
    if (!workspace) return false
    const childMatches = workspaces
      .filter((candidate) => candidate.parentWorkspaceId === workspaceId)
      .some((child) => workspaceMatches(child.id, matchingIds))
    const matches =
      matchesSearch(workspace.name) || projectsForWorkspace(workspaceId).length > 0 || childMatches
    if (matches) matchingIds?.add(workspaceId)
    return matches
  }

  const loadData = async () => {
    const [projectRows, workspaceRows] = await Promise.all([
      window.electron.db.findAll('projects'),
      window.electron.db.findAll('workspaces')
    ])
    setProjects(projectRows)
    setWorkspaces(workspaceRows)
  }

  useEffect(() => {
    void loadData()
    const reload = () => void loadData()
    window.addEventListener('reload-projects', reload)
    return () => window.removeEventListener('reload-projects', reload)
  }, [])

  useEffect(() => {
    localStorage.setItem('shipyard:sidebar-width', String(width))
  }, [width])

  useEffect(
    () => () => {
      resizeCleanupRef.current?.()
    },
    []
  )

  const handleResizeStart = (event: React.MouseEvent): void => {
    event.preventDefault()
    event.stopPropagation()
    resizeCleanupRef.current?.()

    const startX = event.clientX
    const startWidth = width
    const handleMove = (moveEvent: MouseEvent): void => {
      const nextWidth = startWidth + moveEvent.clientX - startX
      setWidth(Math.min(Math.max(nextWidth, MIN_WIDTH), MAX_WIDTH))
    }
    const stopResize = (): void => {
      window.removeEventListener('mousemove', handleMove)
      window.removeEventListener('mouseup', stopResize)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
      resizeCleanupRef.current = null
    }

    resizeCleanupRef.current = stopResize
    document.body.style.cursor = 'ew-resize'
    document.body.style.userSelect = 'none'
    window.addEventListener('mousemove', handleMove)
    window.addEventListener('mouseup', stopResize)
  }

  useEffect(() => {
    const close = () => setMenu(null)
    const closeContextMenu = (event: MouseEvent) => {
      if (event.target instanceof Element && event.target.closest('.context-menu')) return
      setMenu(null)
    }
    window.addEventListener('click', close)
    window.addEventListener('contextmenu', closeContextMenu, { capture: true })
    return () => {
      window.removeEventListener('click', close)
      window.removeEventListener('contextmenu', closeContextMenu, { capture: true })
    }
  }, [])

  useEffect(() => {
    if (!searchQuery) return
    const query = searchQuery.toLowerCase()
    const matchingIds = new Set<string>()
    const checkWorkspace = (workspaceId: string): boolean => {
      const workspace = workspaces.find((candidate) => candidate.id === workspaceId)
      if (!workspace) return false
      const childMatches = workspaces
        .filter((candidate) => candidate.parentWorkspaceId === workspaceId)
        .some((child) => checkWorkspace(child.id))
      const matches =
        workspace.name.toLowerCase().includes(query) ||
        projects.some(
          (project) =>
            project.workspaceId === workspaceId && project.name.toLowerCase().includes(query)
        ) ||
        childMatches
      if (matches) matchingIds.add(workspaceId)
      return matches
    }
    workspaces.forEach((workspace) => checkWorkspace(workspace.id))
    setExpanded((previous) => new Set([...previous, ...matchingIds]))
  }, [searchQuery, workspaces, projects])

  const refresh = async () => {
    await loadData()
    onDataChange?.()
  }

  const createProject = async (data: any) => {
    await window.electron.db.create('projects', {
      ...data,
      workspaceId: targetWorkspaceId,
      boardIds: JSON.stringify([]),
      createdAt: Date.now(),
      updatedAt: Date.now()
    })
    setShowProjectModal(false)
    setTargetWorkspaceId(null)
    if (targetWorkspaceId) {
      setExpanded((previous) => new Set(previous).add(targetWorkspaceId))
    }
    await refresh()
  }

  const updateProject = async (data: any) => {
    if (!editingProject) return
    await window.electron.db.update('projects', editingProject.id, {
      ...data,
      updatedAt: Date.now()
    })
    setEditingProject(null)
    await refresh()
  }

  const createWorkspace = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!workspaceName.trim()) return
    await window.electron.db.create('workspaces', {
      name: workspaceName.trim(),
      color: '#2563eb',
      parentWorkspaceId: targetWorkspaceId,
      createdAt: Date.now()
    })
    setWorkspaceName('')
    setTargetWorkspaceId(null)
    setShowWorkspaceModal(false)
    if (targetWorkspaceId) {
      setExpanded((previous) => new Set(previous).add(targetWorkspaceId))
    }
    await refresh()
  }

  const deleteProject = async (projectId: string) => {
    const project = await window.electron.db.findById('projects', projectId)
    const [boards, columns, tasks, subtasks, statuses, connections] = await Promise.all([
      window.electron.db.findAll('boards'),
      window.electron.db.findAll('columns'),
      window.electron.db.findAll('tasks'),
      window.electron.db.findAll('subtasks'),
      window.electron.db.findAll('statuses'),
      window.electron.db.findAll('connections')
    ])
    const projectBoards = boards.filter((board: any) => board.projectId === projectId)
    const boardIds = new Set(projectBoards.map((board: any) => board.id))
    const projectColumns = columns.filter((column: any) => boardIds.has(column.boardId))
    const columnIds = new Set(projectColumns.map((column: any) => column.id))
    const projectTasks = tasks.filter(
      (task: any) => boardIds.has(task.boardId) || columnIds.has(task.columnId)
    )
    const taskIds = new Set(projectTasks.map((task: any) => task.id))
    const projectSubtasks = subtasks.filter((subtask: any) => taskIds.has(subtask.taskId))
    const projectStatuses = statuses.filter((status: any) => boardIds.has(status.boardId))
    const projectConnections = connections.filter((connection: any) =>
      boardIds.has(connection.boardId)
    )

    await window.electron.db.delete('projects', projectId)
    setMenu(null)
    await refresh()
    window.dispatchEvent(
      new CustomEvent('show-toast', {
        detail: {
          message: `Project "${project?.name}" deleted`,
          onUndo: async () => {
            await window.electron.db.create('projects', project)
            for (const board of projectBoards) await window.electron.db.create('boards', board)
            for (const column of projectColumns) await window.electron.db.create('columns', column)
            for (const task of projectTasks) await window.electron.db.create('tasks', task)
            for (const subtask of projectSubtasks)
              await window.electron.db.create('subtasks', subtask)
            for (const status of projectStatuses)
              await window.electron.db.create('statuses', status)
            for (const connection of projectConnections) {
              await window.electron.db.create('connections', connection)
            }
            await refresh()
          }
        }
      })
    )
  }

  const deleteWorkspace = async (workspaceId: string) => {
    const collectWorkspaceTree = (id: string): any[] => {
      const workspace = workspaces.find((candidate) => candidate.id === id)
      if (!workspace) return []
      return [
        workspace,
        ...workspaces
          .filter((candidate) => candidate.parentWorkspaceId === id)
          .flatMap((child) => collectWorkspaceTree(child.id))
      ]
    }
    const workspaceTree = collectWorkspaceTree(workspaceId)
    const workspaceIds = new Set(workspaceTree.map((workspace) => workspace.id))
    const assignedProjects = projects.filter((project) => workspaceIds.has(project.workspaceId))
    for (const project of assignedProjects) {
      await window.electron.db.update('projects', project.id, { workspaceId: null })
    }
    await window.electron.db.delete('workspaces', workspaceId)
    setMenu(null)
    await refresh()
    window.dispatchEvent(
      new CustomEvent('show-toast', {
        detail: {
          message: `Workspace "${workspaceTree[0]?.name}" deleted`,
          onUndo: async () => {
            for (const workspace of workspaceTree) {
              await window.electron.db.create('workspaces', workspace)
            }
            for (const project of assignedProjects) {
              await window.electron.db.update('projects', project.id, {
                workspaceId: project.workspaceId
              })
            }
            await refresh()
          }
        }
      })
    )
  }

  const handleDragEnd = async ({ active, over }: DragEndEvent) => {
    if (!over || active.data.current?.type !== 'project') return
    if (over.data.current?.type !== 'workspace') return
    const workspaceId = over.id === 'unassigned' ? null : String(over.id)
    await window.electron.db.update('projects', String(active.id), { workspaceId })
    await refresh()
  }

  const openMenu = (event: React.MouseEvent, type: MenuTarget['type'], id: string | null) => {
    event.preventDefault()
    event.stopPropagation()
    setMenu({ x: event.clientX, y: event.clientY, type, id })
  }

  const changeColor = async (color: string) => {
    if (!menu?.id) return
    if (menu.type === 'workspace') {
      await window.electron.db.update('workspaces', menu.id, { color })
    } else if (menu.type === 'project') {
      await window.electron.db.update('projects', menu.id, { color })
    }
    setMenu(null)
    await refresh()
  }

  const renderWorkspaces = (parentWorkspaceId: string | null = null, depth = 0): React.ReactNode =>
    workspaces
      .filter((workspace) => (workspace.parentWorkspaceId || null) === parentWorkspaceId)
      .filter((workspace) => !searchQuery || workspaceMatches(workspace.id))
      .map((workspace) => {
        const isExpanded = expanded.has(workspace.id)
        const workspaceProjects = projectsForWorkspace(workspace.id)
        const childWorkspaces = workspaces
          .filter((candidate) => candidate.parentWorkspaceId === workspace.id)
          .filter((candidate) => !searchQuery || workspaceMatches(candidate.id))
        return (
          <div key={workspace.id}>
            <WorkspaceRow
              workspace={workspace}
              depth={depth}
              expanded={isExpanded}
              onToggle={() =>
                setExpanded((previous) => {
                  const next = new Set(previous)
                  if (next.has(workspace.id)) next.delete(workspace.id)
                  else next.add(workspace.id)
                  return next
                })
              }
              onContextMenu={(event) => openMenu(event, 'workspace', workspace.id)}
            />
            {isExpanded && (
              <div className="space-y-1 mt-1">
                {renderWorkspaces(workspace.id, depth + 1)}
                {workspaceProjects.map((project) => (
                  <ProjectRow
                    key={project.id}
                    project={project}
                    depth={depth + 1}
                    selected={selectedProjectId === project.id}
                    selectedBoardId={selectedBoardId}
                    onSelect={onSelectProject}
                    onSelectBoard={onSelectBoard}
                    onContextMenu={(event) => openMenu(event, 'project', project.id)}
                  />
                ))}
                {childWorkspaces.length === 0 && workspaceProjects.length === 0 && (
                  <p
                    className="px-4 py-1 text-xs font-bold uppercase tracking-wider text-white/40"
                    style={{ paddingLeft: `${(depth + 1) * 0.75 + 1}rem` }}
                  >
                    Empty
                  </p>
                )}
              </div>
            )}
          </div>
        )
      })

  const unassigned = projectsForWorkspace(null)

  return (
    <aside
      className="aero-sidebar relative flex flex-col h-full z-10 overflow-visible border-r"
      style={{
        width,
        minWidth: MIN_WIDTH,
        maxWidth: MAX_WIDTH,
        background: 'var(--color-sidebar)',
        borderColor: 'var(--color-border-strong)',
        boxShadow: 'var(--shadow-brutal)'
      }}
    >
      <div className="brutal-accent" />
      <div className="p-4 pb-3 border-b" style={{ borderColor: 'rgba(255,255,255,0.18)' }}>
        <NavButton
          active={isHome}
          onClick={onGoHome}
          icon={<Home className="w-4 h-4" />}
          label="Workspace Overview"
        />
        <NavButton
          active={isCalendar}
          onClick={onOpenCalendar}
          icon={<Calendar className="w-4 h-4" />}
          label="Project Calendar"
        />
      </div>
      <div className="p-4 border-b space-y-2" style={{ borderColor: 'rgba(255,255,255,0.18)' }}>
        <button
          onClick={() => {
            setTargetWorkspaceId(null)
            setShowProjectModal(true)
          }}
          className="btn-primary w-full text-xs uppercase tracking-wider"
        >
          <Plus className="w-4 h-4" /> Create Project
        </button>
        <button
          onClick={() => {
            setTargetWorkspaceId(null)
            setShowWorkspaceModal(true)
          }}
          className="aero-icon-button w-full flex items-center gap-2 px-3 py-2 text-xs font-semibold text-white"
        >
          <Folder className="w-4 h-4" /> Create Workspace
        </button>
      </div>
      <div className="flex-1 overflow-auto px-3 py-4 space-y-2">
        <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
          {renderWorkspaces()}
          <UnassignedDropZone
            projects={unassigned}
            onContextMenu={(event) => openMenu(event, 'unassigned', null)}
          >
            {unassigned.map((project) => (
              <ProjectRow
                key={project.id}
                project={project}
                depth={0}
                selected={selectedProjectId === project.id}
                selectedBoardId={selectedBoardId}
                onSelect={onSelectProject}
                onSelectBoard={onSelectBoard}
                onContextMenu={(event) => openMenu(event, 'project', project.id)}
              />
            ))}
          </UnassignedDropZone>
        </DndContext>
      </div>

      {menu && (
        <div
          className="context-menu fixed z-50 min-w-[200px] animate-brutal-in"
          style={{ top: Math.min(menu.y, window.innerHeight - 290), left: menu.x }}
          onClick={(event) => event.stopPropagation()}
        >
          <div
            className="px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-white border-b"
            style={{
              background: 'linear-gradient(135deg, var(--color-primary), var(--color-secondary))',
              borderColor: 'var(--color-border-strong)'
            }}
          >
            {menu.type} Options
          </div>
          {(menu.type === 'workspace' || menu.type === 'unassigned') && (
            <button
              className="context-menu-item"
              onClick={() => {
                setTargetWorkspaceId(menu.id)
                setShowProjectModal(true)
                setMenu(null)
              }}
            >
              <Plus className="w-4 h-4" /> Create Project
            </button>
          )}
          {menu.type === 'workspace' && (
            <>
              <button
                className="context-menu-item"
                onClick={() => {
                  setTargetWorkspaceId(menu.id)
                  setShowWorkspaceModal(true)
                  setMenu(null)
                }}
              >
                <Folder className="w-4 h-4" /> Create Workspace
              </button>
              <button
                className="context-menu-item danger"
                onClick={() => menu.id && deleteWorkspace(menu.id)}
              >
                <Trash2 className="w-4 h-4" /> Delete Workspace
              </button>
            </>
          )}
          {menu.type === 'project' && (
            <>
              <button
                className="context-menu-item"
                onClick={() => {
                  setEditingProject(projects.find((project) => project.id === menu.id))
                  setMenu(null)
                }}
              >
                <Edit2 className="w-4 h-4" /> Edit Project
              </button>
              <button
                className="context-menu-item danger"
                onClick={() => menu.id && deleteProject(menu.id)}
              >
                <Trash2 className="w-4 h-4" /> Delete Project
              </button>
            </>
          )}
          {(menu.type === 'workspace' || menu.type === 'project') && (
            <div className="px-4 py-3 border-t-2" style={{ borderColor: 'var(--color-border)' }}>
              <div className="flex items-center gap-2 text-xs font-black uppercase tracking-wider mb-2">
                <Palette className="w-3.5 h-3.5" />
                Color
              </div>
              <div className="flex flex-wrap gap-1.5">
                {COLORS.map((color) => (
                  <button
                    key={color}
                    onClick={() => changeColor(color)}
                    className="w-6 h-6 border-2 hover:scale-110 transition-transform"
                    style={{ backgroundColor: color, borderColor: 'var(--color-border-strong)' }}
                    aria-label={`Set color ${color}`}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {showProjectModal && (
        <ProjectModal
          title="Create Project"
          onClose={() => setShowProjectModal(false)}
          onCreate={createProject}
        />
      )}
      {editingProject && (
        <ProjectModal
          title="Edit Project"
          initialData={editingProject}
          onClose={() => setEditingProject(null)}
          onCreate={updateProject}
        />
      )}
      {showWorkspaceModal && (
        <div
          className="fixed inset-0 bg-black/60 flex items-center justify-center z-50"
          onClick={() => setShowWorkspaceModal(false)}
        >
          <form
            className="aero-window w-full max-w-sm surface p-5 space-y-4"
            onSubmit={createWorkspace}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h2 className="font-semibold">Create Workspace</h2>
              <button type="button" onClick={() => setShowWorkspaceModal(false)}>
                <X className="w-4 h-4" />
              </button>
            </div>
            <input
              autoFocus
              value={workspaceName}
              onChange={(event) => setWorkspaceName(event.target.value)}
              placeholder="Workspace name"
              className="aero-input w-full px-3 py-2 bg-transparent"
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                className="btn-secondary text-xs"
                onClick={() => setShowWorkspaceModal(false)}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="btn-primary text-xs"
                disabled={!workspaceName.trim()}
              >
                Create
              </button>
            </div>
          </form>
        </div>
      )}

      <button
        type="button"
        onMouseDown={handleResizeStart}
        className="absolute top-0 -right-1 h-full w-3 cursor-ew-resize z-30"
        aria-label="Resize sidebar"
        title="Drag to resize sidebar"
      />
    </aside>
  )
}

const NavButton = ({
  active,
  onClick,
  icon,
  label
}: {
  active: boolean
  onClick: () => void
  icon: React.ReactNode
  label: string
}) => (
  <button
    onClick={onClick}
    className="nav-item w-full flex items-center gap-2 px-3 py-2 mt-2 text-xs text-white"
    style={{
      borderColor: active ? 'var(--color-primary)' : 'rgba(255,255,255,0.18)',
      background: active ? 'var(--color-primary)' : 'rgba(255,255,255,0.06)'
    }}
  >
    {icon}
    <span className="flex-1 text-left">{label}</span>
  </button>
)

const WorkspaceRow = ({
  workspace,
  depth,
  expanded,
  onToggle,
  onContextMenu
}: {
  workspace: any
  depth: number
  expanded: boolean
  onToggle: () => void
  onContextMenu: (event: React.MouseEvent) => void
}) => {
  const { isOver, setNodeRef } = useDroppable({ id: workspace.id, data: { type: 'workspace' } })
  return (
    <button
      ref={setNodeRef}
      onClick={onToggle}
      onContextMenu={onContextMenu}
      className="nav-item w-full"
      style={{
        paddingLeft: `${depth * 12 + 8}px`,
        background: isOver ? 'rgba(95,182,255,0.2)' : undefined
      }}
    >
      {expanded ? (
        <ChevronDown className="w-3.5 h-3.5" />
      ) : (
        <ChevronRight className="w-3.5 h-3.5" />
      )}
      <Folder className="w-4 h-4" style={{ color: workspace.color || '#2563eb' }} />
      <span className="truncate">{workspace.name}</span>
    </button>
  )
}

const UnassignedDropZone = ({
  projects,
  onContextMenu,
  children
}: {
  projects: any[]
  onContextMenu: (event: React.MouseEvent) => void
  children: React.ReactNode
}) => {
  const { isOver, setNodeRef } = useDroppable({ id: 'unassigned', data: { type: 'workspace' } })
  return (
    <div
      ref={setNodeRef}
      onContextMenu={onContextMenu}
      className="mt-4"
      style={{ outline: isOver ? '2px solid var(--color-primary)' : undefined }}
    >
      <p className="px-3 py-2 text-[10px] font-black uppercase text-white/70">
        Unassigned Projects
      </p>
      <div className="space-y-1">{children}</div>
      {!projects.length && (
        <p className="px-3 py-1 text-[10px] font-bold uppercase text-white/40">
          No unassigned projects
        </p>
      )}
    </div>
  )
}

const ProjectRow = ({
  project,
  depth,
  selected,
  selectedBoardId,
  onSelect,
  onSelectBoard,
  onContextMenu
}: {
  project: any
  depth: number
  selected: boolean
  selectedBoardId: string | null
  onSelect: (id: string) => void
  onSelectBoard: (id: string) => void
  onContextMenu: (event: React.MouseEvent) => void
}) => {
  const [boards, setBoards] = useState<any[]>([])
  const [expanded, setExpanded] = useState(false)
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: project.id,
    data: { type: 'project', project }
  })

  useEffect(() => {
    if (!expanded) return
    const loadBoards = () => {
      window.electron.db
        .findAll('boards')
        .then((rows) => setBoards(rows.filter((board: any) => board.projectId === project.id)))
    }
    loadBoards()
    window.addEventListener('reload-projects', loadBoards)
    return () => window.removeEventListener('reload-projects', loadBoards)
  }, [expanded, project.id])

  return (
    <div ref={setNodeRef} className={isDragging ? 'opacity-40' : ''}>
      <div className="flex" onContextMenu={onContextMenu}>
        <button
          className={`nav-item flex-1 ${selected ? 'active' : ''}`}
          style={{ paddingLeft: `${depth * 12 + 8}px` }}
          onClick={() => {
            onSelect(project.id)
            setExpanded((value) => !value)
          }}
        >
          {expanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
          <FolderKanban className="w-4 h-4" style={{ color: project.color || '#2563eb' }} />
          <span className="truncate">{project.name}</span>
        </button>
        <button
          {...listeners}
          {...attributes}
          className="px-2 text-white/40 cursor-grab"
          title="Move project"
        >
          ::
        </button>
      </div>
      {expanded && (
        <div className="ml-8 space-y-1">
          {boards.map((board) => (
            <button
              key={board.id}
              onClick={() => onSelectBoard(board.id)}
              className="nav-item w-full"
              style={{ color: selectedBoardId === board.id ? 'white' : undefined }}
            >
              <KanbanSquare className="w-3 h-3" />
              {board.name}
            </button>
          ))}
          {!boards.length && <p className="px-3 text-[10px] uppercase text-white/40">No boards</p>}
        </div>
      )}
    </div>
  )
}
