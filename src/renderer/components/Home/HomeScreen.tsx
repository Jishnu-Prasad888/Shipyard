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
        style={{
          borderColor: 'var(--color-border-strong)',
          background: 'var(--color-surface)',
          boxShadow: 'var(--shadow-brutal)'
        }}
      >
        <div className="flex items-center gap-3">
          <div
            className="w-10 h-10 flex items-center justify-center border-3"
            style={{
              background: 'var(--color-primary)',
              borderColor: 'var(--color-border-strong)',
              boxShadow: 'var(--shadow-brutal-sm)'
            }}
          >
            <Anchor className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-black uppercase tracking-tight leading-none" style={{ color: 'var(--color-text)' }}>
              Your Fleet
            </h1>
            <p className="text-[11px] font-black uppercase tracking-[0.24em] leading-none mt-1" style={{ color: 'var(--color-muted)' }}>
              {docks.length} docks · {ships.length} ships
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Filter input */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none" style={{ color: 'var(--color-muted)' }} />
            <input
              type="text"
              value={filter}
              onChange={e => setFilter(e.target.value)}
              placeholder="Filter..."
              className="pl-10 pr-10 py-2 border-2 text-sm font-bold uppercase tracking-wide focus:outline-none w-48"
              style={{
                borderColor: 'var(--color-border-strong)',
                background: 'var(--color-surface-2)',
                color: 'var(--color-text)',
                boxShadow: 'var(--shadow-brutal-sm)'
              }}
            />
            {filter && (
              <button
                onClick={() => setFilter('')}
                className="absolute right-3 top-1/2 -translate-y-1/2"
                style={{ color: 'var(--color-muted)' }}
              >
                <X className="w-4 h-4" />
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
          className="w-48 shrink-0 border-r-4 flex flex-col overflow-y-auto"
          style={{
            borderColor: 'var(--color-border-strong)',
            background: 'var(--color-surface)',
            boxShadow: 'var(--shadow-brutal)'
          }}
        >
          <div
            className="px-4 py-3 text-[10px] font-black uppercase tracking-[0.24em] border-b-4"
            style={{ borderColor: 'var(--color-border-strong)', color: 'var(--color-muted)' }}
          >
            Ports
          </div>

          <div className="space-y-2 px-2 py-3">
            {/* All */}
            <button
              onClick={() => setActivePort('all')}
              className="flex items-center gap-2 px-3 py-2.5 text-left transition-all duration-100"
              style={{
                border: '2px solid',
                borderColor: activePort === 'all' ? 'var(--color-primary)' : 'transparent',
                background: activePort === 'all' ? 'var(--color-primary-soft)' : 'transparent',
                color: 'var(--color-text)',
                boxShadow: activePort === 'all' ? 'var(--shadow-brutal-sm)' : 'none'
              }}
            >
              <Compass className="w-4 h-4 shrink-0" />
              <span className="text-xs font-black uppercase tracking-wide flex-1">All</span>
              <span className="text-[10px] font-black opacity-70">{docks.length}</span>
            </button>

            {/* Port tabs */}
            {ports.map(port => {
              const portDockCount = docks.filter(d => d.folderId === port.id).length
              const isActive = activePort === port.id
              return (
                <button
                  key={port.id}
                  onClick={() => setActivePort(port.id)}
                className="flex items-center gap-2 px-3 py-2.5 text-left transition-all duration-100"
                style={{
                  border: '2px solid',
                  borderColor: isActive ? (port.color || '#2563eb') : 'transparent',
                  background: isActive ? (port.color || '#2563eb') + '1a' : 'transparent',
                  color: 'var(--color-text)',
                  boxShadow: isActive ? 'var(--shadow-brutal-sm)' : 'none'
                }}
              >
                <div
                  className="w-2.5 h-2.5 border-2 shrink-0"
                  style={{
                    background: port.color || '#2563eb',
                    borderColor: 'var(--color-border-strong)'
                  }}
                />
                <span className="text-xs font-black uppercase tracking-wide flex-1 truncate">{port.name}</span>
                <span className="text-[10px] font-black opacity-70">{portDockCount}</span>
              </button>
            )
          })}

            {/* Uncategorized */}
            {uncategorizedCount > 0 && (
              <button
                onClick={() => setActivePort('uncategorized')}
                className="flex items-center gap-2 px-3 py-2.5 text-left transition-all duration-100"
                style={{
                  border: '2px solid',
                  borderColor: activePort === 'uncategorized' ? 'var(--color-muted)' : 'transparent',
                  background: activePort === 'uncategorized' ? 'rgba(54,80,107,0.16)' : 'transparent',
                  color: activePort === 'uncategorized' ? 'var(--color-text)' : 'var(--color-muted)',
                  boxShadow: activePort === 'uncategorized' ? 'var(--shadow-brutal-sm)' : 'none'
                }}
              >
                <Anchor className="w-4 h-4 shrink-0 opacity-70" />
                <span className="text-xs font-black uppercase tracking-wide flex-1">Uncharted</span>
                <span className="text-[10px] font-black opacity-70">{uncategorizedCount}</span>
              </button>
            )}
          </div>
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
                        background: c + '10',
                        boxShadow: `var(--shadow-brutal-sm)`
                      }}
                      onMouseOver={e => {
                        e.currentTarget.style.transform = 'translate(-2px,-2px)'
                        e.currentTarget.style.boxShadow = `var(--shadow-brutal)`
                      }}
                      onMouseOut={e => {
                        e.currentTarget.style.transform = ''
                        e.currentTarget.style.boxShadow = `var(--shadow-brutal-sm)`
                      }}
                    >
                      <Ship className="w-5 h-5 mb-2" style={{ color: c }} />
                      <div className="text-[11px] font-black uppercase leading-tight break-words whitespace-pre-wrap" style={{ color: 'var(--color-text)' }}>
                        {ship.name}
                      </div>
                      {dock && (
                        <div className="text-[9px] font-bold mt-1 break-words whitespace-pre-wrap" style={{ color: c }}>
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
                    <div
                      className="flex items-center gap-3 mb-3 px-3 py-2 rounded-xl"
                      style={{
                        background: 'var(--color-surface-2)',
                        border: '1px solid var(--color-border)',
                        boxShadow: 'var(--shadow-brutal-sm)'
                      }}
                    >
                      <div
                        className="w-2.5 h-8 rounded-full shrink-0"
                        style={{ background: dockColor, boxShadow: `0 12px 28px ${dockColor}33` }}
                      />
                      <h2 className="font-semibold text-sm uppercase tracking-wide" style={{ color: 'var(--color-text)' }}>
                        {dock.name}
                      </h2>
                      {port && (
                        <span
                          className="text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 border rounded-full"
                          style={{ borderColor: port.color || dockColor, color: port.color || dockColor }}
                        >
                          {port.name}
                        </span>
                      )}
                      <div className="h-px flex-1" style={{ background: dockColor + '30' }} />
                      <button
                        onClick={() => onSelectDock(dock.id)}
                        className="flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide px-3 py-1.5 rounded-full transition-all duration-150"
                        style={{
                          color: dockColor,
                          background: 'rgba(255,255,255,0.04)',
                          border: '1px solid var(--color-border)'
                        }}
                      >
                        View Dock
                        <ChevronRight className="w-3 h-3" />
                      </button>
                    </div>

                    {/* Ships grid */}
                    {dockShips.length === 0 ? (
                      <div
                        className="px-4 py-3 border-4 border-dashed text-[10px] font-black uppercase tracking-wider"
                        style={{ borderColor: dockColor + '70', color: 'var(--color-muted)' }}
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
                              boxShadow: 'var(--shadow-brutal-sm)'
                            }}
                            onMouseOver={e => {
                              e.currentTarget.style.borderColor = dockColor
                              e.currentTarget.style.transform = 'translate(-2px,-2px)'
                              e.currentTarget.style.boxShadow = `var(--shadow-brutal)`
                            }}
                            onMouseOut={e => {
                              e.currentTarget.style.borderColor = 'var(--color-border)'
                              e.currentTarget.style.transform = ''
                              e.currentTarget.style.boxShadow = 'var(--shadow-brutal-sm)'
                            }}
                          >
                            {/* Top accent */}
                            <div
                              className="absolute top-0 left-0 right-0 h-1"
                              style={{ background: dockColor }}
                            />
                            <Ship className="w-4 h-4 mb-2" style={{ color: dockColor }} />
                            <div className="font-black text-xs uppercase tracking-wide leading-tight break-words whitespace-pre-wrap" style={{ color: 'var(--color-text)' }}>
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
