import React, { useEffect, useState } from 'react'
import { Folder, Grid, Plus, ChevronDown, ChevronRight } from 'lucide-react'
import { CreateDockModal } from '../Docks/CreateDockModel'
import {
  DndContext,
  DragEndEvent,
  useDroppable,
  useDraggable,
  useSensors,
  useSensor,
  PointerSensor
} from '@dnd-kit/core'

interface SidebarProps {
  onSelectDock: (dockId: string) => void
  selectedDockId: string | null
  onSelectBoard: (boardId: string) => void
  selectedBoardId: string | null
}

export const Sidebar: React.FC<SidebarProps> = ({
  onSelectDock,
  selectedDockId,
  onSelectBoard,
  selectedBoardId
}) => {
  const [docks, setDocks] = useState<any[]>([])
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set())
  const [folders, setFolders] = useState<any[]>([])
  const [contextMenu, setContextMenu] = useState<{
    x: number
    y: number
    folderId: string | null
  } | null>(null)
  const [targetFolderId, setTargetFolderId] = useState<string | null>(null)
  const [showCreateDock, setShowCreateDock] = useState(false)
  const [showCreateFolder, setShowCreateFolder] = useState(false)
  const [newFolderName, setNewFolderName] = useState('')

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8
      }
    })
  )

  useEffect(() => {
    loadDocks()
    loadFolders()
  }, [])

  useEffect(() => {
    const handleClick = () => setContextMenu(null)
    window.addEventListener('click', handleClick)
    return () => window.removeEventListener('click', handleClick)
  }, [])

  const loadDocks = async () => {
    const docksData = await window.electron.db.findAll('docks')
    setDocks(docksData)
  }

  const loadFolders = async () => {
    const foldersData = await window.electron.db.findAll('folders')
    setFolders(foldersData)
  }

  const toggleFolder = (folderId: string) => {
    const newExpanded = new Set(expandedFolders)
    if (newExpanded.has(folderId)) {
      newExpanded.delete(folderId)
    } else {
      newExpanded.add(folderId)
    }
    setExpandedFolders(newExpanded)
  }

  const handleCreateNewDock = async (dockData: any) => {
    const newDock = {
      name: dockData.name,
      tags: JSON.stringify([]),
      folderId: targetFolderId,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      boardIds: JSON.stringify([])
    }

    await window.electron.db.create('docks', newDock)
    loadDocks()
    setShowCreateDock(false)
    setTargetFolderId(null)

    // Automatically expand the folder we just added to
    if (targetFolderId && !expandedFolders.has(targetFolderId)) {
      setExpandedFolders((prev) => {
        const next = new Set(prev)
        next.add(targetFolderId)
        return next
      })
    }
  }

  const handleCreateNewFolder = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newFolderName.trim()) return

    const newFolder = {
      name: newFolderName.trim(),
      color: '#0ea5b7',
      createdAt: Date.now()
    }

    await window.electron.db.create('folders', newFolder)
    loadFolders()
    setShowCreateFolder(false)
    setNewFolderName('')
  }

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event
    if (!over) return

    if (active.data.current?.type === 'dock' && over.data.current?.type === 'folder') {
      const dockId = active.id as string
      const folderId = over.id === 'uncategorized' ? null : (over.id as string)

      await window.electron.db.update('docks', dockId, { folderId })
      loadDocks()
    }
  }

  const openContextMenu = (e: React.MouseEvent, folderId: string | null) => {
    e.preventDefault()
    setContextMenu({ x: e.clientX, y: e.clientY, folderId })
  }

  const docksByFolder = docks.reduce(
    (acc, dock) => {
      const folderId = dock.folderId || 'uncategorized'
      if (!acc[folderId]) acc[folderId] = []
      acc[folderId].push(dock)
      return acc
    },
    {} as Record<string, any[]>
  )

  return (
    <aside className="w-64 border-r border-border surface flex flex-col relative">
      <div className="p-4 border-b border-border">
        <button
          onClick={() => {
            setTargetFolderId(null)
            setShowCreateDock(true)
          }}
          className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-primary text-white rounded-lg hover:bg-opacity-90 transition font-medium"
        >
          <Plus className="w-4 h-4" />
          New Board
        </button>
      </div>

      <div className="flex-1 overflow-auto p-2">
        <div className="space-y-1">
          <button
            onClick={() => setShowCreateFolder(true)}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-primary-soft transition text-left text-sm"
          >
            <Folder className="w-4 h-4 text-primary" />
            <span className="flex-1">New Folder</span>
            <Plus className="w-4 h-4 text-muted" />
          </button>
        </div>

        <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
          <div className="mt-4 space-y-2 pb-10">
            {folders.map((folder) => (
              <DroppableFolder
                key={folder.id}
                folder={folder}
                docks={docksByFolder[folder.id] || []}
                isExpanded={expandedFolders.has(folder.id)}
                onToggle={() => toggleFolder(folder.id)}
                onContextMenu={(e) => openContextMenu(e, folder.id)}
                onSelectDock={onSelectDock}
                selectedDockId={selectedDockId}
                onSelectBoard={onSelectBoard}
                selectedBoardId={selectedBoardId}
              />
            ))}

            <DroppableUncategorized
              docks={docksByFolder['uncategorized'] || []}
              onContextMenu={(e) => openContextMenu(e, null)}
              onSelectDock={onSelectDock}
              selectedDockId={selectedDockId}
              onSelectBoard={onSelectBoard}
              selectedBoardId={selectedBoardId}
            />
          </div>
        </DndContext>
      </div>

      {contextMenu && (
        <div
          className="fixed bg-surface border border-border rounded-lg shadow-xl z-50 py-1 min-w-[160px]"
          style={{ top: contextMenu.y, left: contextMenu.x }}
        >
          <button
            className="w-full text-left px-4 py-2 hover:bg-primary-soft text-sm flex items-center gap-2"
            onClick={() => {
              setTargetFolderId(contextMenu.folderId)
              setShowCreateDock(true)
              setContextMenu(null)
            }}
          >
            <Plus className="w-4 h-4" />
            New Board Here
          </button>
        </div>
      )}

      {showCreateDock && (
        <CreateDockModal onClose={() => setShowCreateDock(false)} onCreate={handleCreateNewDock} />
      )}

      {showCreateFolder && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="w-full max-w-md surface rounded-xl">
            <div className="flex items-center justify-between p-4 border-b border-border">
              <h2 className="text-lg font-bold">Create Folder</h2>
              <button
                onClick={() => setShowCreateFolder(false)}
                className="p-2 rounded-lg hover:bg-primary-soft transition"
              >
                <Plus className="w-5 h-5 rotate-45" />
              </button>
            </div>

            <form onSubmit={handleCreateNewFolder} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">Folder Name *</label>
                <input
                  type="text"
                  value={newFolderName}
                  onChange={(e) => setNewFolderName(e.target.value)}
                  className="w-full px-3 py-2 border border-border rounded-lg bg-surface text-text focus:outline-none focus:border-primary"
                  placeholder="Folder name"
                  autoFocus
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowCreateFolder(false)}
                  className="px-4 py-2 border border-border rounded-lg hover:bg-primary-soft transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!newFolderName.trim()}
                  className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-opacity-90 transition disabled:opacity-50"
                >
                  Create Folder
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </aside>
  )
}

const DroppableFolder: React.FC<{
  folder: any
  docks: any[]
  isExpanded: boolean
  onToggle: () => void
  onContextMenu: (e: React.MouseEvent) => void
  onSelectDock: (id: string) => void
  selectedDockId: string | null
  onSelectBoard: (id: string) => void
  selectedBoardId: string | null
}> = ({
  folder,
  docks,
  isExpanded,
  onToggle,
  onContextMenu,
  onSelectDock,
  selectedDockId,
  onSelectBoard,
  selectedBoardId
}) => {
  const { isOver, setNodeRef } = useDroppable({
    id: folder.id,
    data: { type: 'folder' }
  })

  return (
    <div
      ref={setNodeRef}
      className={`rounded-lg transition ${isOver ? 'ring-2 ring-primary ring-inset bg-primary-soft' : ''}`}
    >
      <button
        onClick={onToggle}
        onContextMenu={onContextMenu}
        className="w-full flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-primary-soft transition"
      >
        {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
        <Folder className="w-4 h-4" style={{ color: folder.color || '#0ea5b7' }} />
        <span className="flex-1 text-left text-sm truncate">{folder.name}</span>
        <span className="text-xs text-muted">{docks.length}</span>
      </button>

      {isExpanded && (
        <div className="ml-6 mt-1 space-y-1">
          {docks.map((dock: any) => (
            <SidebarDockItem
              key={dock.id}
              dock={dock}
              isSelected={selectedDockId === dock.id}
              onSelect={onSelectDock}
              onSelectBoard={onSelectBoard}
              selectedBoardId={selectedBoardId}
            />
          ))}
          {docks.length === 0 && (
            <p className="text-xs text-muted px-3 py-1 italic">Empty folder</p>
          )}
        </div>
      )}
    </div>
  )
}

const DroppableUncategorized: React.FC<{
  docks: any[]
  onContextMenu: (e: React.MouseEvent) => void
  onSelectDock: (id: string) => void
  selectedDockId: string | null
  onSelectBoard: (id: string) => void
  selectedBoardId: string | null
}> = ({ docks, onContextMenu, onSelectDock, selectedDockId, onSelectBoard, selectedBoardId }) => {
  const { isOver, setNodeRef } = useDroppable({
    id: 'uncategorized',
    data: { type: 'folder' }
  })

  // Only render if there are uncategorized items or if dragging over
  if (docks.length === 0 && !isOver) return null

  return (
    <div
      ref={setNodeRef}
      className={`mt-4 rounded-lg transition ${isOver ? 'ring-2 ring-primary ring-inset bg-primary-soft pb-2 pt-2' : ''}`}
      onContextMenu={onContextMenu}
    >
      <div className="px-3 py-1 text-xs font-medium text-muted uppercase tracking-wide">
        Uncategorized
      </div>
      <div className="space-y-1">
        {docks.map((dock: any) => (
          <SidebarDockItem
            key={dock.id}
            dock={dock}
            isSelected={selectedDockId === dock.id}
            onSelect={onSelectDock}
            onSelectBoard={onSelectBoard}
            selectedBoardId={selectedBoardId}
          />
        ))}
      </div>
    </div>
  )
}

interface SidebarDockItemProps {
  dock: any
  isSelected: boolean
  onSelect: (dockId: string) => void
  onSelectBoard: (boardId: string) => void
  selectedBoardId: string | null
}

const SidebarDockItem: React.FC<SidebarDockItemProps> = ({
  dock,
  isSelected,
  onSelect,
  onSelectBoard,
  selectedBoardId
}) => {
  const [boards, setBoards] = useState<any[]>([])
  const [expanded, setExpanded] = useState(false)

  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: dock.id,
    data: { type: 'dock', dock }
  })

  useEffect(() => {
    if (expanded) {
      loadBoards()
    }
  }, [expanded])

  const loadBoards = async () => {
    // Load boards by dockId query
    const allBoards = await window.electron.db.findAll('boards')
    const dockBoards = allBoards.filter((b: any) => b.dockId === dock.id)
    setBoards(dockBoards)
  }

  // Use a wrapper div for DND attributes, and only pass listeners to the drag handle portion
  // so that clicks continue to work properly.
  return (
    <div ref={setNodeRef} className={isDragging ? 'opacity-50' : ''}>
      <div className="flex w-full items-center">
        <button
          onClick={() => {
            onSelect(dock.id)
            setExpanded(!expanded)
          }}
          className={`flex-1 flex items-center gap-2 px-3 py-2 rounded-l-lg transition text-sm cursor-pointer ${
            isSelected ? 'bg-primary-soft text-primary' : 'hover:bg-primary-soft'
          }`}
        >
          {expanded ? (
            <ChevronDown className="w-3.5 h-3.5" />
          ) : (
            <ChevronRight className="w-3.5 h-3.5" />
          )}
          <Grid className="w-4 h-4" style={{ color: dock.color || '#0ea5b7' }} />
          <span className="flex-1 text-left truncate">{dock.name}</span>
        </button>
        <div
          {...listeners}
          {...attributes}
          className="px-2 py-2 cursor-grab active:cursor-grabbing hover:bg-border/50 rounded-r-lg opacity-30 hover:opacity-100 transition h-full flex items-center justify-center"
        >
          <div className="w-1.5 h-4 flex flex-col justify-between items-center opacity-50">
            <div className="w-1 h-1 rounded-full bg-text"></div>
            <div className="w-1 h-1 rounded-full bg-text"></div>
            <div className="w-1 h-1 rounded-full bg-text"></div>
          </div>
        </div>
      </div>

      {expanded && (
        <div className="ml-8 mt-1 space-y-1">
          {boards.map((board) => (
            <button
              key={board.id}
              onClick={() => onSelectBoard(board.id)}
              className={`w-full text-left px-3 py-1.5 rounded-lg text-xs transition ${
                selectedBoardId === board.id
                  ? 'bg-primary-soft text-primary font-medium'
                  : 'hover:bg-primary-soft text-muted hover:text-text'
              }`}
            >
              {board.name}
            </button>
          ))}
          {boards.length === 0 && <p className="text-xs text-muted px-3 py-1 italic">No boards</p>}
        </div>
      )}
    </div>
  )
}
