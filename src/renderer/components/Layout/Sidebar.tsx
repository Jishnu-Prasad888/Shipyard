import React, { useEffect, useState } from 'react'
import { Folder, Grid, Plus, ChevronDown, ChevronRight, Palette, Trash2, Edit2, Home } from 'lucide-react'
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
  onGoHome: () => void
  isHome: boolean
  searchQuery?: string
}

const COLORS = [
  '#2563eb', // Blue
  '#0891b2', // Cyan
  '#7c3aed', // Violet
  '#059669', // Emerald
  '#d97706', // Amber
  '#dc2626', // Red
  '#db2777', // Pink
  '#0f172a'  // Dark
]

export const Sidebar: React.FC<SidebarProps> = ({
  onSelectDock,
  selectedDockId,
  onSelectBoard,
  selectedBoardId,
  onGoHome,
  isHome,
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
        color: dockData.color || '#2563eb',
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

  const handleDeleteDock = async (dockId: string) => {
    if (confirm('Delete this dock? All boards inside will also be deleted.')) {
      // delete boards in this dock first
      const allBoards = await window.electron.db.findAll('boards')
      const dockBoards = allBoards.filter((b: any) => b.dockId === dockId)
      for (const board of dockBoards) {
        await window.electron.db.delete('boards', board.id)
      }
      await window.electron.db.delete('docks', dockId)
      loadDocks()
      setContextMenu(null)
    }
  }

  const handleDeleteFolder = async (folderId: string) => {
    if (confirm('Delete this folder? Boards inside will become uncategorized.')) {
      // Move docks out of folder
      const folderDocks = docks.filter((d) => d.folderId === folderId)
      for (const dock of folderDocks) {
        await window.electron.db.update('docks', dock.id, { folderId: null })
      }
      await window.electron.db.delete('folders', folderId)
      loadFolders()
      loadDocks()
      setContextMenu(null)
    }
  }

  const handleCreateNewFolder = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newFolderName.trim()) return

    const newFolder = {
      name: newFolderName.trim(),
      color: '#2563eb',
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
    setContextMenu(null)
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
                  className="text-xs font-bold text-muted px-4 py-1 uppercase tracking-wider"
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
  }

  const uncategorizedDocksOriginal = docksByFolder['uncategorized'] || []
  const uncategorizedDocksFiltered = searchQuery
    ? uncategorizedDocksOriginal.filter((d: any) =>
        d.name.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : uncategorizedDocksOriginal

  return (
    <aside
      className="w-60 flex flex-col relative h-full z-10 border-r-4"
      style={{
        background: 'var(--color-sidebar)',
        borderColor: 'var(--color-border-strong)'
      }}
    >
      {/* Accent bar */}
      <div className="brutal-accent" />

      {/* Home button */}
      <div className="p-3 border-b-2" style={{ borderColor: 'rgba(255,255,255,0.12)' }}>
        <button
          onClick={onGoHome}
          className="w-full flex items-center gap-2 px-3 py-2 text-xs font-black uppercase tracking-wider border-2 transition-all duration-100"
          style={{
            borderColor: isHome ? 'var(--color-primary)' : 'rgba(255,255,255,0.2)',
            background: isHome ? 'var(--color-primary)' : 'rgba(255,255,255,0.06)',
            color: 'white',
            boxShadow: isHome ? 'var(--shadow-brutal-sm)' : 'none'
          }}
          onMouseOver={e => {
            if (!isHome) {
              e.currentTarget.style.background = 'rgba(45,130,183,0.25)'
              e.currentTarget.style.borderColor = 'var(--color-primary)'
            }
          }}
          onMouseOut={e => {
            if (!isHome) {
              e.currentTarget.style.background = 'rgba(255,255,255,0.06)'
              e.currentTarget.style.borderColor = 'rgba(255,255,255,0.2)'
            }
          }}
        >
          <Home className="w-4 h-4" />
          <span className="flex-1 text-left">Fleet Overview</span>
        </button>
      </div>

      {/* New Board button */}
      <div className="p-3 border-b-2" style={{ borderColor: 'rgba(255,255,255,0.12)' }}>
        <button
          onClick={() => {
            setTargetParentId(null)
            setShowCreateDock(true)
          }}
          className="btn-primary w-full text-xs uppercase tracking-wider"
        >
          <Plus className="w-4 h-4 stroke-[3px]" />
          New Dock
        </button>
      </div>

      {/* New Folder button */}
      <div className="px-3 pt-3 pb-1">
        <button
          onClick={() => {
            setTargetParentId(null)
            setShowCreateFolder(true)
          }}
          className="w-full flex items-center gap-2 px-3 py-1.5 text-xs font-black uppercase tracking-wider border-2 transition-all duration-100"
          style={{
            borderColor: 'rgba(255,255,255,0.2)',
            color: 'rgba(255,255,255,0.7)',
            boxShadow: '2px 2px 0 rgba(0,0,0,0.3)'
          }}
          onMouseOver={(e) => {
            e.currentTarget.style.background = 'rgba(45,130,183,0.25)'
            e.currentTarget.style.borderColor = 'var(--color-primary)'
            e.currentTarget.style.color = 'white'
          }}
          onMouseOut={(e) => {
            e.currentTarget.style.background = 'transparent'
            e.currentTarget.style.borderColor = 'rgba(255,255,255,0.2)'
            e.currentTarget.style.color = 'rgba(255,255,255,0.7)'
          }}
        >
          <Folder className="w-3.5 h-3.5" />
          <span className="flex-1 text-left">New Port</span>
          <Plus className="w-3 h-3" />
        </button>
      </div>

      {/* Tree */}
      <div className="flex-1 overflow-auto px-2 pb-6 space-y-1">
        <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
          <div className="space-y-1">
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

      {/* Context Menu */}
      {contextMenu && (
        <div
          className="context-menu fixed z-50 min-w-[200px] animate-brutal-in"
          style={{ top: Math.min(contextMenu.y, window.innerHeight - 260), left: contextMenu.x }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div
            className="px-4 py-2 text-xs font-black uppercase tracking-widest text-white border-b-2"
            style={{ background: 'var(--color-primary)', borderColor: 'var(--color-border-strong)' }}
          >
            {contextMenu.type} Options
          </div>

          {/* Folder / Uncategorized options */}
          {(contextMenu.type === 'folder' || contextMenu.type === 'uncategorized') && (
            <>
              <button
                className="context-menu-item border-b-2"
                style={{ borderColor: 'var(--color-border)' }}
                onClick={() => {
                  setTargetParentId(contextMenu.targetId)
                  setShowCreateDock(true)
                  setContextMenu(null)
                }}
              >
                <Plus className="w-4 h-4" />
                New Dock Here
              </button>
              {contextMenu.type === 'folder' && (
                <>
                  <button
                    className="context-menu-item border-b-2"
                    style={{ borderColor: 'var(--color-border)' }}
                    onClick={() => {
                      setTargetParentId(contextMenu.targetId)
                      setShowCreateFolder(true)
                      setContextMenu(null)
                    }}
                  >
                    <Folder className="w-4 h-4" />
                    New Port Inside
                  </button>
                  <button
                    className="context-menu-item danger border-b-2"
                    style={{ borderColor: 'var(--color-border)' }}
                    onClick={() => contextMenu.targetId && handleDeleteFolder(contextMenu.targetId)}
                  >
                    <Trash2 className="w-4 h-4" />
                    Decommission Port
                  </button>
                </>
              )}
            </>
          )}

          {/* Dock options */}
          {contextMenu.type === 'dock' && (
            <>
              <button
                className="context-menu-item border-b-2"
                style={{ borderColor: 'var(--color-border)' }}
                onClick={() => {
                  const dock = docks.find(d => d.id === contextMenu.targetId)
                  if (dock) setEditingDock(dock)
                  setContextMenu(null)
                }}
              >
                <Edit2 className="w-4 h-4" />
                Edit Dock
              </button>
              <button
                className="context-menu-item danger border-b-2"
                style={{ borderColor: 'var(--color-border)' }}
                onClick={() => contextMenu.targetId && handleDeleteDock(contextMenu.targetId)}
              >
                <Trash2 className="w-4 h-4" />
                Scuttle Dock
              </button>
            </>
          )}

          {/* Color picker for folder/dock */}
          {(contextMenu.type === 'folder' || contextMenu.type === 'dock') && (
            <div className="px-4 py-3 border-t-2" style={{ borderColor: 'var(--color-border)' }}>
              <div className="flex items-center gap-2 text-xs font-black uppercase tracking-wider mb-2">
                <Palette className="w-3.5 h-3.5" />
                Color
              </div>
              <div className="flex flex-wrap gap-1.5">
                {COLORS.map((c) => (
                  <button
                    key={c}
                    onClick={() => changeColor(c)}
                    className="w-6 h-6 border-2 hover:scale-110 transition-transform"
                    style={{ backgroundColor: c, borderColor: 'var(--color-border-strong)' }}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Modals */}
      {showCreateDock && (
        <CreateDockModal onClose={() => setShowCreateDock(false)} onCreate={handleCreateNewDock} />
      )}

      {editingDock && (
        <CreateDockModal
          title="Edit Dock Properties"
          initialData={editingDock}
          onClose={() => setEditingDock(null)}
          onCreate={handleUpdateDock}
        />
      )}

      {showCreateFolder && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="w-full max-w-sm surface animate-brutal-in">
            {/* Header */}
            <div
              className="flex items-center justify-between px-5 py-3 border-b-3"
              style={{ borderColor: 'var(--color-border-strong)', background: 'var(--color-primary)' }}
            >
              <h2 className="text-base font-black text-white uppercase tracking-wider">Establish New Port</h2>
              <button
                onClick={() => setShowCreateFolder(false)}
                className="w-6 h-6 flex items-center justify-center border-2 border-white text-white font-black hover:bg-white/20 transition"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateNewFolder} className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-black uppercase tracking-wider mb-1">Port Name *</label>
                <input
                  type="text"
                  value={newFolderName}
                  onChange={(e) => setNewFolderName(e.target.value)}
                  className="w-full px-3 py-2 border-2 bg-transparent font-bold text-sm focus:outline-none"
                  style={{
                    borderColor: 'var(--color-border-strong)',
                    color: 'var(--color-text)',
                    boxShadow: 'inset 2px 2px 0 rgba(0,0,0,0.05)'
                  }}
                  placeholder="East Port, Harbor Alpha..."
                  autoFocus
                />
              </div>

              <div className="flex justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setShowCreateFolder(false)}
                  className="btn-secondary text-xs"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!newFolderName.trim()}
                  className="btn-primary text-xs disabled:opacity-40 disabled:cursor-not-allowed"
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
      className={`transition-all duration-100 ${isOver ? 'ring-2 ring-primary ring-offset-1' : ''}`}
    >
      <button
        onClick={onToggle}
        onContextMenu={onContextMenu}
        style={{ paddingLeft: `${depth * 0.75 + 0.75}rem` }}
        className={`nav-item w-full ${isOver ? 'bg-blue-100 dark:bg-blue-900/30' : ''}`}
      >
        <div className="w-4 h-4 flex items-center justify-center shrink-0">
          {isExpanded ? (
            <ChevronDown className="w-3.5 h-3.5" />
          ) : (
            <ChevronRight className="w-3.5 h-3.5" />
          )}
        </div>
        <Folder className="w-4 h-4 shrink-0" style={{ color: folder.color || '#2563eb' }} />
        <span className="flex-1 text-left truncate text-xs uppercase tracking-wider">{folder.name}</span>
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
      className={`mt-3 transition-all ${isOver ? 'ring-2 ring-primary' : ''}`}
      onContextMenu={onContextMenu}
    >
      <div
        className="px-3 py-1 text-[10px] font-black uppercase tracking-widest border-b-2 mb-1"
        style={{ color: 'rgba(255,255,255,0.4)', borderColor: 'rgba(255,255,255,0.1)' }}
      >
        Uncharted Waters
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
    <div ref={setNodeRef} className={isDragging ? 'opacity-40' : ''}>
      <div className="flex w-full items-center" onContextMenu={onContextMenu}>
        <button
          style={{ paddingLeft: `${depth * 0.75 + 0.75}rem` }}
          onClick={() => {
            onSelect(dock.id)
            setExpanded(!expanded)
          }}
          className={`nav-item flex-1 ${isSelected ? 'active' : ''}`}
        >
          <div className="w-4 h-4 flex items-center justify-center shrink-0">
            {expanded ? (
              <ChevronDown className="w-3 h-3 opacity-70" />
            ) : (
              <ChevronRight className="w-3 h-3 opacity-70" />
            )}
          </div>
          <Grid className="w-3.5 h-3.5 shrink-0" style={{ color: dock.color || '#2563eb' }} />
          <span className="flex-1 text-left truncate text-xs font-black uppercase tracking-wide">
            {dock.name}
          </span>
        </button>
        {/* Drag handle */}
        <div
          {...listeners}
          {...attributes}
          className="pr-2 pl-1 py-2 cursor-grab active:cursor-grabbing opacity-30 hover:opacity-100 transition-opacity"
          title="Drag to move"
        >
          <div className="flex flex-col gap-0.5">
            <div className="w-3 h-0.5 bg-current rounded" />
            <div className="w-3 h-0.5 bg-current rounded" />
            <div className="w-3 h-0.5 bg-current rounded" />
          </div>
        </div>
      </div>

      {expanded && (
        <div className="mt-0.5 space-y-0.5" style={{ paddingLeft: `${depth * 0.75 + 2}rem` }}>
          {boards.map((board) => (
            <button
              key={board.id}
              onClick={() => onSelectBoard(board.id)}
              className={`w-full text-left px-3 py-1.5 text-[10px] font-black uppercase tracking-wider border-l-4 transition-all duration-100 ${
                selectedBoardId === board.id
                  ? 'border-[#2D82B7]'
                  : 'border-transparent'
              }`}
              style={{
                color: selectedBoardId === board.id ? '#5FA8D3' : 'rgba(255,255,255,0.55)',
                background: selectedBoardId === board.id ? 'rgba(45,130,183,0.2)' : 'transparent'
              }}
              onMouseOver={e => {
                if (selectedBoardId !== board.id) {
                  e.currentTarget.style.color = 'white'
                  e.currentTarget.style.background = 'rgba(45,130,183,0.15)'
                }
              }}
              onMouseOut={e => {
                if (selectedBoardId !== board.id) {
                  e.currentTarget.style.color = 'rgba(255,255,255,0.55)'
                  e.currentTarget.style.background = 'transparent'
                }
              }}
            >
              ▸ {board.name}
            </button>
          ))}
          {boards.length === 0 && (
            <p className="text-[10px] font-bold px-3 py-1 uppercase tracking-wider" style={{ color: 'rgba(255,255,255,0.35)' }}>No ships docked</p>
          )}
        </div>
      )}
    </div>
  )
}
