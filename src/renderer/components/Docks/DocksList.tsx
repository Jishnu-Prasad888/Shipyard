import React, { useEffect, useState } from 'react'
import { Plus, Edit2, Tag, LayoutGrid, Trash2 } from 'lucide-react'
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
  const [editingBoard, setEditingBoard] = useState<any>(null)
  const [contextMenu, setContextMenu] = useState<{ x: number, y: number, boardId: string } | null>(null)

  useEffect(() => {
    const handleReload = () => loadData()
    window.addEventListener('reload-docks', handleReload)
    const handleClick = () => setContextMenu(null)
    const handleContextClick = (e: MouseEvent) => {
      if (e.target instanceof Element && e.target.closest('.context-menu')) return
      setContextMenu(null)
    }
    
    window.addEventListener('click', handleClick)
    window.addEventListener('contextmenu', handleContextClick, { capture: true })
    
    return () => {
      window.removeEventListener('reload-docks', handleReload)
      window.removeEventListener('click', handleClick)
      window.removeEventListener('contextmenu', handleContextClick, { capture: true })
    }
  }, [dockId]) // dockId isn't really needed for these global listeners but safe to re-bind

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

    const allCards = await window.electron.db.findAll('cards')
    const boardCards = allCards.filter((c: any) => c.boardId === boardIdToDelete)
    const allSubCards = await window.electron.db.findAll('subcards')
    const boardSubCards = allSubCards.filter((sc: any) => boardCards.some((c: any) => c.id === sc.cardId))
    const allLists = await window.electron.db.findAll('lists')
    const boardLists = allLists.filter((l: any) => l.boardId === boardIdToDelete)

    // Delete everything
    for (const card of boardCards) await window.electron.db.delete('cards', card.id)
    for (const list of boardLists) await window.electron.db.delete('lists', list.id)
    await window.electron.db.delete('boards', boardIdToDelete)

    // Also remove from dock.boardIds
    if (dock) {
      const boardIds = (() => {
        try { return JSON.parse(dock.boardIds || '[]') } catch { return [] }
      })()
      const newBoardIds = boardIds.filter((id: string) => id !== boardIdToDelete)
      await window.electron.db.update('docks', dock.id, { boardIds: JSON.stringify(newBoardIds) })
    }

    loadData()

    window.dispatchEvent(
      new CustomEvent('show-toast', {
        detail: {
          message: `Ship "${boardSnapshot.name}" jettisoned`,
          onUndo: async () => {
            await window.electron.db.create('boards', boardSnapshot)
            for (const list of boardLists) await window.electron.db.create('lists', list)
            for (const card of boardCards) await window.electron.db.create('cards', card)
            for (const sc of boardSubCards) await window.electron.db.create('subcards', sc)
            if (dock) {
              const bIds = (() => { try { return JSON.parse(dock.boardIds || '[]') } catch { return [] } })()
              bIds.push(boardIdToDelete)
              await window.electron.db.update('docks', dock.id, { boardIds: JSON.stringify(bIds) })
            }
            loadData()
          }
        }
      })
    )
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
            Launch Ship
          </button>
        </div>

        <div className="mt-3 pt-3 border-t-2 flex items-center gap-4" style={{ borderColor: 'var(--color-border)' }}>
          <span
            className="flex items-center gap-1.5 text-xs font-black uppercase tracking-wider px-2 py-1 border-2"
            style={{ borderColor: dockColor, color: dockColor, background: dockColor + '10' }}
          >
            <LayoutGrid className="w-3 h-3" />
            {filteredBoards.length} Ships
          </span>
        </div>
      </div>

      {/* Board Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
        {filteredBoards.map((board) => (
          <DockCard
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
                borderColor: dockColor,
                color: dockColor,
                boxShadow: `4px 4px 0 ${dockColor}`
              }}
            >
              <Plus className="w-8 h-8 stroke-[3px]" />
            </div>
            <h3 className="text-xl font-black uppercase tracking-tight mb-1" style={{ color: 'var(--color-text)' }}>
              No Ships Docked
            </h3>
            <p className="text-sm font-bold" style={{ color: 'var(--color-muted)' }}>
              Create your first Ship to set sail in this dock
            </p>
            <button
              onClick={() => setShowCreateBoard(true)}
              className="btn-primary mt-6 text-xs uppercase tracking-wider"
            >
              <Plus className="w-4 h-4 stroke-[3px]" />
              Launch Ship
            </button>
          </div>
        )}
      </div>

      {showCreateBoard && (
        <CreateDockModal
          title="Launch New Ship"
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

      {editingBoard && (
        <CreateDockModal
          title="Edit Ship Properties"
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
            {boards.find(b => b.id === contextMenu.boardId)?.name || 'Ship'}
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
            Edit Ship Properties
          </button>
          <button
            className="w-full flex items-center gap-2 px-4 py-2 text-xs font-bold transition duration-100 hover:bg-red-50"
            style={{ color: 'var(--color-alert, #dc2626)' }}
            onClick={() => handleDeleteBoard(contextMenu.boardId)}
          >
            <Trash2 className="w-4 h-4" />
            Jettison Ship
          </button>
        </div>
      )}
    </div>
  )
}
