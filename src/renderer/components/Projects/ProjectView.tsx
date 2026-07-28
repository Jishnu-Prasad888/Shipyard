import React, { useEffect, useState } from 'react'
import { Plus, Edit2, Tag, LayoutGrid, Trash2 } from 'lucide-react'
import { BoardCard } from './BoardCard'
import { ProjectModal } from './ProjectModal'
import { Board, Project } from '@shared/types'
import { getBoardsByProjectId, getProjectById } from '../../lib/data'

interface ProjectViewProps {
  projectId: string
  onSelectBoard: (boardId: string) => void
  searchQuery: string
}

export const ProjectView: React.FC<ProjectViewProps> = ({ projectId, onSelectBoard, searchQuery }) => {
  const [project, setProject] = useState<Project | null>(null)
  const [boards, setBoards] = useState<Board[]>([])
  const [filteredBoards, setFilteredBoards] = useState<Board[]>([])
  const [showCreateBoard, setShowCreateBoard] = useState(false)
  const [showEditProject, setShowEditProject] = useState(false)
  const [editingBoard, setEditingBoard] = useState<any>(null)
  const [contextMenu, setContextMenu] = useState<{ x: number, y: number, boardId: string } | null>(null)

  useEffect(() => {
    const handleReload = () => loadData()
    window.addEventListener('reload-projects', handleReload)
    const handleClick = () => setContextMenu(null)
    const handleContextClick = (e: MouseEvent) => {
      if (e.target instanceof Element && e.target.closest('.context-menu')) return
      setContextMenu(null)
    }
    
    window.addEventListener('click', handleClick)
    window.addEventListener('contextmenu', handleContextClick, { capture: true })
    
    return () => {
      window.removeEventListener('reload-projects', handleReload)
      window.removeEventListener('click', handleClick)
      window.removeEventListener('contextmenu', handleContextClick, { capture: true })
    }
  }, [projectId])

  useEffect(() => {
    loadData()
  }, [projectId])

  useEffect(() => {
    filterBoards()
  }, [boards, searchQuery])

  const loadData = async () => {
    const projectData = await getProjectById(projectId)
    setProject(projectData)

    if (projectData) {
      setBoards(await getBoardsByProjectId(projectId))
    }
  }

  const filterBoards = () => {
    let filtered = [...boards]
    if (searchQuery) {
      filtered = filtered.filter((board) =>
        board.name.toLowerCase().includes(searchQuery.toLowerCase())
      )
    }
    setFilteredBoards(filtered)
  }

  const handleCreateBoard = async (boardData: any) => {
    const newBoard = {
      ...boardData,
      projectId,
      createdAt: Date.now(),
      updatedAt: Date.now()
    }

    try {
      const created = await window.electron.db.create('boards', newBoard)

      if (project && created && created.id) {
       const boardIds = Array.isArray(project.boardIds) ? [...project.boardIds] : []
       boardIds.push(created.id)
       await window.electron.db.update('projects', projectId, {
         boardIds: JSON.stringify(boardIds),
         updatedAt: Date.now()
        })
      }

      await loadData()
      setShowCreateBoard(false)
    } catch (err) {
      console.error('Failed to create board:', err)
      alert('Failed to create board. Please check logs.')
    }
  }

  const handleUpdateProject = async (projectData: any) => {
    await window.electron.db.update('projects', projectId, {
      ...projectData,
      updatedAt: Date.now()
    })
    loadData()
    setShowEditProject(false)
  }

  const handleUpdateBoard = async (boardData: any) => {
    if (!editingBoard) return
    await window.electron.db.update('boards', editingBoard.id, {
      ...boardData,
      updatedAt: Date.now()
    })
    loadData()
    setEditingBoard(null)
  }

  const handleDeleteBoard = async (boardIdToDelete: string) => {
    setContextMenu(null)
    const boardSnapshot = await window.electron.db.findById('boards', boardIdToDelete)
    if (!boardSnapshot) return

    const allTasks = await window.electron.db.findAll('tasks')
    const boardTasks = allTasks.filter((task: any) => task.boardId === boardIdToDelete)
    const allSubtasks = await window.electron.db.findAll('subtasks')
    const boardSubtasks = allSubtasks.filter((subtask: any) => boardTasks.some((task: any) => task.id === subtask.taskId))
    const allColumns = await window.electron.db.findAll('columns')
    const boardColumns = allColumns.filter((column: any) => column.boardId === boardIdToDelete)

    // Delete everything
    for (const task of boardTasks) await window.electron.db.delete('tasks', task.id)
    for (const column of boardColumns) await window.electron.db.delete('columns', column.id)
    await window.electron.db.delete('boards', boardIdToDelete)

    if (project) {
      const boardIds = Array.isArray(project.boardIds) ? project.boardIds : []
      const newBoardIds = boardIds.filter((id: string) => id !== boardIdToDelete)
      await window.electron.db.update('projects', project.id, { boardIds: JSON.stringify(newBoardIds) })
    }

    loadData()

    window.dispatchEvent(
      new CustomEvent('show-toast', {
        detail: {
          message: `Board "${boardSnapshot.name}" deleted`,
          onUndo: async () => {
            await window.electron.db.create('boards', boardSnapshot)
            for (const column of boardColumns) await window.electron.db.create('columns', column)
            for (const task of boardTasks) await window.electron.db.create('tasks', task)
            for (const subtask of boardSubtasks) await window.electron.db.create('subtasks', subtask)
            if (project) {
              const bIds = Array.isArray(project.boardIds) ? [...project.boardIds] : []
              bIds.push(boardIdToDelete)
              await window.electron.db.update('projects', project.id, { boardIds: JSON.stringify(bIds) })
            }
            loadData()
          }
        }
      })
    )
  }

  if (!project) return null

  const projectColor = project.color || '#2563eb'

  const tags = project.tags || []

  return (
    <div className="space-y-6">
      {/* Project header */}
      <div
        className="p-5 border-4"
        style={{
          borderColor: projectColor,
          boxShadow: `6px 6px 0 ${projectColor}`,
          background: 'var(--color-surface)'
        }}
      >
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <div className="flex items-center gap-3">
              <div
                className="w-5 h-5 border-2"
                style={{ backgroundColor: projectColor, borderColor: 'var(--color-border-strong)' }}
              />
              <h1 className="text-2xl font-black uppercase tracking-tight" style={{ color: 'var(--color-text)' }}>
                {project.name}
              </h1>
              <button
                onClick={() => setShowEditProject(true)}
                className="p-1.5 border-2 transition-all duration-100 hover:-translate-x-0.5 hover:-translate-y-0.5"
                style={{
                  borderColor: 'var(--color-border)',
                  color: 'var(--color-muted)',
                  boxShadow: 'var(--shadow-brutal-sm)'
                }}
                title="Edit project"
              >
                <Edit2 className="w-3.5 h-3.5" />
              </button>
            </div>

            {project.description && (
              <p
                className="mt-2 text-sm font-bold max-w-2xl"
                style={{ color: 'var(--color-muted)' }}
              >
                {project.description}
              </p>
            )}

            {tags.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-3">
                {tags.map((tag: string) => (
                  <span
                    key={tag}
                    className="flex items-center gap-1 px-2 py-1 text-xs font-black uppercase tracking-wider border-2"
                    style={{
                      borderColor: projectColor,
                      color: projectColor,
                      background: projectColor + '15'
                    }}
                  >
                    <Tag className="w-2.5 h-2.5" />
                    {tag}
                  </span>
                ))}
              </div>
            )}
          </div>

          <button
            onClick={() => setShowCreateBoard(true)}
            className="btn-primary text-xs uppercase tracking-wider shrink-0"
          >
            <Plus className="w-4 h-4 stroke-[3px]" />
            Create Board
          </button>
        </div>

        <div className="mt-3 pt-3 border-t-2 flex items-center gap-4" style={{ borderColor: 'var(--color-border)' }}>
          <span
            className="flex items-center gap-1.5 text-xs font-black uppercase tracking-wider px-2 py-1 border-2"
            style={{ borderColor: projectColor, color: projectColor, background: projectColor + '10' }}
          >
            <LayoutGrid className="w-3 h-3" />
            {filteredBoards.length} Boards
          </span>
        </div>
      </div>

      {/* Board Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
        {filteredBoards.map((board) => (
          <BoardCard
            key={board.id}
            board={board}
            onClick={() => onSelectBoard(board.id)}
            onContextMenu={(e) => {
              e.preventDefault()
              e.stopPropagation()
              setContextMenu({ x: e.clientX, y: e.clientY, boardId: board.id })
            }}
          />
        ))}

        {filteredBoards.length === 0 && (
          <div
            className="col-span-full py-20 text-center border-4 border-dashed flex flex-col items-center justify-center"
            style={{ borderColor: 'var(--color-border)', background: 'var(--color-surface)' }}
          >
            <div
              className="w-16 h-16 border-4 flex items-center justify-center mb-4"
              style={{
                borderColor: projectColor,
                color: projectColor,
                boxShadow: `4px 4px 0 ${projectColor}`
              }}
            >
              <Plus className="w-8 h-8 stroke-[3px]" />
            </div>
            <h3 className="text-xl font-black uppercase tracking-tight mb-1" style={{ color: 'var(--color-text)' }}>
              No Boards
            </h3>
            <p className="text-sm font-bold" style={{ color: 'var(--color-muted)' }}>
              Create the first board in this project
            </p>
            <button
              onClick={() => setShowCreateBoard(true)}
              className="btn-primary mt-6 text-xs uppercase tracking-wider"
            >
              <Plus className="w-4 h-4 stroke-[3px]" />
              Create Board
            </button>
          </div>
        )}
      </div>

      {showCreateBoard && (
        <ProjectModal
          title="Create Board"
          onClose={() => setShowCreateBoard(false)}
          onCreate={handleCreateBoard}
        />
      )}

      {showEditProject && (
        <ProjectModal
          title="Edit Project"
          initialData={project}
          onClose={() => setShowEditProject(false)}
          onCreate={handleUpdateProject}
        />
      )}

      {editingBoard && (
        <ProjectModal
          title="Edit Board"
          initialData={editingBoard}
          onClose={() => setEditingBoard(null)}
          onCreate={handleUpdateBoard}
        />
      )}

      {/* Context Menu */}
      {contextMenu && (
        <div
          className="context-menu fixed z-50 min-w-[180px] animate-brutal-in"
          style={{
            top: Math.min(contextMenu.y, window.innerHeight - 150),
            left: Math.min(contextMenu.x, window.innerWidth - 200),
            background: 'var(--color-surface)',
            border: '3px solid var(--color-border-strong)',
            boxShadow: '4px 4px 0 var(--color-border-strong)'
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <div
            className="px-4 py-2 text-xs font-black uppercase tracking-widest text-white border-b-2 truncate"
            style={{ background: 'var(--color-primary)', borderColor: 'var(--color-border-strong)' }}
          >
            {boards.find(b => b.id === contextMenu.boardId)?.name || 'Board'}
          </div>
          <button
            className="w-full flex items-center gap-2 px-4 py-2 text-xs font-bold transition hover:bg-primary-soft border-b-2"
            style={{ borderColor: 'var(--color-border)', color: 'var(--color-text)' }}
            onClick={() => {
              const b = boards.find(b => b.id === contextMenu.boardId)
              if (b) setEditingBoard(b)
              setContextMenu(null)
            }}
          >
            <Edit2 className="w-4 h-4" />
            Edit Board
          </button>
          <button
            className="w-full flex items-center gap-2 px-4 py-2 text-xs font-bold transition duration-100 hover:bg-red-50"
            style={{ color: 'var(--color-alert, #dc2626)' }}
            onClick={() => handleDeleteBoard(contextMenu.boardId)}
          >
            <Trash2 className="w-4 h-4" />
            Delete Board
          </button>
        </div>
      )}
    </div>
  )
}
