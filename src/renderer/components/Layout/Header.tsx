import React, { useState, useEffect, useRef, useCallback } from 'react'
import { Search, Settings, Moon, Sun, Anchor, Folder, Grid, Ship, X, ArrowRight } from 'lucide-react'

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
  const inputRef = useRef<HTMLInputElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

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
      className="h-14 flex items-center justify-between px-5 z-40 border-b-4"
      style={{
        background: 'var(--color-primary)',
        borderColor: 'var(--color-border-strong)'
      }}
    >
      {/* Logo */}
      <div className="flex items-center gap-3 shrink-0">
        <div
          className="w-8 h-8 flex items-center justify-center border-2 border-white"
          style={{ background: 'var(--color-border-strong)', boxShadow: '2px 2px 0 white' }}
        >
          <Anchor className="w-4 h-4 text-white stroke-[3px]" />
        </div>
        <span className="font-black text-xl tracking-tight text-white uppercase" style={{ letterSpacing: '0.08em' }}>
          SHIPYARD
        </span>
      </div>

      {/* Search with dropdown */}
      <div className="flex-1 max-w-lg mx-8 relative">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/70 pointer-events-none" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            placeholder="SEARCH SHIPS, DOCKS, PORTS..."
            className="w-full pl-9 pr-8 py-1.5 text-xs font-bold uppercase tracking-wider border-2 border-white bg-transparent text-white placeholder:text-white/50 focus:outline-none focus:bg-white/10 transition-all"
            style={{ boxShadow: '3px 3px 0 rgba(0,0,0,0.3)' }}
            onChange={(e) => setQuery(e.target.value)}
            onFocus={() => query && results.length > 0 && setIsOpen(true)}
            onKeyDown={handleKeyDown}
          />
          {query && (
            <button
              className="absolute right-2 top-1/2 -translate-y-1/2 text-white/60 hover:text-white transition-colors"
              onClick={() => { setQuery(''); setIsOpen(false); onSearch('') }}
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Dropdown */}
        {isOpen && (
          <div
            ref={dropdownRef}
            className="absolute top-full left-0 right-0 mt-2 z-50 overflow-hidden animate-brutal-in"
            style={{
              background: 'var(--color-surface)',
              border: '3px solid var(--color-border-strong)',
              boxShadow: '6px 6px 0 var(--color-border-strong)',
              maxHeight: '420px',
              overflowY: 'auto'
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
                        className="px-4 py-1.5 text-[10px] font-black uppercase tracking-widest border-b-2 flex items-center gap-2"
                        style={{
                          background: type === 'folder' ? '#eff6ff' : type === 'dock' ? '#ecfeff' : '#f5f3ff',
                          borderColor: 'var(--color-border)',
                          color: type === 'folder' ? '#1d4ed8' : type === 'dock' ? '#0e7490' : '#6d28d9'
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
                            className="w-full text-left px-4 py-3 flex items-center gap-3 border-b-2 transition-all duration-75 group"
                            style={{
                              borderColor: 'var(--color-border)',
                              background: isHot ? result.color || 'var(--color-primary)' : 'transparent',
                              color: isHot ? 'white' : 'var(--color-text)'
                            }}
                            onClick={() => handleSelect(result)}
                            onMouseEnter={() => setHighlighted(globalIdx)}
                          >
                            {/* Color dot / icon */}
                            <div
                              className="w-8 h-8 border-2 flex items-center justify-center shrink-0 transition-all"
                              style={{
                                borderColor: isHot ? 'white' : result.color || 'var(--color-primary)',
                                background: isHot ? 'rgba(255,255,255,0.2)' : (result.color || '#2563eb') + '15',
                                color: isHot ? 'white' : result.color || 'var(--color-primary)',
                                boxShadow: isHot ? '2px 2px 0 rgba(255,255,255,0.3)' : `2px 2px 0 ${result.color || '#2563eb'}`
                              }}
                            >
                              {typeIcon(result.type)}
                            </div>

                            <div className="flex-1 min-w-0">
                              <div className="font-black text-sm truncate">{result.name}</div>
                              {result.subtitle && (
                                <div
                                  className="text-[10px] font-bold uppercase tracking-wider truncate mt-0.5"
                                  style={{ color: isHot ? 'rgba(255,255,255,0.7)' : 'var(--color-muted)' }}
                                >
                                  {result.subtitle}
                                </div>
                              )}
                            </div>

                            {result.type !== 'folder' && (
                              <ArrowRight
                                className="w-4 h-4 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
                                style={{ color: isHot ? 'white' : 'var(--color-primary)' }}
                              />
                            )}

                            {result.type === 'folder' && (
                              <span
                                className="text-[9px] font-black uppercase px-2 py-0.5 border shrink-0"
                                style={{
                                  borderColor: isHot ? 'white' : 'var(--color-border)',
                                  color: isHot ? 'white' : 'var(--color-muted)'
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
                  className="px-4 py-2 text-[10px] font-black uppercase tracking-widest flex items-center gap-3"
                  style={{ background: 'var(--color-background)', color: 'var(--color-muted)', borderTop: '2px solid var(--color-border)' }}
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
          onClick={onToggleTheme}
          className="p-2 border-2 border-white text-white font-black transition-all duration-100 hover:-translate-x-0.5 hover:-translate-y-0.5"
          style={{ boxShadow: '2px 2px 0 rgba(0,0,0,0.3)' }}
          title={isDarkMode ? 'Light Mode' : 'Dark Mode'}
        >
          {isDarkMode ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
        </button>
        <button
          onClick={onOpenSettings}
          className="p-2 border-2 border-white text-white font-black transition-all duration-100 hover:-translate-x-0.5 hover:-translate-y-0.5"
          style={{ boxShadow: '2px 2px 0 rgba(0,0,0,0.3)' }}
          title="Settings"
        >
          <Settings className="w-4 h-4" />
        </button>
      </div>
    </header>
  )
}
