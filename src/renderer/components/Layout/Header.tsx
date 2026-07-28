import React, { useState, useEffect, useRef, useCallback } from 'react'
import {
  Search,
  Settings,
  Moon,
  Sun,
  Anchor,
  Folder,
  FolderKanban,
  KanbanSquare,
  X,
  ArrowRight
} from 'lucide-react'

interface SearchResult {
  id: string
  type: 'project' | 'board' | 'workspace'
  name: string
  subtitle?: string
  color?: string
  projectId?: string
}

interface HeaderProps {
  onOpenSettings: () => void
  onToggleTheme: () => void
  isDarkMode: boolean
  onSearch: (query: string) => void
  onSelectProject: (projectId: string) => void
  onSelectBoard: (boardId: string, projectId: string) => void
}

export const Header: React.FC<HeaderProps> = ({
  onOpenSettings,
  onToggleTheme,
  isDarkMode,
  onSearch,
  onSelectProject,
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
      const [projects, boards, workspaces] = await Promise.all([
        window.electron.db.findAll('projects'),
        window.electron.db.findAll('boards'),
        window.electron.db.findAll('workspaces')
      ])

      const matched: SearchResult[] = []

      workspaces
        .filter((f: any) => f.name?.toLowerCase().includes(lower))
        .slice(0, 3)
        .forEach((f: any) => {
          matched.push({
            id: f.id,
            type: 'workspace',
            name: f.name,
            subtitle: 'Workspace',
            color: f.color || '#2563eb'
          })
        })

      projects
        .filter((d: any) => d.name?.toLowerCase().includes(lower))
        .slice(0, 5)
        .forEach((d: any) => {
          const workspace = workspaces.find((candidate: any) => candidate.id === d.workspaceId)
          matched.push({
            id: d.id,
            type: 'project',
            name: d.name,
            subtitle: workspace ? `in ${workspace.name}` : 'Unassigned Project',
            color: d.color || '#2563eb'
          })
        })

      // Boards (kanban boards)
      boards
        .filter((b: any) => b.name?.toLowerCase().includes(lower))
        .slice(0, 6)
        .forEach((b: any) => {
          const project = projects.find((candidate: any) => candidate.id === b.projectId)
          matched.push({
            id: b.id,
            type: 'board',
            name: b.name,
            subtitle: project ? `Board in ${project.name}` : 'Board',
            color: b.color || '#0891b2',
            projectId: b.projectId
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
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node) &&
        inputRef.current &&
        !inputRef.current.contains(e.target as Node)
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

    if (result.type === 'project') {
      onSelectProject(result.id)
    } else if (result.type === 'board') {
      if (result.projectId) {
        onSelectProject(result.projectId)
        setTimeout(() => onSelectBoard(result.id, result.projectId!), 50)
      }
    } else if (result.type === 'workspace') {
      // Workspaces are represented by their projects in navigation.
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
    if (type === 'workspace') return <Folder className="w-4 h-4" />
    if (type === 'project') return <FolderKanban className="w-4 h-4" />
    return <KanbanSquare className="w-4 h-4" />
  }

  const typeLabel = (type: SearchResult['type']) => {
    if (type === 'workspace') return 'WORKSPACE'
    if (type === 'project') return 'PROJECT'
    return 'BOARD'
  }

  // Group results by type
  const grouped: Record<string, SearchResult[]> = {}
  results.forEach((r) => {
    if (!grouped[r.type]) grouped[r.type] = []
    grouped[r.type].push(r)
  })
  const typeOrder: SearchResult['type'][] = ['workspace', 'project', 'board']

  return (
    <header
      className="aero-toolbar h-16 flex items-center justify-between px-6 z-40 border-b"
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
            className="w-10 h-10 flex items-center justify-center border border-white/60 rounded-md"
            style={{
              background:
                'linear-gradient(180deg, var(--color-secondary), var(--color-primary-hover))',
              boxShadow: 'inset 0 1px 0 rgba(255,255,255,.65), 0 2px 5px rgba(0,0,0,.35)'
            }}
          >
            <Anchor className="w-5 h-5 text-white" strokeWidth={2.5} />
          </div>
          <div className="leading-tight text-white">
            <span className="block text-xs font-black uppercase tracking-[0.2em] opacity-80">
              Shipyard
            </span>
            <span className="block text-lg font-black uppercase tracking-tight">Workspace</span>
          </div>
        </div>

        {/* Search with dropdown */}
        <div className="flex-1 max-w-2xl relative">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/70 pointer-events-none" />
            <input
              ref={inputRef}
              type="text"
              value={query}
              placeholder="Search workspaces, projects, boards..."
              className="w-full pl-10 pr-10 py-2 text-sm font-semibold border bg-white/10 text-white placeholder:text-white/60 focus:outline-none transition-all rounded-sm"
              style={{
                borderColor: 'white',
                boxShadow: 'inset 0 1px 4px rgba(0,0,0,.32), 0 1px 0 rgba(255,255,255,.22)'
              }}
              onChange={(e) => setQuery(e.target.value)}
              onFocus={() => query && results.length > 0 && setIsOpen(true)}
              onKeyDown={handleKeyDown}
            />
            {query && (
              <button
                className="absolute right-3 top-1/2 -translate-y-1/2 text-white/60 hover:text-white transition-colors"
                onClick={() => {
                  setQuery('')
                  setIsOpen(false)
                  onSearch('')
                }}
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* Dropdown */}
          {isOpen && (
            <div
              ref={dropdownRef}
              className="aero-window absolute top-full left-0 right-0 mt-2 z-50 overflow-hidden animate-brutal-in"
              style={{
                background: 'var(--color-surface)',
                border: '1px solid var(--color-border-strong)',
                boxShadow: 'var(--shadow-window)',
                maxHeight: '420px',
                overflowY: 'auto',
                borderRadius: '6px'
              }}
            >
              {isLoading ? (
                <div
                  className="px-4 py-3 text-xs font-black uppercase tracking-wider"
                  style={{ color: 'var(--color-muted)' }}
                >
                  Searching...
                </div>
              ) : results.length === 0 ? (
                <div
                  className="px-4 py-3 text-xs font-black uppercase tracking-wider"
                  style={{ color: 'var(--color-muted)' }}
                >
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
                            color:
                              type === 'workspace'
                                ? '#1b4f82'
                                : type === 'project'
                                  ? '#0b6c90'
                                  : '#1f7acb'
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
                                background: isHot
                                  ? result.color || 'var(--color-primary)'
                                  : 'transparent',
                                color: isHot ? '#041020' : 'var(--color-text)'
                              }}
                              onClick={() => handleSelect(result)}
                              onMouseEnter={() => setHighlighted(globalIdx)}
                            >
                              {/* Color dot / icon */}
                              <div
                                className="w-9 h-9 border-2 flex items-center justify-center shrink-0 transition-all"
                                style={{
                                  borderColor: isHot
                                    ? '#041020'
                                    : result.color || 'var(--color-primary)',
                                  background: isHot
                                    ? 'rgba(255,255,255,0.8)'
                                    : (result.color || '#2563eb') + '12',
                                  color: isHot ? '#041020' : result.color || 'var(--color-primary)',
                                  boxShadow: isHot
                                    ? 'var(--shadow-control)'
                                    : `0 2px 6px ${result.color || '#2563eb'}45`
                                }}
                              >
                                {typeIcon(result.type)}
                              </div>

                              <div className="flex-1 min-w-0">
                                <div className="font-semibold text-sm truncate">{result.name}</div>
                                {result.subtitle && (
                                  <div
                                    className="text-[11px] font-medium tracking-wide truncate mt-0.5"
                                    style={{
                                      color: isHot ? 'rgba(3,16,31,0.65)' : 'var(--color-muted)'
                                    }}
                                  >
                                    {result.subtitle}
                                  </div>
                                )}
                              </div>

                              {result.type !== 'workspace' && (
                                <ArrowRight
                                  className="w-4 h-4 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
                                  style={{ color: isHot ? '#041020' : 'var(--color-primary)' }}
                                />
                              )}

                              {result.type === 'workspace' && (
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
                    style={{
                      background: 'var(--color-surface-2)',
                      color: 'var(--color-muted)',
                      borderTop: '2px solid var(--color-border-strong)'
                    }}
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
            className="aero-icon-button p-2.5 text-white transition-all duration-150"
            title={isDarkMode ? 'Light Mode' : 'Dark Mode'}
          >
            {isDarkMode ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </button>
          <button
            onClick={onOpenSettings}
            className="aero-icon-button p-2.5 text-white transition-all duration-150"
            title="Settings"
          >
            <Settings className="w-4 h-4" />
          </button>
        </div>
      </div>
    </header>
  )
}
