import React, { useEffect, useState } from 'react'
import { Plus } from 'lucide-react'
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
      // Load boards for this dock
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

    const created = await window.electron.db.create('boards', newBoard)

    // Update dock boardIds
    if (dock) {
      const boardIds =
        typeof dock.boardIds === 'string' ? JSON.parse(dock.boardIds || '[]') : dock.boardIds || []
      boardIds.push(created.id)
      await window.electron.db.update('docks', dockId, {
        boardIds: JSON.stringify(boardIds),
        updatedAt: Date.now()
      })
    }

    loadData()
    setShowCreateBoard(false)
  }

  if (!dock) return null

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{dock.name}</h1>
          {dock.description && <p className="text-muted mt-1">{dock.description}</p>}
        </div>

        <button
          onClick={() => setShowCreateBoard(true)}
          className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg hover:bg-opacity-90 transition"
        >
          <Plus className="w-4 h-4" />
          New Board
        </button>
      </div>

      {filteredBoards.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredBoards.map((board) => (
            <DockCard key={board.id} board={board} onClick={() => onSelectBoard(board.id)} />
          ))}
        </div>
      ) : (
        <div className="text-center py-20 text-muted">
          <p className="text-lg mb-2">No boards yet</p>
          <p className="text-sm">Create your first board to get started</p>
        </div>
      )}

      {showCreateBoard && (
        <CreateDockModal onClose={() => setShowCreateBoard(false)} onCreate={handleCreateBoard} />
      )}
    </div>
  )
}
