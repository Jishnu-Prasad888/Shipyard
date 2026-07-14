import React, { useState, useEffect, useRef, useCallback } from 'react'
import {
  Search,
  Settings,
  Moon,
  Sun,
  Anchor,
  Folder,
  Grid,
  Ship,
  X,
  ArrowRight,
  Cloud,
  CloudOff,
  RefreshCw,
  AlertTriangle
} from 'lucide-react'

interface SearchResult {
  id: string
  type: 'dock' | 'board' | 'folder'
  name: string
  subtitle?: string
  color?: string
  dockId?: string   // for boards: the dock they belong to
  folderId?: string // for docks: the folder they're in
}

interface HeaderProps {
  onOpenSettings: () => void
  onToggleTheme: () => void
  isDarkMode: boolean
  onSearch: (query: string) => void
  onSelectDock: (dockId: string) => void
  onSelectBoard: (boardId: string, dockId: string) => void
}

export const Header: React.FC<HeaderProps> = ({
  onOpenSettings,
  onToggleTheme,
  isDarkMode,
  onSearch,
  onSelectDock,
  onSelectBoard
}) => {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [isOpen, setIsOpen] = useState(false)
  const [highlighted, setHighlighted] = useState(0)
  const [isLoading, setIsLoading] = useState(false)
  const [syncStatus, setSyncStatus] = useState<any>(null)
  const [syncLoading, setSyncLoading] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const syncIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const runSearch = useCallback(async (q: string) => {
    if (!q.trim()) {
      setResults([])
      setIsOpen(false)
      return
    }

    setIsLoading(true)
    try {
      const lower = q.toLowerCase()
      const [docks, boards, folders] = await Promise.all([
        window.electron.db.findAll('docks'),
        window.electron.db.findAll('boards'),
        window.electron.db.findAll('folders')
      ])

      const matched: SearchResult[] = []

      // Folders
      folders
        .filter((f: any) => f.name?.toLowerCase().includes(lower))
        .slice(0, 3)
        .forEach((f: any) => {
          matched.push({
            id: f.id,
            type: 'folder',
            name: f.name,
            subtitle: 'Folder',
            color: f.color || '#2563eb'
          })
        })

      // Docks
      docks
        .filter((d: any) => d.name?.toLowerCase().includes(lower))
        .slice(0, 5)
        .forEach((d: any) => {
          const folder = folders.find((f: any) => f.id === d.folderId)
          matched.push({
            id: d.id,
            type: 'dock',
            name: d.name,
            subtitle: folder ? `in ${folder.name}` : 'Dock',
            color: d.color || '#2563eb'
          })
        })

      // Boards (kanban boards)
      boards
        .filter((b: any) => b.name?.toLowerCase().includes(lower))
        .slice(0, 6)
        .forEach((b: any) => {
          const dock = docks.find((d: any) => d.id === b.dockId)
          matched.push({
            id: b.id,
            type: 'board',
            name: b.name,
            subtitle: dock ? `Board in ${dock.name}` : 'Kanban Board',
            color: b.color || '#0891b2',
            dockId: b.dockId
          })
        })

      setResults(matched)
      setIsOpen(matched.length > 0)
      setHighlighted(0)
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      runSearch(query)
      onSearch(query)
    }, 200)
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [query])

  // Close dropdown on outside click
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (
        dropdownRef.current && !dropdownRef.current.contains(e.target as Node) &&
        inputRef.current && !inputRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false)
      }
    }
    window.addEventListener('mousedown', handleClick)
    return () => window.removeEventListener('mousedown', handleClick)
  }, [])

  const loadSyncStatus = useCallback(async () => {
    setSyncLoading(true)
    try {
      const status = await window.electron.sync.status()
      setSyncStatus(status)
    } catch (err) {
      console.error('Sync status error', err)
      setSyncStatus(null)
    } finally {
      setSyncLoading(false)
    }
  }, [])

  useEffect(() => {
    loadSyncStatus()
    if (syncIntervalRef.current) clearInterval(syncIntervalRef.current)
    syncIntervalRef.current = setInterval(loadSyncStatus, 30000)
    return () => {
      if (syncIntervalRef.current) clearInterval(syncIntervalRef.current)
    }
  }, [loadSyncStatus])

  const handleSelect = (result: SearchResult) => {
    setIsOpen(false)
    setQuery('')
    onSearch('')

    if (result.type === 'dock') {
      onSelectDock(result.id)
    } else if (result.type === 'board') {
      if (result.dockId) {
        onSelectDock(result.dockId)
        // Brief delay so dock is selected first, then navigate to board
        setTimeout(() => onSelectBoard(result.id, result.dockId!), 50)
      }
    } else if (result.type === 'folder') {
      // Folders aren't directly navigable, but we can show a hint
      // For now just clear search — could expand folder in sidebar
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!isOpen || results.length === 0) return

    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setHighlighted((h) => (h + 1) % results.length)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setHighlighted((h) => (h - 1 + results.length) % results.length)
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (results[highlighted]) handleSelect(results[highlighted])
    } else if (e.key === 'Escape') {
      setIsOpen(false)
      setQuery('')
      onSearch('')
      inputRef.current?.blur()
    }
  }

  const typeIcon = (type: SearchResult['type']) => {
    if (type === 'folder') return <Folder className="w-4 h-4" />
    if (type === 'dock') return <Grid className="w-4 h-4" />
    return <Ship className="w-4 h-4" />
  }

  const typeLabel = (type: SearchResult['type']) => {
    if (type === 'folder') return 'PORT'
    if (type === 'dock') return 'DOCK'
    return 'SHIP'
  }

  // Group results by type
  const grouped: Record<string, SearchResult[]> = {}
  results.forEach((r) => {
    if (!grouped[r.type]) grouped[r.type] = []
    grouped[r.type].push(r)
  })
  const typeOrder: SearchResult['type'][] = ['folder', 'dock', 'board']

  return (
    <header
      className="h-16 flex items-center justify-between px-6 z-40 border-b-4"
      style={{
        background: 'var(--color-header)',
        borderColor: 'var(--color-border-strong)',
        boxShadow: 'var(--shadow-brutal)'
      }}
    >
      <div className="flex items-center justify-between w-full gap-6">
        {/* Logo */}
        <div className="flex items-center gap-3 shrink-0">
          <div
            className="w-10 h-10 flex items-center justify-center border-2"
            style={{
              background: 'var(--color-border-strong)',
              borderColor: 'var(--color-header-button-border)',
              boxShadow: 'var(--shadow-brutal-sm)',
              color: 'var(--color-header-foreground)'
            }}
          >
            <Anchor className="w-5 h-5" strokeWidth={2.5} />
          </div>
          <div className="leading-tight" style={{ color: 'var(--color-header-foreground)' }}>
            <span className="block text-xs font-black uppercase tracking-[0.2em] opacity-80">Shipyard</span>
            <span className="block text-lg font-black uppercase tracking-tight">Fleet Workspace</span>
          </div>
        </div>

        {/* Search with dropdown */}
        <div className="flex-1 max-w-2xl relative header-search">
          <div className="relative">
            <Search
              className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none"
              style={{ color: 'var(--color-header-muted)' }}
            />
            <input
              ref={inputRef}
              type="text"
              value={query}
              placeholder="Search ships, docks, ports…"
              className="w-full pl-10 pr-10 py-2 text-sm font-bold uppercase tracking-wide border-2 focus:outline-none transition-all"
              style={{
                borderColor: 'var(--color-header-button-border)',
                boxShadow: 'var(--shadow-brutal-sm)',
                background: 'var(--color-surface)',
                color: 'var(--color-header-foreground)',
                caretColor: 'var(--color-primary)'
              }}
              onChange={(e) => setQuery(e.target.value)}
              onFocus={() => query && results.length > 0 && setIsOpen(true)}
              onKeyDown={handleKeyDown}
            />
            {query && (
              <button
                className="absolute right-3 top-1/2 -translate-y-1/2 transition-colors"
                style={{ color: 'var(--color-header-muted)' }}
                onClick={() => { setQuery(''); setIsOpen(false); onSearch('') }}
                onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--color-header-foreground)')}
                onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--color-header-muted)')}
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* Dropdown */}
          {isOpen && (
            <div
              ref={dropdownRef}
              className="absolute top-full left-0 right-0 mt-3 z-50 overflow-hidden animate-brutal-in"
              style={{
                background: 'var(--color-surface)',
                border: '3px solid var(--color-border-strong)',
                boxShadow: 'var(--shadow-brutal)',
                maxHeight: '420px',
                overflowY: 'auto',
                borderRadius: '12px'
              }}
            >
              {isLoading ? (
                <div className="px-4 py-3 text-xs font-black uppercase tracking-wider" style={{ color: 'var(--color-muted)' }}>
                  Searching...
                </div>
              ) : results.length === 0 ? (
                <div className="px-4 py-3 text-xs font-black uppercase tracking-wider" style={{ color: 'var(--color-muted)' }}>
                  No results for "{query}"
                </div>
              ) : (
                <>
                  {typeOrder.map((type) => {
                    const group = grouped[type]
                    if (!group || group.length === 0) return null
                    return (
                      <div key={type}>
                        {/* Group header */}
                      <div
                          className="px-4 py-1.5 text-[10px] font-black uppercase tracking-[0.22em] border-b-2 flex items-center gap-2"
                          style={{
                            background: 'var(--color-surface-3)',
                            borderColor: 'var(--color-border-strong)',
                            color: type === 'folder' ? '#1b4f82' : type === 'dock' ? '#0b6c90' : '#1f7acb'
                          }}
                        >
                          {typeIcon(type)}
                          {typeLabel(type)}S
                        </div>

                        {/* Results in group */}
                        {group.map((result) => {
                          const globalIdx = results.indexOf(result)
                          const isHot = highlighted === globalIdx
                          return (
                          <button
                            key={result.id}
                            className="w-full text-left px-4 py-3 flex items-center gap-3 border-b-2 transition-all duration-100 group"
                            style={{
                              borderColor: 'var(--color-border)',
                              background: isHot ? (result.color || 'var(--color-primary)') : 'transparent',
                              color: isHot ? '#041020' : 'var(--color-text)'
                            }}
                              onClick={() => handleSelect(result)}
                              onMouseEnter={() => setHighlighted(globalIdx)}
                            >
                              {/* Color dot / icon */}
                              <div
                                className="w-9 h-9 border-2 flex items-center justify-center shrink-0 transition-all"
                                style={{
                                  borderColor: isHot ? '#041020' : result.color || 'var(--color-primary)',
                                  background: isHot ? 'rgba(255,255,255,0.8)' : (result.color || '#2563eb') + '12',
                                  color: isHot ? '#041020' : result.color || 'var(--color-primary)',
                                  boxShadow: isHot ? 'var(--shadow-brutal-sm)' : `3px 3px 0 ${(result.color || '#2563eb')}`
                                }}
                              >
                                {typeIcon(result.type)}
                              </div>

                              <div className="flex-1 min-w-0">
                                <div className="font-semibold text-sm truncate">{result.name}</div>
                                {result.subtitle && (
                                  <div
                                    className="text-[11px] font-medium tracking-wide truncate mt-0.5"
                                    style={{ color: isHot ? 'rgba(3,16,31,0.65)' : 'var(--color-muted)' }}
                                  >
                                    {result.subtitle}
                                  </div>
                                )}
                              </div>

                              {result.type !== 'folder' && (
                                <ArrowRight
                                  className="w-4 h-4 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
                                  style={{ color: isHot ? '#041020' : 'var(--color-primary)' }}
                                />
                              )}

                              {result.type === 'folder' && (
                                <span
                                  className="text-[10px] font-semibold uppercase px-2 py-0.5 border rounded-full shrink-0"
                                  style={{
                                    borderColor: isHot ? '#041020' : 'var(--color-border-strong)',
                                    color: isHot ? '#041020' : 'var(--color-muted)'
                                  }}
                                >
                                  Not navigable
                                </span>
                              )}
                            </button>
                          )
                        })}
                      </div>
                    )
                  })}

                  {/* Footer hint */}
                  <div
                    className="px-4 py-2 text-[10px] font-black uppercase tracking-[0.22em] flex items-center gap-3"
                    style={{ background: 'var(--color-surface-2)', color: 'var(--color-muted)', borderTop: '2px solid var(--color-border-strong)' }}
                  >
                    <span>↑↓ Navigate</span>
                    <span>↵ Select</span>
                    <span>Esc Close</span>
                  </div>
                </>
              )}
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={loadSyncStatus}
            className="flex items-center gap-1 px-3 py-1.5 border-2 text-xs font-black uppercase tracking-wider transition-all duration-100"
            style={{
              borderColor:
                syncStatus?.syncEnabled
                  ? (syncStatus?.unsyncedCount || 0) > 0
                    ? '#d97706'
                    : '#10b981'
                  : 'var(--color-header-button-border)',
              color:
                syncStatus?.syncEnabled
                  ? (syncStatus?.unsyncedCount || 0) > 0
                    ? '#d97706'
                    : '#10b981'
                  : 'var(--color-header-muted)',
              background:
                syncStatus?.syncEnabled
                  ? (syncStatus?.unsyncedCount || 0) > 0
                    ? 'rgba(217,119,6,0.15)'
                    : 'rgba(16,185,129,0.15)'
                  : 'var(--color-header-button-bg)',
              boxShadow: 'var(--shadow-brutal-sm)'
            }}
            title="Server sync status"
          >
            {syncLoading ? (
              <RefreshCw className="w-4 h-4 animate-spin" />
            ) : syncStatus?.syncEnabled ? (
              (syncStatus?.unsyncedCount || 0) > 0 ? (
                <AlertTriangle className="w-4 h-4" />
              ) : (
                <Cloud className="w-4 h-4" />
              )
            ) : (
              <CloudOff className="w-4 h-4" />
            )}
            <span>
              {syncStatus?.syncEnabled
                ? (syncStatus?.unsyncedCount || 0) > 0
                  ? `${syncStatus.unsyncedCount} Pending`
                  : 'Synced'
                : 'Sync Off'}
            </span>
          </button>
          <button
            onClick={onToggleTheme}
            className="p-2.5 border-2 font-black transition-all duration-100 hover:-translate-x-0.5 hover:-translate-y-0.5"
            style={{
              borderColor: 'var(--color-header-button-border)',
              color: 'var(--color-header-foreground)',
              background: 'var(--color-header-button-bg)',
              boxShadow: 'var(--shadow-brutal-sm)'
            }}
            title={isDarkMode ? 'Light Mode' : 'Dark Mode'}
          >
            {isDarkMode ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </button>
          <button
            onClick={onOpenSettings}
            className="p-2.5 border-2 font-black transition-all duration-100 hover:-translate-x-0.5 hover:-translate-y-0.5"
            style={{
              borderColor: 'var(--color-header-button-border)',
              color: 'var(--color-header-foreground)',
              background: 'var(--color-header-button-bg)',
              boxShadow: 'var(--shadow-brutal-sm)'
            }}
            title="Settings"
          >
            <Settings className="w-4 h-4" />
          </button>
        </div>
      </div>
    </header>
  )
}
