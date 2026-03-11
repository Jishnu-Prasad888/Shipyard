import React, { useEffect, useState, useCallback } from 'react'
import {
  Anchor, Ship, Package, Plus, Compass,
  Clock, ChevronRight, Search, X
} from 'lucide-react'
import { CreateDockModal } from '../Docks/CreateDockModel'

interface HomeScreenProps {
  onSelectDock: (dockId: string) => void
  onSelectBoard: (boardId: string) => void
  dataVersion?: number
}

interface Port { id: string; name: string; color: string; parentId?: string | null }
interface Dock { id: string; name: string; color: string; folderId?: string | null; description?: string; tags?: string; createdAt: number }
interface BoardShip { id: string; name: string; dockId: string; color?: string; createdAt: number; description?: string }

export const HomeScreen: React.FC<HomeScreenProps> = ({ onSelectDock, onSelectBoard, dataVersion }) => {
  const [ports, setPorts] = useState<Port[]>([])
  const [docks, setDocks] = useState<Dock[]>([])
  const [ships, setShips] = useState<BoardShip[]>([])
  const [filter, setFilter] = useState('')
  const [showCreateDock, setShowCreateDock] = useState(false)
  const [activePort, setActivePort] = useState<string | 'all' | 'uncategorized'>('all')

  const loadAll = useCallback(async () => {
    const [folderData, dockData, boardData] = await Promise.all([
      window.electron.db.findAll('folders'),
      window.electron.db.findAll('docks'),
      window.electron.db.findAll('boards')
    ])
    setPorts(folderData)
    setDocks(dockData)
    setShips(boardData)
  }, [])

  useEffect(() => { loadAll() }, [dataVersion])

  const handleCreateDock = async (dockData: any) => {
    await window.electron.db.create('docks', {
      ...dockData,
      folderId: null,
      boardIds: JSON.stringify([]),
      createdAt: Date.now(),
      updatedAt: Date.now()
    })
    loadAll()
    setShowCreateDock(false)
  }

  const shipsForDock = (dockId: string) => ships.filter(s => s.dockId === dockId)

  // Filter docks by active port tab and search
  const filteredDocks = docks.filter(d => {
    const matchesPort =
      activePort === 'all' ||
      (activePort === 'uncategorized' ? !d.folderId : d.folderId === activePort)
    const matchesFilter = !filter || d.name.toLowerCase().includes(filter.toLowerCase())
    return matchesPort && matchesFilter
  })

  const recentShips = [...ships]
    .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
    .slice(0, 6)

  const uncategorizedCount = docks.filter(d => !d.folderId).length

  return (
    <div className="h-full flex flex-col overflow-hidden">

      {/* ── TOP BAR ── */}
      <div
        className="flex items-center justify-between px-6 py-4 border-b-4 shrink-0"
        style={{ borderColor: 'var(--color-border-strong)', background: 'var(--color-surface)' }}
      >
        <div className="flex items-center gap-3">
          <div
            className="w-8 h-8 border-3 flex items-center justify-center"
            style={{
              border: '3px solid var(--color-border-strong)',
              background: 'var(--color-primary)',
              boxShadow: '3px 3px 0 var(--color-border-strong)'
            }}
          >
            <Anchor className="w-4 h-4 text-white" />
          </div>
          <div>
            <h1 className="text-lg font-black uppercase tracking-tight leading-none" style={{ color: 'var(--color-text)' }}>
              Your Fleet
            </h1>
            <p className="text-[10px] font-bold uppercase tracking-widest leading-none mt-0.5" style={{ color: 'var(--color-muted)' }}>
              {docks.length} docks · {ships.length} ships
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Filter input */}
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 pointer-events-none" style={{ color: 'var(--color-muted)' }} />
            <input
              type="text"
              value={filter}
              onChange={e => setFilter(e.target.value)}
              placeholder="Filter..."
              className="pl-8 pr-8 py-1.5 border-2 text-xs font-bold focus:outline-none w-44"
              style={{
                borderColor: 'var(--color-border-strong)',
                background: 'var(--color-background)',
                color: 'var(--color-text)',
                boxShadow: '2px 2px 0 var(--color-border)'
              }}
            />
            {filter && (
              <button
                onClick={() => setFilter('')}
                className="absolute right-2 top-1/2 -translate-y-1/2"
                style={{ color: 'var(--color-muted)' }}
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>

          <button
            onClick={() => setShowCreateDock(true)}
            className="btn-primary text-xs uppercase tracking-wider"
          >
            <Plus className="w-4 h-4 stroke-[3px]" />
            New Dock
          </button>
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">

        {/* ── LEFT: PORT TABS ── */}
        <div
          className="w-44 shrink-0 border-r-4 flex flex-col overflow-y-auto"
          style={{ borderColor: 'var(--color-border-strong)', background: 'var(--color-surface)' }}
        >
          <div
            className="px-3 py-2 text-[9px] font-black uppercase tracking-widest border-b-2"
            style={{ borderColor: 'var(--color-border)', color: 'var(--color-muted)' }}
          >
            Ports
          </div>

          {/* All */}
          <button
            onClick={() => setActivePort('all')}
            className="flex items-center gap-2 px-3 py-2.5 text-left border-b-2 transition-all duration-100"
            style={{
              borderColor: 'var(--color-border)',
              background: activePort === 'all' ? 'var(--color-primary)' : 'transparent',
              color: activePort === 'all' ? 'white' : 'var(--color-text)'
            }}
          >
            <Compass className="w-3.5 h-3.5 shrink-0" />
            <span className="text-xs font-black uppercase tracking-wide flex-1">All</span>
            <span className="text-[9px] font-black opacity-60">{docks.length}</span>
          </button>

          {/* Port tabs */}
          {ports.map(port => {
            const portDockCount = docks.filter(d => d.folderId === port.id).length
            const isActive = activePort === port.id
            return (
              <button
                key={port.id}
                onClick={() => setActivePort(port.id)}
                className="flex items-center gap-2 px-3 py-2.5 text-left border-b-2 transition-all duration-100"
                style={{
                  borderColor: 'var(--color-border)',
                  background: isActive ? (port.color || '#2563eb') : 'transparent',
                  color: isActive ? 'white' : 'var(--color-text)',
                  borderLeftWidth: isActive ? '3px' : '0',
                  borderLeftColor: port.color || '#2563eb'
                }}
              >
                <div
                  className="w-2.5 h-2.5 border shrink-0"
                  style={{
                    background: port.color || '#2563eb',
                    borderColor: isActive ? 'white' : 'var(--color-border-strong)'
                  }}
                />
                <span className="text-xs font-black uppercase tracking-wide flex-1 truncate">{port.name}</span>
                <span className="text-[9px] font-black opacity-60">{portDockCount}</span>
              </button>
            )
          })}

          {/* Uncategorized */}
          {uncategorizedCount > 0 && (
            <button
              onClick={() => setActivePort('uncategorized')}
              className="flex items-center gap-2 px-3 py-2.5 text-left border-b-2 transition-all duration-100"
              style={{
                borderColor: 'var(--color-border)',
                background: activePort === 'uncategorized' ? 'var(--color-muted)' : 'transparent',
                color: activePort === 'uncategorized' ? 'white' : 'var(--color-muted)'
              }}
            >
              <Anchor className="w-3.5 h-3.5 shrink-0 opacity-60" />
              <span className="text-xs font-black uppercase tracking-wide flex-1">Uncharted</span>
              <span className="text-[9px] font-black opacity-60">{uncategorizedCount}</span>
            </button>
          )}
        </div>

        {/* ── RIGHT: MAIN CONTENT ── */}
        <div className="flex-1 overflow-auto px-6 py-5 space-y-8">

          {/* RECENT SHIPS ROW */}
          {recentShips.length > 0 && activePort === 'all' && !filter && (
            <section>
              <div className="flex items-center gap-2 mb-3">
                <Clock className="w-3.5 h-3.5" style={{ color: 'var(--color-primary)' }} />
                <h2 className="text-[10px] font-black uppercase tracking-widest" style={{ color: 'var(--color-muted)' }}>
                  Recently Launched
                </h2>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
                {recentShips.map(ship => {
                  const dock = docks.find(d => d.id === ship.dockId)
                  const c = dock?.color || '#2563eb'
                  return (
                    <button
                      key={ship.id}
                      onClick={() => onSelectBoard(ship.id)}
                      className="group text-left p-3 border-2 transition-all duration-100"
                      style={{
                        borderColor: c,
                        background: c + '08',
                        boxShadow: `2px 2px 0 ${c}`
                      }}
                      onMouseOver={e => {
                        e.currentTarget.style.transform = 'translate(-1px,-1px)'
                        e.currentTarget.style.boxShadow = `3px 3px 0 ${c}`
                      }}
                      onMouseOut={e => {
                        e.currentTarget.style.transform = ''
                        e.currentTarget.style.boxShadow = `2px 2px 0 ${c}`
                      }}
                    >
                      <Ship className="w-5 h-5 mb-2" style={{ color: c }} />
                      <div className="text-[11px] font-black uppercase leading-tight line-clamp-2" style={{ color: 'var(--color-text)' }}>
                        {ship.name}
                      </div>
                      {dock && (
                        <div className="text-[9px] font-bold mt-1 truncate" style={{ color: c }}>
                          {dock.name}
                        </div>
                      )}
                    </button>
                  )
                })}
              </div>
            </section>
          )}

          {/* DOCKS AND SHIPS */}
          {filteredDocks.length === 0 ? (
            <div
              className="py-24 flex flex-col items-center gap-4 border-4 border-dashed"
              style={{ borderColor: 'var(--color-border)' }}
            >
              <Compass className="w-12 h-12 opacity-20" style={{ color: 'var(--color-primary)' }} />
              <div className="text-center">
                <p className="font-black text-base uppercase tracking-wider" style={{ color: 'var(--color-muted)' }}>
                  {filter ? `No results for "${filter}"` : 'No docks here yet'}
                </p>
                {!filter && (
                  <button onClick={() => setShowCreateDock(true)} className="btn-primary mt-4 text-xs uppercase tracking-wider">
                    <Plus className="w-4 h-4 stroke-[3px]" />
                    Launch First Dock
                  </button>
                )}
              </div>
            </div>
          ) : (
            <div className="space-y-6">
              {filteredDocks.map(dock => {
                const dockShips = shipsForDock(dock.id).filter(s =>
                  !filter || s.name.toLowerCase().includes(filter.toLowerCase())
                )
                const dockColor = dock.color || '#2563eb'
                const port = ports.find(p => p.id === dock.folderId)

                return (
                  <section key={dock.id}>
                    {/* Dock header row */}
                    <div className="flex items-center gap-3 mb-3">
                      <div
                        className="w-3 h-3 border-2 shrink-0"
                        style={{ background: dockColor, borderColor: 'var(--color-border-strong)' }}
                      />
                      <h2 className="font-black text-sm uppercase tracking-wide" style={{ color: 'var(--color-text)' }}>
                        {dock.name}
                      </h2>
                      {port && (
                        <span
                          className="text-[9px] font-black uppercase tracking-wider px-1.5 py-0.5 border"
                          style={{ borderColor: port.color || dockColor, color: port.color || dockColor }}
                        >
                          {port.name}
                        </span>
                      )}
                      <div className="h-px flex-1" style={{ background: dockColor + '30' }} />
                      <button
                        onClick={() => onSelectDock(dock.id)}
                        className="flex items-center gap-1 text-[10px] font-black uppercase tracking-wider hover:opacity-70 transition-opacity"
                        style={{ color: dockColor }}
                      >
                        View Dock
                        <ChevronRight className="w-3 h-3" />
                      </button>
                    </div>

                    {/* Ships grid */}
                    {dockShips.length === 0 ? (
                      <div
                        className="px-4 py-3 border-2 border-dashed text-[10px] font-black uppercase tracking-wider"
                        style={{ borderColor: dockColor + '40', color: 'var(--color-muted)' }}
                      >
                        No ships docked — open dock to add one
                      </div>
                    ) : (
                      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
                        {dockShips.map(ship => (
                          <button
                            key={ship.id}
                            onClick={() => onSelectBoard(ship.id)}
                            className="group text-left p-3 border-2 transition-all duration-100 relative overflow-hidden"
                            style={{
                              borderColor: 'var(--color-border)',
                              background: 'var(--color-surface)',
                              boxShadow: '2px 2px 0 var(--color-border)'
                            }}
                            onMouseOver={e => {
                              e.currentTarget.style.borderColor = dockColor
                              e.currentTarget.style.transform = 'translate(-1px,-1px)'
                              e.currentTarget.style.boxShadow = `3px 3px 0 ${dockColor}`
                            }}
                            onMouseOut={e => {
                              e.currentTarget.style.borderColor = 'var(--color-border)'
                              e.currentTarget.style.transform = ''
                              e.currentTarget.style.boxShadow = '2px 2px 0 var(--color-border)'
                            }}
                          >
                            {/* Top accent */}
                            <div
                              className="absolute top-0 left-0 right-0 h-0.5"
                              style={{ background: dockColor }}
                            />
                            <Ship className="w-4 h-4 mb-2" style={{ color: dockColor }} />
                            <div className="font-black text-xs uppercase tracking-wide leading-tight line-clamp-2" style={{ color: 'var(--color-text)' }}>
                              {ship.name}
                            </div>
                            <div className="flex items-center justify-between mt-2">
                              <Package className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity" style={{ color: dockColor }} />
                              <ChevronRight className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity" style={{ color: dockColor }} />
                            </div>
                          </button>
                        ))}
                      </div>
                    )}
                  </section>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {showCreateDock && (
        <CreateDockModal
          title="Launch New Dock"
          onClose={() => setShowCreateDock(false)}
          onCreate={handleCreateDock}
        />
      )}
    </div>
  )
}
