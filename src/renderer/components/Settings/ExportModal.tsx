import React, { useState, useEffect, useCallback } from 'react'
import {
  X, ChevronRight, ChevronDown, Download, Loader,
  CheckCircle, XCircle, FileJson, FileText, FileCode,
  Anchor, Package, Ship, LayoutGrid, Layers
} from 'lucide-react'

interface ExportModalProps {
  onClose: () => void
}

type ExportFormat = 'json' | 'csv' | 'md'

// ── Tri-state for indeterminate checkboxes ──
type Check = 'all' | 'none' | 'partial'

interface Port   { id: string; name: string; color: string }
interface Dock   { id: string; name: string; color: string; folderId?: string | null }
interface Board  { id: string; name: string; dockId: string }
interface List   { id: string; name: string; boardId: string }

// ────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────
const escCsv = (v: any) => {
  const s = v == null ? '' : String(v)
  return s.includes(',') || s.includes('"') || s.includes('\n')
    ? `"${s.replace(/"/g, '""')}"` : s
}

const toCSV = (rows: any[]) => {
  if (!rows.length) return ''
  const keys = Object.keys(rows[0])
  return [keys.join(','), ...rows.map(r => keys.map(k => escCsv(r[k])).join(','))].join('\n')
}

const toMarkdown = (title: string, rows: any[]) => {
  if (!rows.length) return `## ${title}\n_No data_\n`
  const keys = Object.keys(rows[0])
  return [
    `## ${title}`,
    `| ${keys.join(' | ')} |`,
    `| ${keys.map(() => '---').join(' | ')} |`,
    ...rows.map(r => `| ${keys.map(k => String(r[k] ?? '')).join(' | ')} |`)
  ].join('\n') + '\n'
}

const safeParse = (v: any) => {
  if (!v || typeof v !== 'string') return v
  try { return JSON.parse(v) } catch { return v }
}

const slugify = (s: string) => s.replace(/[^a-z0-9]/gi, '_').toLowerCase()

// ────────────────────────────────────────────
// Tri-state Checkbox component
// ────────────────────────────────────────────
const TriCheck: React.FC<{
  state: Check
  onChange: () => void
  label: React.ReactNode
  indent?: number
  color?: string
  expanded?: boolean
  onToggleExpand?: () => void
  count?: string
}> = ({ state, onChange, label, indent = 0, color, expanded, onToggleExpand, count }) => {
  const ref = React.useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (ref.current) {
      ref.current.indeterminate = state === 'partial'
      ref.current.checked = state === 'all'
    }
  }, [state])

  return (
    <div
      className="flex items-center gap-2 py-1.5 px-2 rounded transition-all"
      style={{ paddingLeft: `${8 + indent * 16}px` }}
    >
      {onToggleExpand ? (
        <button onClick={onToggleExpand} className="w-4 h-4 flex items-center justify-center shrink-0" style={{ color: 'var(--color-muted)' }}>
          {expanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
        </button>
      ) : (
        <span className="w-4 shrink-0" />
      )}
      <input
        ref={ref}
        type="checkbox"
        className="w-3.5 h-3.5 shrink-0 cursor-pointer"
        style={{ accentColor: color || 'var(--color-primary)' }}
        onChange={onChange}
      />
      {color && (
        <span className="w-2.5 h-2.5 border shrink-0" style={{ background: color, borderColor: 'var(--color-border-strong)' }} />
      )}
      <span className="text-xs font-bold flex-1 truncate" style={{ color: 'var(--color-text)' }}>
        {label}
      </span>
      {count && (
        <span className="text-[10px] font-black px-1.5 py-0.5 shrink-0" style={{ color: 'var(--color-muted)', background: 'var(--color-background)', border: '1px solid var(--color-border)' }}>
          {count}
        </span>
      )}
    </div>
  )
}

// ────────────────────────────────────────────
// Main ExportModal
// ────────────────────────────────────────────
export const ExportModal: React.FC<ExportModalProps> = ({ onClose }) => {
  // Raw data
  const [ports,  setPorts]  = useState<Port[]>([])
  const [docks,  setDocks]  = useState<Dock[]>([])
  const [boards, setBoards] = useState<Board[]>([])
  const [lists,  setLists]  = useState<List[]>([])
  const [allCards, setAllCards] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  // Selection maps  (id → boolean)
  const [selPorts,  setSelPorts]  = useState<Record<string, boolean>>({})
  const [selDocks,  setSelDocks]  = useState<Record<string, boolean>>({})
  const [selBoards, setSelBoards] = useState<Record<string, boolean>>({})
  const [selLists,  setSelLists]  = useState<Record<string, boolean>>({})

  // Expand state
  const [expPorts, setExpPorts]   = useState<Record<string, boolean>>({})
  const [expDocks, setExpDocks]   = useState<Record<string, boolean>>({})
  const [expBoards, setExpBoards] = useState<Record<string, boolean>>({})

  // Export options
  const [format, setFormat] = useState<ExportFormat>('json')
  const [splitPerDock, setSplitPerDock] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [result, setResult] = useState<{ ok: boolean; msg: string } | null>(null)

  // ── Load data ──
  const loadAll = useCallback(async () => {
    setLoading(true)
    const [f, d, b, l, c] = await Promise.all([
      window.electron.db.findAll('folders'),
      window.electron.db.findAll('docks'),
      window.electron.db.findAll('boards'),
      window.electron.db.findAll('lists'),
      window.electron.db.findAll('cards')
    ])
    setPorts(f);  setDocks(d);  setBoards(b);  setLists(l);  setAllCards(c)

    // Default: select everything
    const allTrue = (arr: any[]) => Object.fromEntries(arr.map((x: any) => [x.id, true]))
    setSelPorts(allTrue(f))
    setSelDocks(allTrue(d))
    setSelBoards(allTrue(b))
    setSelLists(allTrue(l))

    // Expand ports & docks by default
    setExpPorts(allTrue(f))
    setExpDocks(allTrue(d))
    setExpBoards(allTrue(b))

    setLoading(false)
  }, [])

  useEffect(() => { loadAll() }, [loadAll])

  // ── Propagation helpers ──
  const docksForPort   = (portId: string | null)   => docks.filter(d => (portId === null ? !d.folderId : d.folderId === portId))
  const boardsForDock  = (dockId: string)           => boards.filter(b => b.dockId === dockId)
  const listsForBoard  = (boardId: string)          => lists.filter(l => l.boardId === boardId)

  // Port check state
  const portCheck = (portId: string | null): Check => {
    const portDocks = docksForPort(portId)
    if (!portDocks.length) return selPorts[portId ?? '_uncat'] ? 'all' : 'none'
    const docksSelected = portDocks.filter(d => dockCheck(d.id) === 'all').length
    const docksPartial  = portDocks.filter(d => dockCheck(d.id) === 'partial').length
    if (docksSelected === portDocks.length) return 'all'
    if (docksSelected === 0 && docksPartial === 0) return 'none'
    return 'partial'
  }

  const dockCheck = (dockId: string): Check => {
    const dockBoards = boardsForDock(dockId)
    if (!dockBoards.length) return selDocks[dockId] ? 'all' : 'none'
    const sel = dockBoards.filter(b => boardCheck(b.id) === 'all').length
    const par = dockBoards.filter(b => boardCheck(b.id) === 'partial').length
    if (sel === dockBoards.length) return 'all'
    if (sel === 0 && par === 0) return 'none'
    return 'partial'
  }

  const boardCheck = (boardId: string): Check => {
    const boardLists = listsForBoard(boardId)
    if (!boardLists.length) return selBoards[boardId] ? 'all' : 'none'
    const sel = boardLists.filter(l => selLists[l.id]).length
    if (sel === boardLists.length) return 'all'
    if (sel === 0) return 'none'
    return 'partial'
  }

  // ── Toggle handlers (cascade down) ──
  const toggleList = (listId: string) =>
    setSelLists(p => ({ ...p, [listId]: !p[listId] }))

  const toggleBoard = (boardId: string) => {
    const boardLists = listsForBoard(boardId)
    const current = boardCheck(boardId)
    const next = current !== 'all'
    setSelBoards(p => ({ ...p, [boardId]: next }))
    setSelLists(p => ({ ...p, ...Object.fromEntries(boardLists.map(l => [l.id, next])) }))
  }

  const toggleDock = (dockId: string) => {
    const dockBoards = boardsForDock(dockId)
    const current = dockCheck(dockId)
    const next = current !== 'all'
    setSelDocks(p => ({ ...p, [dockId]: next }))
    dockBoards.forEach(b => {
      setSelBoards(p => ({ ...p, [b.id]: next }))
      const bLists = listsForBoard(b.id)
      setSelLists(p => ({ ...p, ...Object.fromEntries(bLists.map(l => [l.id, next])) }))
    })
  }

  const togglePort = (portId: string | null) => {
    const portDocks = docksForPort(portId)
    const current = portCheck(portId)
    const next = current !== 'all'
    if (portId) setSelPorts(p => ({ ...p, [portId]: next }))
    portDocks.forEach(d => toggleDockVal(d.id, next))
  }

  const toggleDockVal = (dockId: string, next: boolean) => {
    setSelDocks(p => ({ ...p, [dockId]: next }))
    boardsForDock(dockId).forEach(b => {
      setSelBoards(p => ({ ...p, [b.id]: next }))
      listsForBoard(b.id).forEach(l => {
        setSelLists(p => ({ ...p, [l.id]: next }))
      })
    })
  }

  // ── Select All / None ──
  const selectAll = (val: boolean) => {
    const allTrue = (arr: any[]) => Object.fromEntries(arr.map((x: any) => [x.id, val]))
    setSelPorts(allTrue(ports))
    setSelDocks(allTrue(docks))
    setSelBoards(allTrue(boards))
    setSelLists(allTrue(lists))
  }

  // ── Overall check state for header ──
  const overallCheck = (): Check => {
    const allSel = lists.every(l => selLists[l.id]) && boards.every(b => selBoards[b.id]) && docks.every(d => selDocks[d.id])
    const noneSel = lists.every(l => !selLists[l.id]) && boards.every(b => !selBoards[b.id]) && docks.every(d => !selDocks[d.id])
    if (allSel) return 'all'
    if (noneSel) return 'none'
    return 'partial'
  }

  // ── Build export content ──
  const buildContent = (
    dockIds: string[], ext: ExportFormat,
    listIdsAllowed: Set<string>
  ) => {
    const exportDocks = docks.filter(d => dockIds.includes(d.id))
    const exportBoardIds = new Set(
      boards.filter(b => dockIds.includes(b.dockId) && selBoards[b.id]).map(b => b.id)
    )
    const exportBoards = boards.filter(b => exportBoardIds.has(b.id))
    const exportLists = lists.filter(l => exportBoardIds.has(l.boardId) && listIdsAllowed.has(l.id))
    const exportListIds = new Set(exportLists.map(l => l.id))
    const exportCards = allCards.filter((c: any) => exportListIds.has(c.listId))

    if (ext === 'json') {
      return JSON.stringify({
        docks: exportDocks,
        ships: exportBoards,
        manifests: exportLists.map(l => ({
          ...l,
          cargo: exportCards
            .filter((c: any) => c.listId === l.id)
            .map((c: any) => ({
              ...c,
              tags: safeParse(c.tags),
              subCards: safeParse(c.subCards),
              connectedCardIds: safeParse(c.connectedCardIds)
            }))
        }))
      }, null, 2)
    } else if (ext === 'csv') {
      return [
        '# DOCKS', toCSV(exportDocks), '',
        '# SHIPS (BOARDS)', toCSV(exportBoards), '',
        '# MANIFESTS (LISTS)', toCSV(exportLists), '',
        '# CARGO (CARDS)', toCSV(exportCards)
      ].join('\n')
    } else {
      return [
        toMarkdown('Docks', exportDocks),
        toMarkdown('Ships (Boards)', exportBoards),
        toMarkdown('Manifests (Lists)', exportLists),
        toMarkdown('Cargo (Cards)', exportCards)
      ].join('\n')
    }
  }

  // ── Export ──
  const handleExport = async () => {
    setExporting(true)
    setResult(null)
    try {
      const allowedListIds = new Set(lists.filter(l => selLists[l.id]).map(l => l.id))
      const selectedDockIds = docks.filter(d => selDocks[d.id] || dockCheck(d.id) !== 'none').map(d => d.id)

      if (splitPerDock) {
        const files = selectedDockIds.map(dockId => {
          const dock = docks.find(d => d.id === dockId)!
          return {
            name: `shipyard-${slugify(dock.name)}`,
            ext: format,
            content: buildContent([dockId], format, allowedListIds)
          }
        })
        const res = await (window.electron as any).export.saveFolder(files)
        if (res?.success) {
          setResult({ ok: true, msg: `Exported ${res.count} file(s) to ${res.folder}` })
        } else if (!res?.error) {
          setResult(null)
        } else {
          setResult({ ok: false, msg: res.error })
        }
      } else {
        const selectedPorts = ports.filter(p => selPorts[p.id])
        const portSection = selectedPorts.length && format === 'json'
          ? { ports: selectedPorts } : {}

        const content = JSON.stringify(portSection, null, 2) === '{}'
          ? buildContent(selectedDockIds, format, allowedListIds)
          : (() => {
              const base = JSON.parse(buildContent(selectedDockIds, format, allowedListIds))
              return JSON.stringify({ ...portSection, ...base }, null, 2)
            })()

        // For non-JSON, prepend ports section
        let finalContent = content
        if (format === 'md' && selectedPorts.length) {
          finalContent = toMarkdown('Ports', selectedPorts) + '\n' + content
        } else if (format === 'csv' && selectedPorts.length) {
          finalContent = '# PORTS\n' + toCSV(selectedPorts) + '\n\n' + content
        }

        const res = await (window.electron as any).export.saveFile({
          defaultName: 'shipyard-export',
          content: finalContent,
          ext: format
        })
        if (res?.success) {
          setResult({ ok: true, msg: `Saved to ${res.filePath}` })
        } else if (!res?.error) {
          setResult(null)
        } else {
          setResult({ ok: false, msg: res.error })
        }
      }
    } catch (err: any) {
      setResult({ ok: false, msg: err?.message || 'Export failed' })
    } finally {
      setExporting(false)
    }
  }

  // ── Derived counts ──
  const selectedDockCount  = docks.filter(d => selDocks[d.id] || dockCheck(d.id) !== 'none').length
  const selectedBoardCount = boards.filter(b => selBoards[b.id] || boardCheck(b.id) !== 'none').length
  const selectedListCount  = lists.filter(l => selLists[l.id]).length
  const selectedCardCount  = allCards.filter((c: any) => selLists[c.listId]).length

  // Uncategorized docks (no folder)
  const uncatDocks = docks.filter(d => !d.folderId)

  // ────────────────────────────────────────────
  // Render
  // ────────────────────────────────────────────
  return (
    <div
      className="fixed inset-0 bg-black/70 flex items-center justify-center z-[55]"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl max-h-[90vh] flex flex-col animate-brutal-in"
        onClick={e => e.stopPropagation()}
        style={{
          background: 'var(--color-surface)',
          border: '4px solid var(--color-border-strong)',
          boxShadow: 'var(--shadow-brutal-lg)'
        }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-5 py-3 border-b-4 shrink-0"
          style={{ background: 'var(--color-primary)', borderColor: 'var(--color-border-strong)' }}
        >
          <div className="flex items-center gap-2">
            <Download className="w-4 h-4 text-white" />
            <h2 className="text-base font-black text-white uppercase tracking-wider">Export Data</h2>
          </div>
          <button onClick={onClose} className="w-7 h-7 border-2 border-white text-white flex items-center justify-center hover:bg-white/20 transition">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex flex-1 overflow-hidden">
          {/* ── LEFT: tree picker ── */}
          <div
            className="flex-1 overflow-auto border-r-2 flex flex-col"
            style={{ borderColor: 'var(--color-border)' }}
          >
            {/* Select all bar */}
            <div
              className="flex items-center justify-between px-3 py-2 border-b-2 shrink-0"
              style={{ borderColor: 'var(--color-border)', background: 'var(--color-background)' }}
            >
              <TriCheck
                state={overallCheck()}
                onChange={() => selectAll(overallCheck() !== 'all')}
                label={<span className="font-black uppercase tracking-widest text-[10px]">Select All</span>}
              />
              <div className="flex gap-2 text-[10px] font-black uppercase tracking-wider" style={{ color: 'var(--color-muted)' }}>
                <span>{selectedDockCount} docks</span>
                <span>·</span>
                <span>{selectedBoardCount} ships</span>
                <span>·</span>
                <span>{selectedListCount} manifests</span>
                <span>·</span>
                <span>{selectedCardCount} cargo</span>
              </div>
            </div>

            {loading ? (
              <div className="flex-1 flex items-center justify-center">
                <Loader className="w-6 h-6 animate-spin" style={{ color: 'var(--color-primary)' }} />
              </div>
            ) : (
              <div className="flex-1 overflow-auto py-1">

                {/* ── Ports ── */}
                {ports.map(port => {
                  const portDocks = docksForPort(port.id)
                  const isExpanded = expPorts[port.id]
                  return (
                    <div key={port.id}>
                      <TriCheck
                        state={portCheck(port.id)}
                        onChange={() => togglePort(port.id)}
                        label={<span className="font-black">{port.name}</span>}
                        color={port.color}
                        expanded={isExpanded}
                        onToggleExpand={() => setExpPorts(p => ({ ...p, [port.id]: !p[port.id] }))}
                        count={`${portDocks.length} docks`}
                      />
                      {isExpanded && portDocks.map(dock => (
                        <DockTree
                          key={dock.id}
                          dock={dock}
                          boards={boardsForDock(dock.id)}
                          listsForBoard={listsForBoard}
                          dockCheck={dockCheck}
                          boardCheck={boardCheck}
                          selBoards={selBoards}
                          selLists={selLists}
                          expDocks={expDocks}
                          expBoards={expBoards}
                          setExpDocks={setExpDocks}
                          setExpBoards={setExpBoards}
                          toggleDock={toggleDock}
                          toggleBoard={toggleBoard}
                          toggleList={toggleList}
                          indent={1}
                        />
                      ))}
                    </div>
                  )
                })}

                {/* ── Uncategorized docks ── */}
                {uncatDocks.length > 0 && (
                  <div>
                    <div className="flex items-center gap-2 px-3 py-1" style={{ color: 'var(--color-muted)' }}>
                      <Anchor className="w-3 h-3" />
                      <span className="text-[10px] font-black uppercase tracking-widest">Uncategorized</span>
                    </div>
                    {uncatDocks.map(dock => (
                      <DockTree
                        key={dock.id}
                        dock={dock}
                        boards={boardsForDock(dock.id)}
                        listsForBoard={listsForBoard}
                        dockCheck={dockCheck}
                        boardCheck={boardCheck}
                        selBoards={selBoards}
                        selLists={selLists}
                        expDocks={expDocks}
                        expBoards={expBoards}
                        setExpDocks={setExpDocks}
                        setExpBoards={setExpBoards}
                        toggleDock={toggleDock}
                        toggleBoard={toggleBoard}
                        toggleList={toggleList}
                        indent={1}
                      />
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* ── RIGHT: options panel ── */}
          <div className="w-56 shrink-0 flex flex-col overflow-auto p-4 space-y-5" style={{ background: 'var(--color-background)' }}>

            {/* Format */}
            <div>
              <p className="text-[9px] font-black uppercase tracking-widest mb-2" style={{ color: 'var(--color-muted)' }}>Format</p>
              <div className="space-y-1">
                {([
                  ['json', FileJson, 'JSON'],
                  ['csv',  FileText, 'CSV'],
                  ['md',   FileCode, 'Markdown']
                ] as const).map(([fmt, Icon, label]) => (
                  <button
                    key={fmt}
                    onClick={() => setFormat(fmt)}
                    className="w-full flex items-center gap-2 px-3 py-2 border-2 text-xs font-black uppercase tracking-wider transition-all"
                    style={{
                      borderColor: format === fmt ? 'var(--color-primary)' : 'var(--color-border)',
                      background: format === fmt ? 'var(--color-primary)' : 'var(--color-surface)',
                      color: format === fmt ? 'white' : 'var(--color-text)',
                      boxShadow: format === fmt ? 'var(--shadow-brutal-sm)' : 'none'
                    }}
                  >
                    <Icon className="w-3.5 h-3.5" />
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {/* Options */}
            <div>
              <p className="text-[9px] font-black uppercase tracking-widest mb-2" style={{ color: 'var(--color-muted)' }}>Options</p>
              <label className="flex items-start gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={splitPerDock}
                  onChange={e => setSplitPerDock(e.target.checked)}
                  className="mt-0.5 w-3.5 h-3.5"
                  style={{ accentColor: 'var(--color-primary)' }}
                />
                <div>
                  <span className="text-xs font-black block" style={{ color: 'var(--color-text)' }}>Split by Dock</span>
                  <span className="text-[9px] font-bold" style={{ color: 'var(--color-muted)' }}>
                    One file per dock — you'll pick a folder
                  </span>
                </div>
              </label>
            </div>

            {/* Stats summary */}
            <div className="border-t-2 pt-3 space-y-1.5" style={{ borderColor: 'var(--color-border)' }}>
              <p className="text-[9px] font-black uppercase tracking-widest mb-2" style={{ color: 'var(--color-muted)' }}>Will export</p>
              {[
                [Anchor, `${ports.filter(p => selPorts[p.id]).length} Ports`],
                [Layers, `${selectedDockCount} Docks`],
                [Ship,   `${selectedBoardCount} Ships`],
                [LayoutGrid, `${selectedListCount} Manifests`],
                [Package,    `${selectedCardCount} Cargo items`]
              ].map(([Icon, label]: any, i) => (
                <div key={i} className="flex items-center gap-1.5 text-[10px] font-bold" style={{ color: 'var(--color-text)' }}>
                  <Icon className="w-3 h-3 shrink-0" style={{ color: 'var(--color-primary)' }} />
                  {label}
                </div>
              ))}
            </div>

            {/* Export button */}
            <button
              onClick={handleExport}
              disabled={exporting || selectedDockCount === 0}
              className="w-full flex items-center justify-center gap-2 py-3 border-2 font-black text-xs uppercase tracking-wider transition-all duration-100 disabled:opacity-40 mt-auto"
              style={{
                borderColor: 'var(--color-primary)',
                color: 'var(--color-primary)',
                background: 'var(--color-primary)15',
                boxShadow: '3px 3px 0 var(--color-primary)'
              }}
              onMouseOver={e => { if (!exporting) e.currentTarget.style.transform = 'translate(-2px,-2px)' }}
              onMouseOut={e => { e.currentTarget.style.transform = '' }}
            >
              {exporting ? <Loader className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
              {exporting ? 'Exporting…' : 'Export'}
            </button>

            {/* Feedback */}
            {result && (
              <div
                className="flex items-start gap-1.5 p-2 border-2 text-[10px] font-bold animate-brutal-in"
                style={{
                  borderColor: result.ok ? '#059669' : '#dc2626',
                  background: result.ok ? '#05966910' : '#dc262610',
                  color: result.ok ? '#059669' : '#dc2626'
                }}
              >
                {result.ok ? <CheckCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" /> : <XCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />}
                <span className="break-all">{result.msg}</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// ── DockTree sub-component ──
const DockTree: React.FC<{
  dock: Dock
  boards: Board[]
  listsForBoard: (boardId: string) => List[]
  dockCheck: (id: string) => Check
  boardCheck: (id: string) => Check
  selBoards: Record<string, boolean>
  selLists: Record<string, boolean>
  expDocks: Record<string, boolean>
  expBoards: Record<string, boolean>
  setExpDocks: React.Dispatch<React.SetStateAction<Record<string, boolean>>>
  setExpBoards: React.Dispatch<React.SetStateAction<Record<string, boolean>>>
  toggleDock: (id: string) => void
  toggleBoard: (id: string) => void
  toggleList: (id: string) => void
  indent: number
}> = ({
  dock, boards, listsForBoard,
  dockCheck, boardCheck, selLists,
  expDocks, expBoards, setExpDocks, setExpBoards,
  toggleDock, toggleBoard, toggleList,
  indent
}) => {
  const isExpanded = expDocks[dock.id]
  return (
    <div>
      <TriCheck
        state={dockCheck(dock.id)}
        onChange={() => toggleDock(dock.id)}
        label={dock.name}
        color={dock.color}
        indent={indent}
        expanded={isExpanded}
        onToggleExpand={() => setExpDocks(p => ({ ...p, [dock.id]: !p[dock.id] }))}
        count={`${boards.length} ships`}
      />
      {isExpanded && boards.map(board => {
        const boardLists = listsForBoard(board.id)
        const isBoardExpanded = expBoards[board.id]
        return (
          <div key={board.id}>
            <TriCheck
              state={boardCheck(board.id)}
              onChange={() => toggleBoard(board.id)}
              label={board.name}
              indent={indent + 1}
              expanded={isBoardExpanded}
              onToggleExpand={() => setExpBoards(p => ({ ...p, [board.id]: !p[board.id] }))}
              count={`${boardLists.length} manifests`}
            />
            {isBoardExpanded && boardLists.map(list => (
              <TriCheck
                key={list.id}
                state={selLists[list.id] ? 'all' : 'none'}
                onChange={() => toggleList(list.id)}
                label={list.name}
                indent={indent + 2}
              />
            ))}
          </div>
        )
      })}
    </div>
  )
}
