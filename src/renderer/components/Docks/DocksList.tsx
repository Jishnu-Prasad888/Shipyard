import React, { useEffect, useState } from 'react'
import { Plus, Edit2, Tag, LayoutGrid } from 'lucide-react'
import { DockCard } from './DockCard'
import { CreateDockModal } from './CreateDockModel'

interface DocksListProps {
  dockId: string
  onSelectBoard: (boardId: string) => void
  searchQuery: string
}

export const DocksList: React.FC<DocksListProps> = ({ dockId, onSelectBoard, searchQuery }) => {
  const [dock, setDock] = useState<any>(null)
  const [boards, setBoards] = useState<any[]>([])
  const [filteredBoards, setFilteredBoards] = useState<any[]>([])
  const [showCreateBoard, setShowCreateBoard] = useState(false)
  const [showEditDock, setShowEditDock] = useState(false)

  useEffect(() => {
    loadData()
  }, [dockId])

  useEffect(() => {
    filterBoards()
  }, [boards, searchQuery])

  const loadData = async () => {
    const dockData = await window.electron.db.findById('docks', dockId)
    setDock(dockData)

    if (dockData) {
      const allBoards = await window.electron.db.findAll('boards')
      const dockBoards = allBoards.filter((b: any) => b.dockId === dockId)
      setBoards(dockBoards)
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
      dockId,
      createdAt: Date.now(),
      updatedAt: Date.now()
    }

    try {
      const created = await window.electron.db.create('boards', newBoard)

      if (dock && created && created.id) {
        const boardIds = (() => {
          if (!dock.boardIds) return []
          if (Array.isArray(dock.boardIds)) return dock.boardIds
          try {
            return JSON.parse(dock.boardIds)
          } catch {
            return []
          }
        })()

        boardIds.push(created.id)
        await window.electron.db.update('docks', dockId, {
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

  const handleUpdateDock = async (dockData: any) => {
    await window.electron.db.update('docks', dockId, {
      ...dockData,
      updatedAt: Date.now()
    })
    loadData()
    setShowEditDock(false)
  }

  if (!dock) return null

  const dockColor = dock.color || '#2563eb'

  const tags = (() => {
    if (!dock.tags) return []
    if (Array.isArray(dock.tags)) return dock.tags
    try {
      return JSON.parse(dock.tags)
    } catch {
      return []
    }
  })()

  return (
    <div className="space-y-6">
      {/* Dock header */}
      <div
        className="p-5 border-4"
        style={{
          borderColor: dockColor,
          boxShadow: `6px 6px 0 ${dockColor}`,
          background: 'var(--color-surface)'
        }}
      >
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <div className="flex items-center gap-3">
              <div
                className="w-5 h-5 border-2"
                style={{ backgroundColor: dockColor, borderColor: 'var(--color-border-strong)' }}
              />
              <h1 className="text-2xl font-black uppercase tracking-tight" style={{ color: 'var(--color-text)' }}>
                {dock.name}
              </h1>
              <button
                onClick={() => setShowEditDock(true)}
                className="p-1.5 border-2 transition-all duration-100 hover:-translate-x-0.5 hover:-translate-y-0.5"
                style={{
                  borderColor: 'var(--color-border)',
                  color: 'var(--color-muted)',
                  boxShadow: 'var(--shadow-brutal-sm)'
                }}
                title="Edit dock properties"
              >
                <Edit2 className="w-3.5 h-3.5" />
              </button>
            </div>

            {dock.description && (
              <p
                className="mt-2 text-sm font-bold max-w-2xl"
                style={{ color: 'var(--color-muted)' }}
              >
                {dock.description}
              </p>
            )}

            {tags.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-3">
                {tags.map((tag: string) => (
                  <span
                    key={tag}
                    className="flex items-center gap-1 px-2 py-1 text-xs font-black uppercase tracking-wider border-2"
                    style={{
                      borderColor: dockColor,
                      color: dockColor,
                      background: dockColor + '15'
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
            New Board
          </button>
        </div>

        <div className="mt-3 pt-3 border-t-2 flex items-center gap-4" style={{ borderColor: 'var(--color-border)' }}>
          <span
            className="flex items-center gap-1.5 text-xs font-black uppercase tracking-wider px-2 py-1 border-2"
            style={{ borderColor: dockColor, color: dockColor, background: dockColor + '10' }}
          >
            <LayoutGrid className="w-3 h-3" />
            {filteredBoards.length} Boards
          </span>
        </div>
      </div>

      {/* Board Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
        {filteredBoards.map((board) => (
          <DockCard key={board.id} board={board} onClick={() => onSelectBoard(board.id)} />
        ))}

        {filteredBoards.length === 0 && (
          <div
            className="col-span-full py-20 text-center border-4 border-dashed flex flex-col items-center justify-center"
            style={{ borderColor: 'var(--color-border)', background: 'var(--color-surface)' }}
          >
            <div
              className="w-16 h-16 border-4 flex items-center justify-center mb-4"
              style={{
                borderColor: dockColor,
                color: dockColor,
                boxShadow: `4px 4px 0 ${dockColor}`
              }}
            >
              <Plus className="w-8 h-8 stroke-[3px]" />
            </div>
            <h3 className="text-xl font-black uppercase tracking-tight mb-1" style={{ color: 'var(--color-text)' }}>
              No Boards Yet
            </h3>
            <p className="text-sm font-bold" style={{ color: 'var(--color-muted)' }}>
              Create your first Kanban board in this dock
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
        <CreateDockModal
          title="Create New Kanban Board"
          onClose={() => setShowCreateBoard(false)}
          onCreate={handleCreateBoard}
        />
      )}

      {showEditDock && (
        <CreateDockModal
          title="Edit Dock Properties"
          initialData={dock}
          onClose={() => setShowEditDock(false)}
          onCreate={handleUpdateDock}
        />
      )}
    </div>
  )
}
