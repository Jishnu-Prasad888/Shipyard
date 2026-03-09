import React, { useEffect, useState } from 'react'
import { Plus, Edit2, Tag } from 'lucide-react'
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
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-bold flex items-center gap-3">
              <div className="w-4 h-4 rounded-full" style={{ backgroundColor: dock.color || '#0ea5b7' }} />
              {dock.name}
            </h1>
            <button 
              onClick={() => setShowEditDock(true)}
              className="p-1.5 rounded-lg hover:bg-primary-soft text-muted hover:text-primary transition"
            >
              <Edit2 className="w-4 h-4" />
            </button>
          </div>
          
          {dock.description && (
            <p className="text-muted mt-2 text-lg max-w-2xl">{dock.description}</p>
          )}

          {tags.length > 0 && (
            <div className="flex flex-wrap gap-2 mt-4">
              {tags.map((tag: string) => (
                <span key={tag} className="flex items-center gap-1.5 px-2.5 py-1 bg-primary-soft text-primary rounded-lg text-xs font-semibold">
                  <Tag className="w-3 h-3" />
                  {tag}
                </span>
              ))}
            </div>
          )}
        </div>

        <button
          onClick={() => setShowCreateBoard(true)}
          className="flex items-center gap-2 px-6 py-2.5 bg-primary text-white rounded-xl hover:bg-opacity-90 transition shadow-lg shadow-primary/20 font-medium"
        >
          <Plus className="w-5 h-5" />
          Add Kanban Board
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
        {filteredBoards.map((board) => (
          <DockCard key={board.id} board={board} onClick={() => onSelectBoard(board.id)} />
        ))}
        {filteredBoards.length === 0 && (
           <div className="col-span-full py-20 text-center border-2 border-dashed border-border rounded-2xl flex flex-col items-center justify-center bg-surface/50">
             <div className="w-16 h-16 bg-primary-soft text-primary rounded-2xl flex items-center justify-center mb-4">
                <Plus className="w-8 h-8" />
             </div>
             <h3 className="text-xl font-bold mb-1">Create your first board</h3>
             <p className="text-muted">Start organizing your tasks in this container</p>
             <button
               onClick={() => setShowCreateBoard(true)}
               className="mt-6 px-4 py-2 bg-primary text-white rounded-lg hover:bg-opacity-90 transition font-medium"
             >
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
          title="Edit Properties"
          initialData={dock}
          onClose={() => setShowEditDock(false)}
          onCreate={handleUpdateDock}
        />
      )}
    </div>
  )
}

