import { Dashboard } from '../Dashboard/Dashboard'
import React, { useEffect, useState, useCallback } from 'react'
import {
  LayoutDashboard,
  FolderKanban,
  KanbanSquare,
  Plus,
  FolderOpen,
  Clock,
  ChevronRight,
  Search,
  X,
  GripVertical
} from 'lucide-react'
import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  PointerSensor,
  pointerWithin,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors
} from '@dnd-kit/core'
import { ProjectModal } from '../Projects/ProjectModal'
import { workspaceWithDescendants } from '../../lib/hierarchy'

interface HomeScreenProps {
  onSelectProject: (projectId: string) => void
  onSelectBoard: (boardId: string) => void
  dataVersion?: number
  onDataChange?: () => void
}

interface Workspace {
  id: string
  name: string
  color: string
  parentWorkspaceId?: string | null
}
interface Project {
  id: string
  name: string
  color: string
  workspaceId?: string | null
  description?: string
  tags?: string
  createdAt: number
}
interface BoardSummary {
  id: string
  name: string
  projectId: string
  color?: string
  createdAt: number
  description?: string
}

export const HomeScreen: React.FC<HomeScreenProps> = ({
  onSelectProject,
  onSelectBoard,
  dataVersion,
  onDataChange
}) => {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([])
  const [projects, setProjects] = useState<Project[]>([])
  const [boards, setBoards] = useState<BoardSummary[]>([])
  const [filter, setFilter] = useState('')
  const [showCreateProject, setShowCreateProject] = useState(false)
  const [activeWorkspace, setActiveWorkspace] = useState<string | 'all' | 'unassigned'>('all')

  const loadAll = useCallback(async () => {
    const [workspaceData, projectData, boardData] = await Promise.all([
      window.electron.db.findAll('workspaces'),
      window.electron.db.findAll('projects'),
      window.electron.db.findAll('boards')
    ])
    setWorkspaces(workspaceData)
    setProjects(projectData)
    setBoards(boardData)
  }, [])

  useEffect(() => {
    loadAll()
  }, [dataVersion])

  const handleCreateProject = async (projectData: any) => {
    await window.electron.db.create('projects', {
      ...projectData,
      workspaceId: null,
      boardIds: JSON.stringify([]),
      createdAt: Date.now(),
      updatedAt: Date.now()
    })
    loadAll()
    setShowCreateProject(false)
  }

  const boardsForProject = (projectId: string) =>
    boards.filter((board) => board.projectId === projectId)

  // A workspace's view includes projects in its sub-workspaces.
  const activeWorkspaceIds =
    activeWorkspace === 'all' || activeWorkspace === 'unassigned'
      ? null
      : workspaceWithDescendants(workspaces, activeWorkspace)

  // Projects whose workspace no longer exists count as unassigned, so they
  // never vanish from every tab (the dashboard uses the same rule).
  const knownWorkspaceIds = new Set(workspaces.map((workspace) => workspace.id))
  const isUnassigned = (project: Project) =>
    !project.workspaceId || !knownWorkspaceIds.has(project.workspaceId)

  const filteredProjects = projects.filter((project) => {
    const matchesWorkspace =
      activeWorkspace === 'all' ||
      (activeWorkspace === 'unassigned'
        ? isUnassigned(project)
        : !!project.workspaceId && !!activeWorkspaceIds?.has(project.workspaceId))
    const matchesFilter = !filter || project.name.toLowerCase().includes(filter.toLowerCase())
    return matchesWorkspace && matchesFilter
  })

  const recentBoards = [...boards]
    .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
    .slice(0, 6)

  const unassignedCount = projects.filter(isUnassigned).length

  // Workspaces in tree order with their depth, so nesting is visible.
  const orderedWorkspaces: { workspace: Workspace; depth: number }[] = []
  const visit = (parentId: string | null, depth: number, seen: Set<string>) => {
    for (const workspace of workspaces) {
      if ((workspace.parentWorkspaceId || null) !== parentId || seen.has(workspace.id)) continue
      seen.add(workspace.id)
      orderedWorkspaces.push({ workspace, depth })
      visit(workspace.id, depth + 1, seen)
    }
  }
  const visited = new Set<string>()
  visit(null, 0, visited)
  // Workspaces whose parent no longer exists are shown at the top level,
  // with their own sub-workspaces still nested under them.
  for (const workspace of workspaces) {
    if (visited.has(workspace.id)) continue
    visited.add(workspace.id)
    orderedWorkspaces.push({ workspace, depth: 0 })
    visit(workspace.id, 1, visited)
  }

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }))
  const [draggingProjectId, setDraggingProjectId] = useState<string | null>(null)
  const draggingProject = draggingProjectId !== null
  const draggedProject = projects.find((candidate) => candidate.id === draggingProjectId)

  const handleDragEnd = async ({ active, over }: DragEndEvent) => {
    setDraggingProjectId(null)
    if (!over || active.data.current?.type !== 'home-project') return
    const workspaceId =
      over.id === 'home-unassigned' ? null : String(over.data.current?.workspaceId)
    const project = projects.find((candidate) => candidate.id === active.data.current?.projectId)
    if (!project || (project.workspaceId || null) === workspaceId) return
    try {
      await window.electron.db.update('projects', project.id, { workspaceId })
      await loadAll()
      window.dispatchEvent(new CustomEvent('reload-projects'))
      onDataChange?.()
    } catch (error) {
      window.dispatchEvent(
        new CustomEvent('show-toast', { detail: { message: `Could not move: ${String(error)}` } })
      )
    }
  }

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* ── TOP BAR ── */}
      <div
        className="aero-panel flex items-center justify-between px-6 py-4 border-b shrink-0 rounded-none!"
        style={{
          borderColor: 'var(--color-border-strong)',
          background: 'var(--color-surface)',
          boxShadow: 'var(--shadow-brutal)'
        }}
      >
        <div className="flex items-center gap-3">
          <div
            className="w-10 h-10 flex items-center justify-center border rounded-md"
            style={{
              background: 'var(--color-primary)',
              borderColor: 'var(--color-border-strong)',
              boxShadow: 'var(--shadow-brutal-sm)'
            }}
          >
            <LayoutDashboard className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1
              className="text-xl font-black uppercase tracking-tight leading-none"
              style={{ color: 'var(--color-text)' }}
            >
              Workspace Overview
            </h1>
            <p
              className="text-[11px] font-black uppercase tracking-[0.24em] leading-none mt-1"
              style={{ color: 'var(--color-muted)' }}
            >
              {projects.length} projects · {boards.length} boards
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Filter input */}
          <div className="relative">
            <Search
              className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none"
              style={{ color: 'var(--color-muted)' }}
            />
            <input
              type="text"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Filter..."
              className="aero-input pl-10 pr-10 py-2 text-sm font-semibold focus:outline-none w-48"
              style={{
                borderColor: 'var(--color-border-strong)',
                background: 'var(--color-surface-2)',
                color: 'var(--color-text)',
                boxShadow: 'var(--shadow-brutal-sm)'
              }}
            />
            {filter && (
              <button
                onClick={() => setFilter('')}
                className="absolute right-3 top-1/2 -translate-y-1/2"
                style={{ color: 'var(--color-muted)' }}
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          <button
            onClick={() => setShowCreateProject(true)}
            className="btn-primary text-xs uppercase tracking-wider"
          >
            <Plus className="w-4 h-4 stroke-[3px]" />
            Create Project
          </button>
        </div>
      </div>

      <DndContext
        sensors={sensors}
        // The drop target is whatever is under the pointer, not whatever the
        // (large) project card overlaps most.
        collisionDetection={pointerWithin}
        onDragStart={({ active }: DragStartEvent) =>
          setDraggingProjectId(String(active.data.current?.projectId ?? ''))
        }
        onDragEnd={handleDragEnd}
        onDragCancel={() => setDraggingProjectId(null)}
      >
        <div className="flex-1 flex overflow-hidden">
          {/* Workspace filters (only useful once workspaces exist) */}
          {workspaces.length > 0 && (
            <div
              className="aero-panel w-48 shrink-0 border-r flex flex-col overflow-y-auto rounded-none!"
              style={{
                borderColor: 'var(--color-border-strong)',
                background: 'var(--color-surface)',
                boxShadow: 'var(--shadow-brutal)'
              }}
            >
              <div
                className="aero-section-title px-4 py-3 text-[10px] font-semibold tracking-[0.12em] border-b"
                style={{ borderColor: 'var(--color-border-strong)', color: 'var(--color-muted)' }}
              >
                Workspaces
              </div>

              <div className="space-y-2 px-2 py-3">
                {/* All */}
                <button
                  onClick={() => setActiveWorkspace('all')}
                  className="flex items-center gap-2 px-3 py-2.5 text-left transition-all duration-100"
                  style={{
                    border: '2px solid',
                    borderColor: activeWorkspace === 'all' ? 'var(--color-primary)' : 'transparent',
                    background:
                      activeWorkspace === 'all' ? 'var(--color-primary-soft)' : 'transparent',
                    color: 'var(--color-text)',
                    boxShadow: activeWorkspace === 'all' ? 'var(--shadow-brutal-sm)' : 'none'
                  }}
                >
                  <FolderOpen className="w-4 h-4 shrink-0" />
                  <span className="text-xs font-black uppercase tracking-wide flex-1">All</span>
                  <span className="text-[10px] font-black opacity-70">{projects.length}</span>
                </button>

                {/* Workspace tabs (drop a project on one to move it there) */}
                {orderedWorkspaces.map(({ workspace, depth }) => {
                  // Matches the list shown when it is selected (includes sub-workspaces).
                  const subtree = workspaceWithDescendants(workspaces, workspace.id)
                  const workspaceProjectCount = projects.filter(
                    (project) => !!project.workspaceId && subtree.has(project.workspaceId)
                  ).length
                  const isActive = activeWorkspace === workspace.id
                  return (
                    <WorkspaceDropTarget
                      key={workspace.id}
                      id={`home-workspace:${workspace.id}`}
                      workspaceId={workspace.id}
                    >
                      {(isOver) => (
                        <button
                          onClick={() => setActiveWorkspace(workspace.id)}
                          className="w-full flex items-center gap-2 px-3 py-2.5 text-left transition-all duration-100"
                          style={{
                            marginLeft: depth * 10,
                            width: `calc(100% - ${depth * 10}px)`,
                            border: '2px solid',
                            borderColor:
                              isActive || isOver ? workspace.color || '#2563eb' : 'transparent',
                            background:
                              isActive || isOver
                                ? (workspace.color || '#2563eb') + (isOver ? '33' : '1a')
                                : 'transparent',
                            color: 'var(--color-text)',
                            boxShadow: isActive ? 'var(--shadow-brutal-sm)' : 'none'
                          }}
                        >
                          <div
                            className="w-2.5 h-2.5 border-2 shrink-0"
                            style={{
                              background: workspace.color || '#2563eb',
                              borderColor: 'var(--color-border-strong)'
                            }}
                          />
                          <span className="text-xs font-black uppercase tracking-wide flex-1 truncate">
                            {workspace.name}
                          </span>
                          <span className="text-[10px] font-black opacity-70">
                            {workspaceProjectCount}
                          </span>
                        </button>
                      )}
                    </WorkspaceDropTarget>
                  )
                })}

                {/* Unassigned (always a drop target while a project is dragged) */}
                {(unassignedCount > 0 || draggingProject) && (
                  <WorkspaceDropTarget id="home-unassigned" workspaceId={null}>
                    {(isOver) => (
                      <button
                        onClick={() => setActiveWorkspace('unassigned')}
                        className="w-full flex items-center gap-2 px-3 py-2.5 text-left transition-all duration-100"
                        style={{
                          border: '2px solid',
                          borderColor:
                            activeWorkspace === 'unassigned' || isOver
                              ? 'var(--color-muted)'
                              : 'transparent',
                          background:
                            activeWorkspace === 'unassigned' || isOver
                              ? 'rgba(54,80,107,0.16)'
                              : 'transparent',
                          color:
                            activeWorkspace === 'unassigned'
                              ? 'var(--color-text)'
                              : 'var(--color-muted)',
                          boxShadow:
                            activeWorkspace === 'unassigned' ? 'var(--shadow-brutal-sm)' : 'none'
                        }}
                      >
                        <FolderKanban className="w-4 h-4 shrink-0 opacity-70" />
                        <span className="text-xs font-black uppercase tracking-wide flex-1">
                          Unassigned Projects
                        </span>
                        <span className="text-[10px] font-black opacity-70">{unassignedCount}</span>
                      </button>
                    )}
                  </WorkspaceDropTarget>
                )}
              </div>
            </div>
          )}

          {/* ── RIGHT: MAIN CONTENT ── */}
          <div className="flex-1 overflow-auto px-6 py-5 space-y-8">
            {/* Dashboard widgets; "follow the overview" widgets use the workspace tab */}
            <Dashboard dataVersion={dataVersion ?? 0} overview={activeWorkspace} />

            {/* Recent boards */}
            {recentBoards.length > 0 && activeWorkspace === 'all' && !filter && (
              <section>
                <div className="flex items-center gap-2 mb-3">
                  <Clock className="w-3.5 h-3.5" style={{ color: 'var(--color-primary)' }} />
                  <h2
                    className="text-[10px] font-black uppercase tracking-widest"
                    style={{ color: 'var(--color-muted)' }}
                  >
                    Recent Boards
                  </h2>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
                  {recentBoards.map((board) => {
                    const project = projects.find((candidate) => candidate.id === board.projectId)
                    const c = project?.color || '#2563eb'
                    return (
                      <button
                        key={board.id}
                        onClick={() => onSelectBoard(board.id)}
                        className="card group text-left p-3 transition-all duration-150"
                        style={{
                          borderColor: c,
                          background: c + '10',
                          boxShadow: `var(--shadow-brutal-sm)`
                        }}
                        onMouseOver={(e) => {
                          e.currentTarget.style.filter = 'brightness(1.04)'
                          e.currentTarget.style.boxShadow = `var(--shadow-brutal)`
                        }}
                        onMouseOut={(e) => {
                          e.currentTarget.style.filter = ''
                          e.currentTarget.style.boxShadow = `var(--shadow-brutal-sm)`
                        }}
                      >
                        <KanbanSquare className="w-5 h-5 mb-2" style={{ color: c }} />
                        <div
                          className="text-[11px] font-black uppercase leading-tight break-words whitespace-pre-wrap"
                          style={{ color: 'var(--color-text)' }}
                        >
                          {board.name}
                        </div>
                        {project && (
                          <div
                            className="text-[9px] font-bold mt-1 break-words whitespace-pre-wrap"
                            style={{ color: c }}
                          >
                            {project.name}
                          </div>
                        )}
                      </button>
                    )
                  })}
                </div>
              </section>
            )}

            {/* Projects and boards */}
            {filteredProjects.length === 0 ? (
              <div
                className="aero-panel py-24 flex flex-col items-center gap-4 border border-dashed"
                style={{ borderColor: 'var(--color-border)' }}
              >
                <FolderOpen
                  className="w-12 h-12 opacity-20"
                  style={{ color: 'var(--color-primary)' }}
                />
                <div className="text-center">
                  <p
                    className="font-black text-base uppercase tracking-wider"
                    style={{ color: 'var(--color-muted)' }}
                  >
                    {filter ? `No results for "${filter}"` : 'No projects here yet'}
                  </p>
                  {!filter && (
                    <p
                      className="text-sm font-semibold mt-2 max-w-sm"
                      style={{ color: 'var(--color-muted)' }}
                    >
                      Create a project, then add a board to it. Boards hold columns of tasks you can
                      drag between stages.
                    </p>
                  )}
                  {!filter && (
                    <button
                      onClick={() => setShowCreateProject(true)}
                      className="btn-primary mt-4 text-xs uppercase tracking-wider"
                    >
                      <Plus className="w-4 h-4 stroke-[3px]" />
                      Create Project
                    </button>
                  )}
                </div>
              </div>
            ) : (
              <div className="space-y-6">
                {filteredProjects.map((project) => {
                  const projectBoards = boardsForProject(project.id).filter(
                    (board) => !filter || board.name.toLowerCase().includes(filter.toLowerCase())
                  )
                  const projectColor = project.color || '#2563eb'
                  const workspace = workspaces.find(
                    (candidate) => candidate.id === project.workspaceId
                  )

                  return (
                    <DraggableProject key={project.id} projectId={project.id}>
                      {(handle) => (
                        <section>
                          {/* Project header */}
                          <div
                            className="aero-panel flex items-center gap-3 mb-3 px-3 py-2"
                            style={{
                              background: 'var(--color-surface-2)',
                              border: '1px solid var(--color-border)',
                              boxShadow: 'var(--shadow-brutal-sm)'
                            }}
                          >
                            {workspaces.length > 0 && handle}
                            <div
                              className="w-2.5 h-8 rounded-full shrink-0"
                              style={{
                                background: projectColor,
                                boxShadow: `0 12px 28px ${projectColor}33`
                              }}
                            />
                            <h2
                              className="font-semibold text-sm uppercase tracking-wide"
                              style={{ color: 'var(--color-text)' }}
                            >
                              {project.name}
                            </h2>
                            {workspace && (
                              <span
                                className="text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 border rounded-full"
                                style={{
                                  borderColor: workspace.color || projectColor,
                                  color: workspace.color || projectColor
                                }}
                              >
                                {workspace.name}
                              </span>
                            )}
                            <div
                              className="h-px flex-1"
                              style={{ background: projectColor + '30' }}
                            />
                            <button
                              onClick={() => onSelectProject(project.id)}
                              className="flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide px-3 py-1.5 rounded-full transition-all duration-150"
                              style={{
                                color: projectColor,
                                background: 'rgba(255,255,255,0.04)',
                                border: '1px solid var(--color-border)'
                              }}
                            >
                              View Project
                              <ChevronRight className="w-3 h-3" />
                            </button>
                          </div>

                          {/* Board grid */}
                          {projectBoards.length === 0 ? (
                            <div
                              className="aero-panel px-4 py-3 border border-dashed text-[10px] font-semibold tracking-wider"
                              style={{
                                borderColor: projectColor + '70',
                                color: 'var(--color-muted)'
                              }}
                            >
                              No boards yet. Open the project to create one.
                            </div>
                          ) : (
                            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
                              {projectBoards.map((board) => (
                                <button
                                  key={board.id}
                                  onClick={() => onSelectBoard(board.id)}
                                  className="card group text-left p-3 transition-all duration-150 relative overflow-hidden"
                                  style={{
                                    borderColor: 'var(--color-border)',
                                    background: 'var(--color-surface)',
                                    boxShadow: 'var(--shadow-brutal-sm)'
                                  }}
                                  onMouseOver={(e) => {
                                    e.currentTarget.style.borderColor = projectColor
                                    e.currentTarget.style.filter = 'brightness(1.04)'
                                    e.currentTarget.style.boxShadow = `var(--shadow-brutal)`
                                  }}
                                  onMouseOut={(e) => {
                                    e.currentTarget.style.borderColor = 'var(--color-border)'
                                    e.currentTarget.style.filter = ''
                                    e.currentTarget.style.boxShadow = 'var(--shadow-brutal-sm)'
                                  }}
                                >
                                  {/* Top accent */}
                                  <div
                                    className="absolute top-0 left-0 right-0 h-1"
                                    style={{ background: projectColor }}
                                  />
                                  <KanbanSquare
                                    className="w-4 h-4 mb-2"
                                    style={{ color: projectColor }}
                                  />
                                  <div
                                    className="font-black text-xs uppercase tracking-wide leading-tight break-words whitespace-pre-wrap"
                                    style={{ color: 'var(--color-text)' }}
                                  >
                                    {board.name}
                                  </div>
                                  <div className="flex items-center justify-between mt-2">
                                    <LayoutDashboard
                                      className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity"
                                      style={{ color: projectColor }}
                                    />
                                    <ChevronRight
                                      className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity"
                                      style={{ color: projectColor }}
                                    />
                                  </div>
                                </button>
                              ))}
                            </div>
                          )}
                        </section>
                      )}
                    </DraggableProject>
                  )
                })}
              </div>
            )}
          </div>
        </div>
        <DragOverlay dropAnimation={null}>
          {draggedProject && (
            <div
              className="aero-panel px-3 py-2 text-xs font-black uppercase tracking-wide inline-flex items-center gap-2"
              style={{
                background: 'var(--color-surface)',
                border: `2px solid ${draggedProject.color || '#2563eb'}`,
                boxShadow: 'var(--shadow-brutal)',
                color: 'var(--color-text)'
              }}
            >
              <FolderKanban
                className="w-4 h-4"
                style={{ color: draggedProject.color || '#2563eb' }}
              />
              {draggedProject.name}
            </div>
          )}
        </DragOverlay>
      </DndContext>

      {showCreateProject && (
        <ProjectModal
          title="Create Project"
          showGitHubRepo
          onClose={() => setShowCreateProject(false)}
          onCreate={handleCreateProject}
        />
      )}
    </div>
  )
}

const WorkspaceDropTarget: React.FC<{
  id: string
  workspaceId: string | null
  children: (isOver: boolean) => React.ReactNode
}> = ({ id, workspaceId, children }) => {
  const { isOver, setNodeRef } = useDroppable({ id, data: { workspaceId } })
  return <div ref={setNodeRef}>{children(isOver)}</div>
}

const DraggableProject: React.FC<{
  projectId: string
  children: (handle: React.ReactNode) => React.ReactNode
}> = ({ projectId, children }) => {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `home-project:${projectId}`,
    data: { type: 'home-project', projectId }
  })
  const handle = (
    <button
      {...listeners}
      {...attributes}
      className="cursor-grab shrink-0 p-1"
      style={{ color: 'var(--color-muted)' }}
      title="Drag onto a workspace to move this project"
      aria-label="Move project to a workspace"
    >
      <GripVertical className="w-4 h-4" />
    </button>
  )
  return (
    <div ref={setNodeRef} style={{ opacity: isDragging ? 0.45 : 1 }}>
      {children(handle)}
    </div>
  )
}
