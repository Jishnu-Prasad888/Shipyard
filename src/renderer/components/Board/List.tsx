import React, { useState, useEffect, useRef } from 'react'
import { useDroppable } from '@dnd-kit/core'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Plus, Edit2, Trash2, Eye, EyeOff, Download, MoveHorizontal, MoveVertical } from 'lucide-react'
import { Card } from './Card'
import { CreateCardModal } from './CreateCardModal'

interface ListProps {
  list: any
  boardId: string
  onCardsChange: () => void
  openCardId?: string | null
  onCardOpenComplete?: () => void
  orientation: 'horizontal' | 'vertical'
  rowHeight?: number
}

// Default statuses matching CardDetailsModal
const DEFAULT_STATUSES = [
  { id: '__yet_to_start__', name: 'Yet to Start', color: '#6b7280' },
  { id: '__working__', name: 'Working', color: '#f59e0b' },
  { id: '__completed__', name: 'Completed', color: '#ef4444' }
]

export const List: React.FC<ListProps> = ({ list, boardId, onCardsChange, openCardId, onCardOpenComplete, orientation, rowHeight }) => {
  const [showCreateCard, setShowCreateCard] = useState(false)
  const [isEditing, setIsEditing] = useState(false)
  const [editedName, setEditedName] = useState(list.name)
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null)
  const [hideStatuses, setHideStatuses] = useState<string[]>([])
  const [showHidePanel, setShowHidePanel] = useState(false)
  const [boardStatuses, setBoardStatuses] = useState<any[]>([])
  const hidePanelRef = useRef<HTMLDivElement | null>(null)

  // Resizable width (per-list, persisted)
  const MIN_WIDTH = 260
  const MAX_WIDTH = 520
  const DEFAULT_WIDTH = 320
  const [width, setWidth] = useState(() => {
    if (typeof window === 'undefined') return DEFAULT_WIDTH
    const raw = localStorage.getItem(`shipyard:list-width:${list.id}`)
    const parsed = raw ? Number(raw) : NaN
    if (Number.isFinite(parsed)) return Math.min(Math.max(parsed, MIN_WIDTH), MAX_WIDTH)
    return DEFAULT_WIDTH
  })
  const resizeStartRef = useRef<{ x: number; width: number } | null>(null)

  // Resizable height (per-list, persisted)
  const MIN_HEIGHT = 320
  const MAX_HEIGHT = 1400
  const DEFAULT_HEIGHT = 680
  const [height, setHeight] = useState(() => {
    if (typeof window === 'undefined') return DEFAULT_HEIGHT
    const raw = localStorage.getItem(`shipyard:list-height:${list.id}`)
    const parsed = raw ? Number(raw) : NaN
    if (Number.isFinite(parsed)) return Math.min(Math.max(parsed, MIN_HEIGHT), MAX_HEIGHT)
    return DEFAULT_HEIGHT
  })
  const resizeYStartRef = useRef<{ y: number; height: number } | null>(null)

  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: list.id,
    data: { type: 'list' }
  })

  const { setNodeRef: setDropRef, isOver } = useDroppable({
    id: `list-drop-${list.id}`,
    data: { type: 'list-drop', listId: list.id }
  })

  const handleResize = (event: MouseEvent) => {
    if (!resizeStartRef.current) return
    const delta = event.clientX - resizeStartRef.current.x
    const next = Math.min(Math.max(resizeStartRef.current.width + delta, MIN_WIDTH), MAX_WIDTH)
    setWidth(next)
  }

  const handleHeightResize = (event: MouseEvent) => {
    if (!resizeYStartRef.current) return
    const delta = event.clientY - resizeYStartRef.current.y
    const next = Math.min(Math.max(resizeYStartRef.current.height + delta, MIN_HEIGHT), MAX_HEIGHT)
    setHeight(next)
  }

  const stopResize = () => {
    window.removeEventListener('mousemove', handleResize)
    window.removeEventListener('mouseup', stopResize)
    resizeStartRef.current = null
  }

  const stopHeightResize = () => {
    window.removeEventListener('mousemove', handleHeightResize)
    window.removeEventListener('mouseup', stopHeightResize)
    resizeYStartRef.current = null
  }

  const handleResizeStart = (event: React.MouseEvent) => {
    event.stopPropagation()
    event.preventDefault()
    resizeStartRef.current = { x: event.clientX, width }
    window.addEventListener('mousemove', handleResize)
    window.addEventListener('mouseup', stopResize)
  }

  const resetWidth = () => setWidth(DEFAULT_WIDTH)

  const handleHeightResizeStart = (event: React.MouseEvent) => {
    event.stopPropagation()
    event.preventDefault()
    resizeYStartRef.current = { y: event.clientY, height }
    window.addEventListener('mousemove', handleHeightResize)
    window.addEventListener('mouseup', stopHeightResize)
  }

  const resetHeight = () => setHeight(DEFAULT_HEIGHT)

  useEffect(() => {
    if (typeof window === 'undefined') return
    localStorage.setItem(`shipyard:list-width:${list.id}`, String(width))
  }, [list.id, width])

  useEffect(() => {
    if (orientation === 'vertical') return
    if (typeof window === 'undefined') return
    localStorage.setItem(`shipyard:list-height:${list.id}`, String(height))
  }, [list.id, height, orientation])

  useEffect(() => {
    return () => {
      stopResize()
      stopHeightResize()
    }
  }, [])

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1
  }

  const effectiveHeight = orientation === 'vertical' && rowHeight ? rowHeight : height

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (hidePanelRef.current && !hidePanelRef.current.contains(e.target as Node)) {
        setShowHidePanel(false)
      }

      if (contextMenu && !(e.target as Element).closest('.context-menu')) {
        setContextMenu(null)
      }
    }

    window.addEventListener('mousedown', handleClickOutside)

    return () => {
      window.removeEventListener('mousedown', handleClickOutside)
    }
  }, [contextMenu])

  useEffect(() => {
    loadBoardStatuses()
  }, [boardId])

  const loadBoardStatuses = async () => {
    const dbStatuses = await window.electron.db.findAll('statuses')
    const filtered = dbStatuses.filter((s: any) => s.boardId === boardId)
    setBoardStatuses([...DEFAULT_STATUSES, ...filtered])
  }

  const handleUpdateList = async () => {
    if (editedName.trim() && editedName !== list.name) {
      await window.electron.db.update('lists', list.id, {
        name: editedName,
        updatedAt: Date.now()
      })
      list.name = editedName
    }
    setIsEditing(false)
  }

  const handleDeleteList = async () => {
    setContextMenu(null)
    // Snapshot for undo
    const listSnapshot = { ...list }
    const cardSnapshots = [...(list.cards || [])]
    const allSubCards = await window.electron.db.findAll('subcards')
    const subCardSnapshots = allSubCards.filter((sc: any) =>
      cardSnapshots.some((c: any) => c.id === sc.cardId)
    )

    // Delete immediately
    for (const card of cardSnapshots) {
      await window.electron.db.delete('cards', card.id)
    }
    await window.electron.db.delete('lists', list.id)
    onCardsChange()

    window.dispatchEvent(
      new CustomEvent('show-toast', {
        detail: {
          message: `Manifest "${list.name}" deleted`,
          onUndo: async () => {
            await window.electron.db.create('lists', {
              id: listSnapshot.id,
              name: listSnapshot.name,
              boardId: listSnapshot.boardId,
              order: listSnapshot.order,
              createdAt: listSnapshot.createdAt
            })
            for (const card of cardSnapshots) {
              await window.electron.db.create('cards', card)
            }
            for (const sc of subCardSnapshots) {
              await window.electron.db.create('subcards', sc)
            }
            onCardsChange()
          }
        }
      })
    )
  }

  const handleExportList = async () => {
    setContextMenu(null)
    const listSnapshot = { ...list }
    const cardSnapshots = [...(list.cards || [])]

    // Clean items
    const cleanList = (() => {
      const { id, createdAt, updatedAt, boardId, listId, order, ...rest } = listSnapshot
      return rest
    })()

    const cleanCards = cardSnapshots.map((c) => {
      const { id, createdAt, updatedAt, boardId, listId, order, ...rest } = c

      // Basic parse
      const tags = (() => {
        try {
          return JSON.parse(rest.tags)
        } catch {
          return rest.tags
        }
      })()
      if (Array.isArray(tags)) rest.tags = tags.map((t: any) => t.name).join(', ')

      const subCards = (() => {
        try {
          return JSON.parse(rest.subCards)
        } catch {
          return rest.subCards
        }
      })()
      if (Array.isArray(subCards))
        rest.subCards = subCards
          .map((sc: any) => `${sc.completed ? '[x]' : '[ ]'} ${sc.title}`)
          .join('; ')

      const status = (() => {
        try {
          return JSON.parse(rest.status)
        } catch {
          return rest.status
        }
      })()
      if (status && status.name) rest.status = status.name

      return rest
    })

    // Turn to markdown
    const md =
      `## Manifest: ${cleanList.name}\n` +
      (cleanCards.length
        ? `| ${Object.keys(cleanCards[0]).join(' | ')} |\n| ${Object.keys(cleanCards[0])
            .map(() => '---')
            .join(' | ')} |\n` +
          cleanCards
            .map(
              (c) =>
                `| ${Object.keys(c)
                  .map((k) => String(c[k] ?? ''))
                  .join(' | ')} |`
            )
            .join('\n')
        : '_No cargo_')

    const res = await (window.electron as any).export.saveFile({
      defaultName: `manifest-${cleanList.name.replace(/[^a-z0-9]/gi, '_').toLowerCase()}`,
      content: md,
      ext: 'md'
    })

    if (res?.success) {
      window.dispatchEvent(
        new CustomEvent('show-toast', {
          detail: { message: `Exported manifest to ${res.filePath}` } // Open handled below or let user find it, we could add onUndo as an open action if we wanted
        })
      )
      // As requested, also open it:
      ;(window.electron as any).export.openItem(res.filePath)
    }
  }

  const handleCreateCard = async (cardData: any) => {
    const newCard = {
      ...cardData,
      listId: list.id,
      boardId,
      order: list.cards?.length || 0,
      createdAt: Date.now(),
      updatedAt: Date.now()
    }

    await window.electron.db.create('cards', newCard)
    onCardsChange()
    setShowCreateCard(false)
  }

  const openContextMenu = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setContextMenu({ x: e.clientX, y: e.clientY })
  }

  const toggleHideStatus = (statusName: string) => {
    setHideStatuses((prev) =>
      prev.includes(statusName) ? prev.filter((s) => s !== statusName) : [...prev, statusName]
    )
  }

  // Filter cards based on hidden statuses
  const visibleCards = (list.cards || []).filter((card: any) => {
    if (hideStatuses.length === 0) return true
    const status =
      typeof card.status === 'string' && card.status.startsWith('{')
        ? JSON.parse(card.status)
        : card.status
    if (!status) return true
    return !hideStatuses.includes(status.name)
  })

  const hiddenCount = (list.cards?.length || 0) - visibleCards.length
  const cardCount = list.cards?.length || 0
  const listColor = list.color || '#2563eb'

  return (
    <>
      <div
        ref={setNodeRef}
        style={{
          ...style,
          width: orientation === 'vertical' ? '100%' : width,
          minWidth: orientation === 'vertical' ? MIN_WIDTH : MIN_WIDTH,
          maxWidth: orientation === 'vertical' ? '100%' : MAX_WIDTH,
          flexShrink: orientation === 'vertical' ? 1 : 0,
          height: effectiveHeight,
          maxHeight: effectiveHeight,
          minHeight: MIN_HEIGHT,
          overflow: 'visible'
        }}
        className="column relative"
        onContextMenu={openContextMenu}
      >
        {/* List Header */}
        <div
          className="flex items-center justify-between pb-3 border-b-2 shrink-0"
          style={{ borderColor: 'var(--color-border-strong)' }}
        >
          {isEditing ? (
            <input
              type="text"
              value={editedName}
              onChange={(e) => setEditedName(e.target.value)}
              onBlur={handleUpdateList}
              onKeyDown={(e) => e.key === 'Enter' && handleUpdateList()}
              className="flex-1 px-2 py-1 border-2 bg-transparent text-sm font-black uppercase focus:outline-none"
              style={{
                borderColor: 'var(--color-primary)',
                color: 'var(--color-text)'
              }}
              autoFocus
            />
          ) : (
            <div className="flex items-center gap-2 flex-1 min-w-0">
              <div
                className="w-3 h-3 border-2 shrink-0"
                style={{ backgroundColor: listColor, borderColor: 'var(--color-border-strong)' }}
              />
              <h3
                className="font-black text-xs uppercase tracking-wider truncate"
                style={{ color: 'var(--color-text)' }}
              >
                {list.name}
              </h3>
              <span
                className="text-[10px] font-black px-1.5 py-0.5 shrink-0 border-2 ml-auto"
                style={{
                  borderColor: listColor,
                  color: listColor,
                  background: listColor + '15'
                }}
              >
                {cardCount}
              </span>
            </div>
          )}

          {/* Eye (hide) button */}
          <div className="relative ml-1">
            <button
              onClick={(e) => {
                e.stopPropagation()
                setShowHidePanel((v) => !v)
              }}
              className="p-1 transition-all"
              title="Hide cargo by status"
              style={{
                color: hideStatuses.length > 0 ? 'var(--color-warning)' : 'var(--color-muted)',
                opacity: hideStatuses.length > 0 ? 1 : 0.5
              }}
            >
              {hideStatuses.length > 0 ? (
                <EyeOff className="w-3.5 h-3.5" />
              ) : (
                <Eye className="w-3.5 h-3.5" />
              )}
            </button>

            {showHidePanel && (
              <div
                className="absolute right-0 top-full mt-1 z-50 min-w-[200px] animate-brutal-in"
                style={{
                  background: 'var(--color-surface)',
                  border: '3px solid var(--color-border-strong)',
                  boxShadow: 'var(--shadow-brutal)'
                }}
                onClick={(e) => e.stopPropagation()}
                ref={hidePanelRef}
              >
                <div
                  className="px-3 py-2 text-[10px] font-black uppercase tracking-widest border-b-2"
                  style={{
                    color: 'white',
                    background: 'var(--color-primary)',
                    borderColor: 'var(--color-border-strong)'
                  }}
                >
                  Hide Cargo by Status
                </div>
                {boardStatuses.map((s: any) => {
                  const isHidden = hideStatuses.includes(s.name)
                  return (
                    <button
                      key={s.id}
                      onClick={() => toggleHideStatus(s.name)}
                      className="w-full flex items-center justify-between px-3 py-2 text-xs font-bold hover:bg-primary-soft transition border-b"
                      style={{ borderColor: 'var(--color-border)', color: 'var(--color-text)' }}
                    >
                      <div className="flex items-center gap-2">
                        <div
                          className="w-2.5 h-2.5 border"
                          style={{ backgroundColor: s.color, borderColor: s.color }}
                        />
                        <span>{s.name}</span>
                      </div>
                      <div
                        className="w-4 h-4 border-2 flex items-center justify-center text-[9px] font-black"
                        style={{
                          borderColor: isHidden ? 'var(--color-warning)' : 'var(--color-border)',
                          background: isHidden ? 'var(--color-warning)' : 'transparent',
                          color: isHidden ? 'white' : 'transparent'
                        }}
                      >
                        ✓
                      </div>
                    </button>
                  )
                })}
                {hideStatuses.length > 0 && (
                  <button
                    onClick={() => setHideStatuses([])}
                    className="w-full text-xs font-black px-3 py-2 text-center"
                    style={{ color: 'var(--color-primary)' }}
                  >
                    Show All
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Drag handle */}
          <div
            {...attributes}
            {...listeners}
            className="ml-1 cursor-grab active:cursor-grabbing opacity-40 hover:opacity-100 transition-opacity shrink-0"
            title="Drag to reorder"
          >
            <div className="flex flex-col gap-0.5 p-1">
              <div
                className="w-4 h-0.5 rounded"
                style={{ background: 'var(--color-border-strong)' }}
              />
              <div
                className="w-4 h-0.5 rounded"
                style={{ background: 'var(--color-border-strong)' }}
              />
              <div
                className="w-4 h-0.5 rounded"
                style={{ background: 'var(--color-border-strong)' }}
              />
            </div>
          </div>
        </div>

        {/* Hidden cargo notice */}
        {hiddenCount > 0 && (
          <div
            className="text-[10px] font-black px-2 py-1 flex items-center gap-1 border-b-2"
            style={{
              color: 'var(--color-warning)',
              background: 'rgba(217,123,102,0.08)',
              borderColor: 'var(--color-warning)'
            }}
          >
            <EyeOff className="w-3 h-3" />
            {hiddenCount} cargo hidden
          </div>
        )}

        {/* Cards — scrollable */}
        <div
          ref={setDropRef}
          className="flex-1 space-y-2 min-h-[40px] overflow-y-auto"
          style={
            isOver
              ? {
                  background: 'var(--color-primary-soft)',
                  borderRadius: '12px',
                  padding: '6px'
                }
              : undefined
          }
        >
          {visibleCards.map((card: any) => (
            <Card
              key={card.id}
              card={card}
              onUpdate={onCardsChange}
              autoOpenId={openCardId}
              onAutoOpenComplete={onCardOpenComplete}
            />
          ))}
          {visibleCards.length === 0 && (
            <div
              className="text-xs font-bold text-center border-2 border-dashed rounded-lg py-4"
              style={{
                borderColor: 'var(--color-border)',
                color: 'var(--color-muted)',
                background: 'var(--color-background)'
              }}
            >
              Drag cargo here
            </div>
          )}
        </div>

        {/* Add Card — sticky at the bottom, always visible */}
        <div className="shrink-0 pt-2 mt-auto">
          <button
            onClick={() => setShowCreateCard(true)}
            className="flex items-center justify-center gap-2 w-full px-3 py-2 border-2 border-dashed transition-all duration-100 group font-black text-xs uppercase tracking-wider"
            style={{
              borderColor: 'var(--color-border)',
              color: 'var(--color-muted)'
            }}
            onMouseOver={(e) => {
              e.currentTarget.style.borderColor = 'var(--color-primary)'
              e.currentTarget.style.color = 'var(--color-primary)'
              e.currentTarget.style.background = 'var(--color-primary-soft)'
            }}
            onMouseOut={(e) => {
              e.currentTarget.style.borderColor = 'var(--color-border)'
              e.currentTarget.style.color = 'var(--color-muted)'
              e.currentTarget.style.background = 'transparent'
            }}
          >
            <Plus className="w-4 h-4 stroke-[3px] group-hover:rotate-90 transition-transform" />
            Add Cargo
          </button>
        </div>

        {/* Horizontal resize handle (only in horizontal layout) */}
        {orientation === 'horizontal' && (
          <button
            type="button"
            onMouseDown={handleResizeStart}
            onDoubleClick={resetWidth}
            className="absolute -right-3 top-1/2 -translate-y-1/2 w-7 h-10 rounded-md flex items-center justify-center cursor-ew-resize"
            style={{
              border: '2px solid var(--color-border-strong)',
              background: 'var(--color-background)',
              boxShadow: '1px 1px 0 var(--color-border-strong)'
            }}
            title="Drag to resize · Double-click to reset"
          >
            <MoveHorizontal className="w-4 h-4" style={{ color: 'var(--color-muted)' }} />
          </button>
        )}

        {/* Vertical resize handle (per list, only when not controlled by row height) */}
        {orientation === 'horizontal' && (
          <button
            type="button"
            onMouseDown={handleHeightResizeStart}
            onDoubleClick={resetHeight}
            className="absolute -bottom-3 left-1/2 -translate-x-1/2 w-16 h-7 rounded-md flex items-center justify-center cursor-ns-resize"
            style={{
              border: '2px solid var(--color-border-strong)',
              background: 'var(--color-background)',
              boxShadow: '1px 1px 0 var(--color-border-strong)'
            }}
            title="Drag to change height · Double-click to reset"
          >
            <MoveVertical className="w-4 h-4" style={{ color: 'var(--color-muted)' }} />
          </button>
        )}
      </div>

      {/* Right-click context menu */}
      {contextMenu && (
        <div
          className="context-menu fixed z-50 min-w-[180px] animate-brutal-in"
          style={{
            top: Math.min(contextMenu.y, window.innerHeight - 150),
            left: Math.min(contextMenu.x, window.innerWidth - 200)
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <div
            className="px-4 py-2 text-xs font-black uppercase tracking-widest text-white border-b-2"
            style={{
              background: 'var(--color-primary)',
              borderColor: 'var(--color-border-strong)'
            }}
          >
            {list.name}
          </div>
          <button
            className="context-menu-item border-b-2"
            style={{ borderColor: 'var(--color-border)' }}
            onClick={() => {
              setIsEditing(true)
              setContextMenu(null)
            }}
          >
            <Edit2 className="w-4 h-4" />
            Rename Manifest
          </button>
          <button
            className="context-menu-item border-b-2"
            style={{ borderColor: 'var(--color-border)' }}
            onClick={handleExportList}
          >
            <Download className="w-4 h-4" />
            Export Manifest
          </button>
          <button
            className="context-menu-item border-b-2 danger"
            style={{ borderColor: 'var(--color-border)' }}
            onClick={handleDeleteList}
          >
            <Trash2 className="w-4 h-4" />
            Jettison Manifest
          </button>
          <button
            className="context-menu-item"
            onClick={() => {
              setShowCreateCard(true)
              setContextMenu(null)
            }}
          >
            <Plus className="w-4 h-4" />
            Add Cargo
          </button>
        </div>
      )}

      {showCreateCard && (
        <CreateCardModal
          onClose={() => setShowCreateCard(false)}
          onCreate={handleCreateCard}
          boardId={boardId}
        />
      )}
    </>
  )
}
