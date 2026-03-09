import React, { useEffect, useState } from 'react'
import { Folder, Grid, Plus, ChevronDown, ChevronRight, Palette } from 'lucide-react'
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
  searchQuery?: string
}

const COLORS = [
  '#ef4444',
  '#f97316',
  '#eab308',
  '#22c55e',
  '#0ea5b7',
  '#3b82f6',
  '#a855f7',
  '#ec4899',
  '#64748b',
  '#ffffff'
]

export const Sidebar: React.FC<SidebarProps> = ({
  onSelectDock,
  selectedDockId,
  onSelectBoard,
  selectedBoardId,
  searchQuery = ''
}) => {
  const [docks, setDocks] = useState<any[]>([])
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set())
  const [folders, setFolders] = useState<any[]>([])
  const [contextMenu, setContextMenu] = useState<{
    x: number
    y: number
    type: 'folder' | 'dock' | 'uncategorized'
    targetId: string | null
  } | null>(null)
  const [targetParentId, setTargetParentId] = useState<string | null>(null)

  const [showCreateDock, setShowCreateDock] = useState(false)
  const [editingDock, setEditingDock] = useState<any | null>(null)
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
    const handleClick = () => {
      setContextMenu(null)
    }
    window.addEventListener('click', handleClick)
    return () => window.removeEventListener('click', handleClick)
  }, [])

  useEffect(() => {
    if (searchQuery) {
      const matchIds = new Set<string>()

      const checkFolder = (folderId: string) => {
        const folder = folders.find((f) => f.id === folderId)
        if (!folder) return false

        const nameMatches = folder.name.toLowerCase().includes(searchQuery.toLowerCase())
        const dockMatches = (docksByFolder[folderId] || []).some((d: any) =>
          d.name.toLowerCase().includes(searchQuery.toLowerCase())
        )

        let subMatches = false
        const subFolders = folders.filter((f) => f.parentId === folderId)
        for (const sub of subFolders) {
          if (checkFolder(sub.id)) subMatches = true
        }

        if (nameMatches || dockMatches || subMatches) {
          matchIds.add(folderId)
          return true
        }
        return false
      }

      folders.forEach((f) => checkFolder(f.id))

      if (matchIds.size > 0) {
        setExpandedFolders((prev) => {
          const next = new Set(prev)
          matchIds.forEach((id) => next.add(id))
          return next
        })
      }
    }
  }, [searchQuery, folders, docks])

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
    try {
      const newDock = {
        name: dockData.name,
        description: dockData.description || '',
        color: dockData.color || '#0ea5b7',
        tags: dockData.tags || JSON.stringify([]),
        folderId: targetParentId,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        boardIds: JSON.stringify([])
      }

      await window.electron.db.create('docks', newDock)
      loadDocks()
      setShowCreateDock(false)
      setTargetParentId(null)
      
      if (targetParentId && !expandedFolders.has(targetParentId)) {
        setExpandedFolders(prev => {
          const next = new Set(prev)
          next.add(targetParentId)
          return next
        })
      }
    } catch (err) {
      console.error('Failed to create dock:', err)
      alert('Could not create dock. Please check database.')
    }
  }

  const handleUpdateDock = async (dockData: any) => {
    if (!editingDock) return
    
    const update = {
      name: dockData.name,
      description: dockData.description,
      color: dockData.color,
      tags: dockData.tags,
      updatedAt: Date.now()
    }

    await window.electron.db.update('docks', editingDock.id, update)
    loadDocks()
    setEditingDock(null)
  }

  const handleCreateNewFolder = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newFolderName.trim()) return

    const newFolder = {
      name: newFolderName.trim(),
      color: '#0ea5b7',
      parentId: targetParentId,
      createdAt: Date.now()
    }

    await window.electron.db.create('folders', newFolder)
    loadFolders()
    setShowCreateFolder(false)
    setNewFolderName('')
    setTargetParentId(null)

    if (targetParentId && !expandedFolders.has(targetParentId)) {
      setExpandedFolders((prev) => {
        const next = new Set(prev)
        next.add(targetParentId)
        return next
      })
    }
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

  const openContextMenu = (
    e: React.MouseEvent,
    type: 'folder' | 'dock' | 'uncategorized',
    targetId: string | null
  ) => {
    e.preventDefault()
    e.stopPropagation()
    setContextMenu({ x: e.clientX, y: e.clientY, type, targetId })
  }

  const changeColor = async (color: string) => {
    if (!contextMenu) return
    const { type, targetId } = contextMenu
    if (targetId) {
      if (type === 'folder') {
        await window.electron.db.update('folders', targetId, { color })
        loadFolders()
      } else if (type === 'dock') {
        await window.electron.db.update('docks', targetId, { color })
        loadDocks()
      }
    }
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

  const renderFolderTree = (parentId: string | null = null, depth: number = 0) => {
    const currentLevelFolders = folders.filter((f) => (f.parentId || null) === parentId)

    // Check if this branch has any matches (to hide empty branches during search)
    const hasMatches = (folder: any): boolean => {
      if (!searchQuery) return true
      if (folder.name.toLowerCase().includes(searchQuery.toLowerCase())) return true
      if (
        (docksByFolder[folder.id] || []).some((d: any) =>
          d.name.toLowerCase().includes(searchQuery.toLowerCase())
        )
      )
        return true

      const subFolders = folders.filter((f) => f.parentId === folder.id)
      return subFolders.some((s) => hasMatches(s))
    }

    const filteredLevelFolders = searchQuery
      ? currentLevelFolders.filter((f) => hasMatches(f))
      : currentLevelFolders

    return filteredLevelFolders.map((folder) => {
      const folderDocks = docksByFolder[folder.id] || []
      const filteredDocks = searchQuery
        ? folderDocks.filter((d: any) => d.name.toLowerCase().includes(searchQuery.toLowerCase()))
        : folderDocks

      return (
        <div key={folder.id} className="relative">
          <DroppableFolder
            folder={folder}
            depth={depth}
            isExpanded={expandedFolders.has(folder.id)}
            onToggle={() => toggleFolder(folder.id)}
            onContextMenu={(e) => openContextMenu(e, 'folder', folder.id)}
          />

          {expandedFolders.has(folder.id) && (
            <div className="mt-1 space-y-1">
              {renderFolderTree(folder.id, depth + 1)}

              {/* Show docks for this folder directly below its subfolders */}
              {filteredDocks.map((dock: any) => (
                <SidebarDockItem
                  key={dock.id}
                  dock={dock}
                  depth={depth + 1}
                  isSelected={selectedDockId === dock.id}
                  onContextMenu={(e) => openContextMenu(e, 'dock', dock.id)}
                  onSelect={onSelectDock}
                  onSelectBoard={onSelectBoard}
                  selectedBoardId={selectedBoardId}
                />
              ))}

              {filteredLevelFolders.length === 0 && filteredDocks.length === 0 && (
                <p
                  className="text-xs text-muted px-4 py-1 italic"
                  style={{ paddingLeft: `${(depth + 1) * 0.75 + 1}rem` }}
                >
                  Empty folder
                </p>
              )}
            </div>
          )}
        </div>
      )
    })
  }

  const uncategorizedDocksOriginal = docksByFolder['uncategorized'] || []
  const uncategorizedDocksFiltered = searchQuery
    ? uncategorizedDocksOriginal.filter((d: any) =>
        d.name.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : uncategorizedDocksOriginal

  return (
    <aside className="w-64 border-r border-border surface flex flex-col relative h-full">
      <div className="p-4 border-b border-border">
        <button
          onClick={() => {
            setTargetParentId(null)
            setShowCreateDock(true)
          }}
          className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-primary text-white rounded-lg hover:bg-opacity-90 transition font-medium"
        >
          <Plus className="w-4 h-4" />
          New Board
        </button>
      </div>

      <div className="flex-1 overflow-auto p-2 pb-20">
        <div className="space-y-1">
          <button
            onClick={() => {
              setTargetParentId(null)
              setShowCreateFolder(true)
            }}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-primary-soft transition text-left text-sm"
          >
            <Folder className="w-4 h-4 text-primary" />
            <span className="flex-1">New Folder</span>
            <Plus className="w-4 h-4 text-muted" />
          </button>
        </div>

        <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
          <div className="mt-4 space-y-2">
            {renderFolderTree(null, 0)}

            <DroppableUncategorized
              docks={uncategorizedDocksFiltered}
              onContextMenu={(e) => openContextMenu(e, 'uncategorized', null)}
            >
              {uncategorizedDocksFiltered.map((dock: any) => (
                <SidebarDockItem
                  key={dock.id}
                  dock={dock}
                  depth={0}
                  isSelected={selectedDockId === dock.id}
                  onContextMenu={(e) => openContextMenu(e, 'dock', dock.id)}
                  onSelect={onSelectDock}
                  onSelectBoard={onSelectBoard}
                  selectedBoardId={selectedBoardId}
                />
              ))}
            </DroppableUncategorized>
          </div>
        </DndContext>
      </div>

      {contextMenu && (
        <div
          className="fixed bg-surface border border-border rounded-lg shadow-xl z-50 py-2 min-w-[200px]"
          style={{ top: Math.min(contextMenu.y, window.innerHeight - 200), left: contextMenu.x }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="px-3 py-1.5 text-xs font-bold text-muted uppercase tracking-wide border-b border-border/50 mb-1">
            {contextMenu.type} options
          </div>

          {(contextMenu.type === 'folder' || contextMenu.type === 'uncategorized') && (
            <>
              <button
                className="w-full text-left px-4 py-2 hover:bg-primary-soft text-sm flex items-center gap-2"
                onClick={() => {
                  setTargetParentId(contextMenu.targetId)
                  setShowCreateDock(true)
                  setContextMenu(null)
                }}
              >
                <Plus className="w-4 h-4" />
                New Board inside
              </button>

              {contextMenu.type === 'folder' && (
                <button
                  className="w-full text-left px-4 py-2 hover:bg-primary-soft text-sm flex items-center gap-2"
                  onClick={() => {
                    setTargetParentId(contextMenu.targetId)
                    setShowCreateFolder(true)
                    setContextMenu(null)
                  }}
                >
                  <Folder className="w-4 h-4" />
                  New Folder inside
                </button>
              )}
            </>
          )}

          {contextMenu.type === 'dock' && (
            <button
              className="w-full text-left px-4 py-2 hover:bg-primary-soft text-sm flex items-center gap-2"
              onClick={() => {
                const dock = docks.find(d => d.id === contextMenu.targetId)
                if (dock) {
                    setEditingDock(dock)
                }
                setContextMenu(null)
              }}
            >
              <Palette className="w-4 h-4" />
              Edit Properties
            </button>
          )}
          
          {(contextMenu.type === 'folder' || contextMenu.type === 'dock') && (
            <div className="px-4 py-2">
              <div className="flex items-center gap-2 text-sm text-text mb-2">
                <Palette className="w-4 h-4" />
                Color
              </div>
              <div className="flex flex-wrap gap-1.5">
                {COLORS.map((c) => (
                  <button
                    key={c}
                    onClick={() => {
                      changeColor(c)
                      setContextMenu(null)
                    }}
                    className="w-5 h-5 rounded-full border border-black/10 hover:scale-110 transition-transform"
                    style={{ backgroundColor: c }}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {showCreateDock && (
        <CreateDockModal onClose={() => setShowCreateDock(false)} onCreate={handleCreateNewDock} />
      )}

      {editingDock && (
        <CreateDockModal 
            title="Edit Board Properties"
            initialData={editingDock}
            onClose={() => setEditingDock(null)} 
            onCreate={handleUpdateDock} 
        />
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
  depth: number
  isExpanded: boolean
  onToggle: () => void
  onContextMenu: (e: React.MouseEvent) => void
}> = ({ folder, depth, isExpanded, onToggle, onContextMenu }) => {
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
        style={{ paddingLeft: `${depth * 0.75 + 0.75}rem` }}
        className="w-full flex items-center gap-2 pr-3 py-2 rounded-lg hover:bg-primary-soft transition"
      >
        {isExpanded ? (
          <ChevronDown className="w-4 h-4 shrink-0" />
        ) : (
          <ChevronRight className="w-4 h-4 shrink-0" />
        )}
        <Folder className="w-4 h-4 shrink-0" style={{ color: folder.color || '#0ea5b7' }} />
        <span className="flex-1 text-left text-sm truncate">{folder.name}</span>
      </button>
    </div>
  )
}

const DroppableUncategorized: React.FC<{
  docks: any[]
  onContextMenu: (e: React.MouseEvent) => void
  children: React.ReactNode
}> = ({ docks, onContextMenu, children }) => {
  const { isOver, setNodeRef } = useDroppable({
    id: 'uncategorized',
    data: { type: 'folder' }
  })

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
      <div className="space-y-1">{children}</div>
    </div>
  )
}

interface SidebarDockItemProps {
  dock: any
  depth: number
  isSelected: boolean
  onContextMenu: (e: React.MouseEvent) => void
  onSelect: (dockId: string) => void
  onSelectBoard: (boardId: string) => void
  selectedBoardId: string | null
}

const SidebarDockItem: React.FC<SidebarDockItemProps> = ({
  dock,
  depth,
  isSelected,
  onContextMenu,
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
    const allBoards = await window.electron.db.findAll('boards')
    const dockBoards = allBoards.filter((b: any) => b.dockId === dock.id)
    setBoards(dockBoards)
  }

  return (
    <div ref={setNodeRef} className={isDragging ? 'opacity-50' : ''}>
      <div className="flex w-full items-center" onContextMenu={onContextMenu}>
        <button
          style={{ paddingLeft: `${depth * 0.75 + 0.75}rem` }}
          onClick={() => {
            onSelect(dock.id)
            setExpanded(!expanded)
          }}
          className={`flex-1 flex items-center gap-2 pr-2 py-2 rounded-l-lg transition text-sm cursor-pointer ${
            isSelected ? 'bg-primary-soft text-primary' : 'hover:bg-primary-soft'
          }`}
        >
          {expanded ? (
            <ChevronDown className="w-3.5 h-3.5 shrink-0" />
          ) : (
            <ChevronRight className="w-3.5 h-3.5 shrink-0" />
          )}
          <Grid className="w-4 h-4 shrink-0" style={{ color: dock.color || '#0ea5b7' }} />
          <span className="flex-1 text-left truncate">{dock.name}</span>
        </button>
        <div
          {...listeners}
          {...attributes}
          className="pr-2 pl-1 py-2 cursor-grab active:cursor-grabbing hover:bg-border/50 rounded-r-lg opacity-30 hover:opacity-100 transition h-full flex items-center justify-center"
        >
          <div className="w-1.5 h-4 flex flex-col justify-between items-center opacity-50">
            <div className="w-1 h-1 rounded-full bg-text"></div>
            <div className="w-1 h-1 rounded-full bg-text"></div>
            <div className="w-1 h-1 rounded-full bg-text"></div>
          </div>
        </div>
      </div>

      {expanded && (
        <div className="mt-1 space-y-1" style={{ paddingLeft: `${depth * 0.75 + 2}rem` }}>
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
