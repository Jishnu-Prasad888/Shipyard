import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import ReactGridLayout, { useContainerWidth, type Layout } from 'react-grid-layout'
import 'react-grid-layout/css/styles.css'
import 'react-resizable/css/styles.css'
import { useDispatch, useSelector } from 'react-redux'
import {
  Check,
  ChevronDown,
  ChevronRight,
  GripVertical,
  LayoutDashboard,
  Plus,
  RotateCcw,
  Settings2,
  X
} from 'lucide-react'
import {
  createWidget,
  DashboardData,
  DashboardScope,
  DEFAULT_LAYOUT,
  OverviewFilter,
  parseLayout,
  parseLayoutValue,
  placeWidgets,
  applyPositions,
  readingOrder,
  defaultWidgetHeight,
  GRID_COLS,
  MIN_WIDGET_W,
  MIN_WIDGET_H,
  MAX_WIDGET_H,
  WIDGET_KINDS,
  WidgetConfig,
  widgetKindInfo,
  WidgetKind
} from '../../lib/dashboard'
import { RootState } from '../../store'
import { setSettings } from '../../store/settingsSlice'
import type { Settings } from '@shared/types'
import { parseTask } from '../../lib/data'
import { WidgetBody } from './Widgets'

/** Where layouts were kept before they moved into the app settings. */
const LEGACY_LAYOUT_KEY = 'shipyard:dashboard-layout'
const COLLAPSED_KEY = 'shipyard:dashboard-collapsed'

/** Grid row height and gap, in pixels. */
const ROW_HEIGHT = 36
const GAP = 16
/** Below this width widgets are simply stacked (and the layout isn't changed). */
const MIN_GRID_WIDTH = 720

const loadLegacyLayout = (): WidgetConfig[] | null => {
  try {
    const stored = localStorage.getItem(LEGACY_LAYOUT_KEY)
    return stored ? parseLayout(stored) : null
  } catch {
    return null
  }
}

// Saves run one after another, each reading the stored settings first, so a
// save never overwrites settings that haven't reached this window yet.
let saveChain: Promise<unknown> = Promise.resolve()
const persistLayout = (layout: WidgetConfig[]): Promise<unknown> => {
  saveChain = saveChain
    .catch(() => undefined)
    .then(async () => {
      const current = ((await window.electron.settings.get()) || {}) as Partial<Settings>
      await window.electron.settings.save({ ...current, dashboardLayout: layout })
    })
  return saveChain
}

const EMPTY_DATA: DashboardData = {
  workspaces: [],
  projects: [],
  boards: [],
  columns: [],
  tasks: [],
  subtasks: []
}

const scopeValue = (scope: DashboardScope): string =>
  'id' in scope ? `${scope.kind}:${scope.id}` : scope.kind

const parseScopeValue = (value: string): DashboardScope => {
  const [kind, id] = value.split(/:(.*)/s)
  if ((kind === 'workspace' || kind === 'project' || kind === 'board') && id) return { kind, id }
  if (kind === 'all' || kind === 'unassigned') return { kind }
  return { kind: 'overview' }
}

interface ScopeOption {
  value: string
  label: string
}

/** Everything a widget can look at, for the scope picker. */
const scopeOptions = (data: DashboardData): { group: string; options: ScopeOption[] }[] => {
  const children = new Map<string | null, typeof data.workspaces>()
  const known = new Set(data.workspaces.map((workspace) => workspace.id))
  for (const workspace of data.workspaces) {
    const parent =
      workspace.parentWorkspaceId && known.has(workspace.parentWorkspaceId)
        ? workspace.parentWorkspaceId
        : null
    children.set(parent, [...(children.get(parent) || []), workspace])
  }
  const workspaceOptions: ScopeOption[] = []
  const visited = new Set<string>()
  const walk = (parent: string | null, depth: number) => {
    for (const workspace of [...(children.get(parent) || [])].sort((a, b) =>
      a.name.localeCompare(b.name)
    )) {
      if (visited.has(workspace.id)) continue
      visited.add(workspace.id)
      workspaceOptions.push({
        value: `workspace:${workspace.id}`,
        label: `${'  '.repeat(depth)}${workspace.name}`
      })
      walk(workspace.id, depth + 1)
    }
  }
  walk(null, 0)
  // Workspaces caught in a parent loop (corrupt data) are never reached from
  // the top; list them anyway so they can still be picked.
  for (const workspace of data.workspaces) {
    if (!visited.has(workspace.id)) {
      visited.add(workspace.id)
      workspaceOptions.push({ value: `workspace:${workspace.id}`, label: workspace.name })
    }
  }
  const projects = [...data.projects].sort((a, b) => a.name.localeCompare(b.name))
  return [
    {
      group: 'General',
      options: [
        { value: 'overview', label: 'Follow the overview filter' },
        { value: 'all', label: 'Everything' },
        { value: 'unassigned', label: 'Projects without a workspace' }
      ]
    },
    { group: 'Workspaces (with sub-workspaces)', options: workspaceOptions },
    {
      group: 'Projects',
      options: projects.map((project) => ({ value: `project:${project.id}`, label: project.name }))
    },
    {
      group: 'Boards',
      options: projects.flatMap((project) =>
        data.boards
          .filter((board) => board.projectId === project.id)
          .sort((a, b) => a.name.localeCompare(b.name))
          .map((board) => ({
            value: `board:${board.id}`,
            label: `${project.name} › ${board.name}`
          }))
      )
    }
  ].filter((group) => group.options.length > 0)
}

/** Short description of a widget's scope for its header. */
const scopeLabel = (scope: DashboardScope, data: DashboardData, overview: OverviewFilter) => {
  switch (scope.kind) {
    case 'overview':
      return overview === 'all'
        ? 'All projects'
        : overview === 'unassigned'
          ? 'Unassigned'
          : data.workspaces.find((workspace) => workspace.id === overview)?.name || 'Workspace'
    case 'all':
      return 'All projects'
    case 'unassigned':
      return 'Unassigned'
    case 'workspace':
      return (
        data.workspaces.find((workspace) => workspace.id === scope.id)?.name || 'Missing workspace'
      )
    case 'project':
      return data.projects.find((project) => project.id === scope.id)?.name || 'Missing project'
    case 'board':
      return data.boards.find((board) => board.id === scope.id)?.name || 'Missing board'
  }
}

const WidgetSettings: React.FC<{
  widget: WidgetConfig
  data: DashboardData
  onChange: (widget: WidgetConfig) => void
  onDone: () => void
}> = ({ widget, data, onChange, onDone }) => {
  const groups = useMemo(() => scopeOptions(data), [data])
  const value = scopeValue(widget.scope)
  const exists = groups.some((group) => group.options.some((option) => option.value === value))
  const field = 'block text-[10px] font-black uppercase tracking-wider mb-1'
  const showDays = widget.kind === 'deadlines' || widget.kind === 'activity'
  const showLimit = widget.kind !== 'summary' && widget.kind !== 'activity'

  return (
    <div className="space-y-3 text-xs">
      <label className="block">
        <span className={field} style={{ color: 'var(--color-muted)' }}>
          Title
        </span>
        <input
          type="text"
          value={widget.title || ''}
          placeholder={widgetKindInfo(widget.kind).label}
          maxLength={80}
          onChange={(e) => onChange({ ...widget, title: e.target.value || undefined })}
          className="aero-input w-full px-2 py-1.5"
        />
      </label>
      <label className="block">
        <span className={field} style={{ color: 'var(--color-muted)' }}>
          Data from
        </span>
        <select
          value={exists ? value : ''}
          onChange={(e) => onChange({ ...widget, scope: parseScopeValue(e.target.value) })}
          className="aero-input w-full px-2 py-1.5"
        >
          {!exists && (
            <option value="" disabled>
              (deleted — pick another)
            </option>
          )}
          {groups.map((group) => (
            <optgroup key={group.group} label={group.group}>
              {group.options.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </label>
      <div className="flex flex-wrap gap-3">
        {showDays && (
          <label>
            <span className={field} style={{ color: 'var(--color-muted)' }}>
              {widget.kind === 'activity' ? 'Days shown' : 'Days ahead'}
            </span>
            <select
              value={widget.days ?? 14}
              onChange={(e) => onChange({ ...widget, days: Number(e.target.value) })}
              className="aero-input px-2 py-1.5"
            >
              {[7, 14, 30, 60, 90].map((days) => (
                <option key={days} value={days}>
                  {days}
                </option>
              ))}
            </select>
          </label>
        )}
        {showLimit && (
          <label>
            <span className={field} style={{ color: 'var(--color-muted)' }}>
              Show up to
            </span>
            <select
              value={widget.limit ?? 8}
              onChange={(e) => onChange({ ...widget, limit: Number(e.target.value) })}
              className="aero-input px-2 py-1.5"
            >
              {[5, 8, 12, 20].map((limit) => (
                <option key={limit} value={limit}>
                  {limit}
                </option>
              ))}
            </select>
          </label>
        )}
        {widget.kind === 'progress' && (
          <label>
            <span className={field} style={{ color: 'var(--color-muted)' }}>
              Per
            </span>
            <select
              value={widget.groupBy ?? 'project'}
              onChange={(e) =>
                onChange({ ...widget, groupBy: e.target.value as 'project' | 'board' })
              }
              className="aero-input px-2 py-1.5"
            >
              <option value="project">Project</option>
              <option value="board">Board</option>
            </select>
          </label>
        )}
        {widget.kind === 'github' && (
          <label>
            <span className={field} style={{ color: 'var(--color-muted)' }}>
              Show
            </span>
            <select
              value={widget.github ?? 'pulls'}
              onChange={(e) =>
                onChange({ ...widget, github: e.target.value as 'pulls' | 'issues' | 'commits' })
              }
              className="aero-input px-2 py-1.5"
            >
              <option value="pulls">Open pull requests</option>
              <option value="issues">Open issues</option>
              <option value="commits">Recent commits</option>
            </select>
          </label>
        )}
      </div>
      <div className="flex justify-end">
        <button type="button" onClick={onDone} className="btn-primary text-xs">
          <Check className="w-3.5 h-3.5" /> Done
        </button>
      </div>
    </div>
  )
}

const WidgetCard: React.FC<{
  widget: WidgetConfig
  data: DashboardData
  overview: OverviewFilter
  now: number
  editing: boolean
  /** Whether the grid lets it be dragged and resized. */
  movable: boolean
  onChange: (widget: WidgetConfig) => void
  onRemove: () => void
}> = ({ widget, data, overview, now, editing, movable, onChange, onRemove }) => {
  const [configuring, setConfiguring] = useState(false)
  const title = widget.title || widgetKindInfo(widget.kind).label

  return (
    <section
      className="aero-panel flex flex-col min-w-0 h-full"
      style={{
        borderColor: editing ? 'var(--color-primary)' : 'var(--color-border)',
        borderStyle: editing ? 'dashed' : undefined,
        boxShadow: 'var(--shadow-brutal-sm)'
      }}
      aria-label={title}
    >
      <header
        className={`flex items-center gap-2 px-3 py-2 border-b ${
          movable ? 'widget-drag-handle cursor-grab active:cursor-grabbing' : ''
        }`}
        style={{ borderColor: 'var(--color-border)', touchAction: movable ? 'none' : undefined }}
        title={movable ? 'Drag to move' : undefined}
      >
        {movable && (
          <GripVertical
            className="w-4 h-4 shrink-0"
            style={{ color: 'var(--color-muted)' }}
            aria-hidden
          />
        )}
        <h3
          className="text-xs font-black uppercase tracking-wider truncate"
          style={{ color: 'var(--color-text)' }}
        >
          {title}
        </h3>
        <span
          className="text-[10px] font-semibold truncate"
          style={{ color: 'var(--color-muted)' }}
        >
          {scopeLabel(widget.scope, data, overview)}
        </span>
        <span className="flex-1" />
        {editing && (
          <>
            <button
              type="button"
              onClick={() => setConfiguring((value) => !value)}
              className="p-1 rounded hover:bg-primary-soft"
              style={{ color: configuring ? 'var(--color-primary)' : 'var(--color-muted)' }}
              title="Widget settings"
              aria-label={`Settings for ${title}`}
              aria-pressed={configuring}
            >
              <Settings2 className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={onRemove}
              className="p-1 rounded hover:bg-primary-soft"
              style={{ color: 'var(--color-muted)' }}
              title="Remove widget"
              aria-label={`Remove ${title}`}
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </>
        )}
      </header>
      <div className={`p-3 flex-1 min-h-0 overflow-y-auto ${movable ? '' : 'max-h-[400px]'}`}>
        {editing && configuring ? (
          <WidgetSettings
            widget={widget}
            data={data}
            onChange={onChange}
            onDone={() => setConfiguring(false)}
          />
        ) : (
          <WidgetBody widget={widget} data={data} overview={overview} now={now} />
        )}
      </div>
    </section>
  )
}

/** The customizable widget dashboard at the top of the overview. */
export const Dashboard: React.FC<{ dataVersion: number; overview: OverviewFilter }> = ({
  dataVersion,
  overview
}) => {
  const [data, setData] = useState<DashboardData>(EMPTY_DATA)
  const dispatch = useDispatch()
  const storedLayout = useSelector((state: RootState) => state.settings.dashboardLayout)
  const [layout, setLayout] = useState<WidgetConfig[]>(() =>
    storedLayout ? parseLayoutValue(storedLayout) : loadLegacyLayout() || DEFAULT_LAYOUT
  )
  // The layout this window last saved, to tell our own saves from changes
  // that arrive with freshly loaded settings.
  const savedRef = useRef<string | null>(storedLayout ? JSON.stringify(storedLayout) : null)
  const dirtyRef = useRef(false)
  const { width, containerRef, mounted } = useContainerWidth({ measureBeforeMount: true })
  const gridMode = mounted && width >= MIN_GRID_WIDTH
  const [editing, setEditing] = useState(false)
  const [showAdd, setShowAdd] = useState(false)
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem(COLLAPSED_KEY) === '1'
    } catch {
      return false
    }
  })
  const [now, setNow] = useState(() => Date.now())

  // Only the latest load may update the dashboard, so a slow, older load
  // can't overwrite newer numbers.
  const loadIdRef = useRef(0)
  const [loadError, setLoadError] = useState<string | null>(null)
  const load = useCallback(async () => {
    const loadId = ++loadIdRef.current
    try {
      const [workspaces, projects, boards, columns, tasks, subtasks] = await Promise.all([
        window.electron.db.findAll('workspaces'),
        window.electron.db.findAll('projects'),
        window.electron.db.findAll('boards'),
        window.electron.db.findAll('columns'),
        window.electron.db.findAll('tasks'),
        window.electron.db.findAll('subtasks')
      ])
      if (loadId !== loadIdRef.current) return
      setData({
        workspaces,
        projects,
        boards,
        columns,
        tasks: (tasks || []).map(parseTask),
        // Same rule as parseSubtasks: stored values may be booleans, 1/0 or '1'/'0'.
        subtasks: (subtasks || []).map((subtask: any) => ({
          taskId: String(subtask.taskId),
          completed:
            subtask.completed === true || subtask.completed === 1 || subtask.completed === '1'
        }))
      })
      setLoadError(null)
      setNow(Date.now())
    } catch (error: any) {
      if (loadId === loadIdRef.current) setLoadError(String(error?.message || error))
    }
  }, [])

  useEffect(() => {
    void load()
    const reload = () => void load()
    window.addEventListener('reload-projects', reload)
    return () => window.removeEventListener('reload-projects', reload)
  }, [load, dataVersion])

  // "Overdue" and "due soon" move with the clock.
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60_000)
    return () => window.clearInterval(timer)
  }, [])

  const updateLayout = (next: WidgetConfig[] | ((current: WidgetConfig[]) => WidgetConfig[])) => {
    dirtyRef.current = true
    setLayout(next)
  }

  // Settings load after the first render (and can change elsewhere): adopt a
  // stored layout that isn't the one this window saved.
  useEffect(() => {
    if (!storedLayout) return
    const text = JSON.stringify(storedLayout)
    if (text === savedRef.current) return
    savedRef.current = text
    dirtyRef.current = false
    setLayout(parseLayoutValue(storedLayout))
  }, [storedLayout])

  // One-time move of a layout kept in browser storage into the settings.
  useEffect(() => {
    const legacy = loadLegacyLayout()
    if (!legacy) return
    void (async () => {
      const current = ((await window.electron.settings.get()) || {}) as Partial<Settings>
      if (!current.dashboardLayout) await persistLayout(legacy)
      try {
        localStorage.removeItem(LEGACY_LAYOUT_KEY)
      } catch {
        // ignore
      }
    })()
  }, [])

  // Save changes made here (debounced: resizing reports many small steps).
  useEffect(() => {
    if (!dirtyRef.current) return
    const timer = window.setTimeout(() => {
      dirtyRef.current = false
      const text = JSON.stringify(layout)
      savedRef.current = text
      dispatch(setSettings({ dashboardLayout: JSON.parse(text) } as Settings))
      void persistLayout(layout).catch((error) =>
        console.error('Could not save the dashboard layout', error)
      )
    }, 300)
    return () => window.clearTimeout(timer)
  }, [layout, dispatch])

  const gridLayout = useMemo<Layout>(
    () =>
      placeWidgets(layout).map((item) => ({
        ...item,
        minW: MIN_WIDGET_W,
        minH: MIN_WIDGET_H,
        maxH: MAX_WIDGET_H
      })),
    [layout]
  )

  const toggleCollapsed = () => {
    setCollapsed((value) => {
      try {
        localStorage.setItem(COLLAPSED_KEY, value ? '0' : '1')
      } catch {
        // ignore
      }
      return !value
    })
  }

  const addWidget = (kind: WidgetKind) => {
    const widget = createWidget(kind)
    // New widgets go to the bottom; the grid moves them up into place.
    const w = Math.min(GRID_COLS, Math.max(MIN_WIDGET_W, widget.size * (GRID_COLS / 3)))
    widget.pos = { x: 0, y: 10_000, w, h: defaultWidgetHeight(kind) }
    updateLayout([...layout, widget])
    setShowAdd(false)
    setEditing(true)
  }

  const removeWidget = (widget: WidgetConfig) => {
    const index = layout.findIndex((candidate) => candidate.id === widget.id)
    updateLayout((current) => current.filter((candidate) => candidate.id !== widget.id))
    window.dispatchEvent(
      new CustomEvent('show-toast', {
        detail: {
          message: `Removed "${widget.title || widgetKindInfo(widget.kind).label}" widget`,
          // Put back only this widget, keeping any changes made since.
          onUndo: () =>
            updateLayout((current) => {
              if (current.some((candidate) => candidate.id === widget.id)) return current
              const next = [...current]
              next.splice(Math.min(Math.max(index, 0), next.length), 0, widget)
              return next
            })
        }
      })
    )
  }

  const renderWidget = (widget: WidgetConfig, movable: boolean) => (
    <WidgetCard
      widget={widget}
      data={data}
      overview={overview}
      now={now}
      editing={editing}
      movable={movable}
      onChange={(next) =>
        updateLayout((current) =>
          current.map((candidate) => (candidate.id === next.id ? next : candidate))
        )
      }
      onRemove={() => removeWidget(widget)}
    />
  )

  return (
    <section ref={containerRef as React.RefObject<HTMLDivElement>}>
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <button
          type="button"
          onClick={toggleCollapsed}
          className="flex items-center gap-2"
          aria-expanded={!collapsed}
        >
          {collapsed ? (
            <ChevronRight className="w-3.5 h-3.5" style={{ color: 'var(--color-muted)' }} />
          ) : (
            <ChevronDown className="w-3.5 h-3.5" style={{ color: 'var(--color-muted)' }} />
          )}
          <LayoutDashboard className="w-3.5 h-3.5" style={{ color: 'var(--color-primary)' }} />
          <h2
            className="text-[10px] font-black uppercase tracking-widest"
            style={{ color: 'var(--color-muted)' }}
          >
            Dashboard
          </h2>
        </button>
        <span className="flex-1" />
        {!collapsed && editing && (
          <>
            <button
              type="button"
              onClick={() => updateLayout(DEFAULT_LAYOUT)}
              className="btn-secondary text-xs"
              title="Replace all widgets with the default set"
            >
              <RotateCcw className="w-3.5 h-3.5" /> Reset
            </button>
            <div className="relative">
              <button
                type="button"
                onClick={() => setShowAdd((value) => !value)}
                className="btn-secondary text-xs"
                aria-expanded={showAdd}
              >
                <Plus className="w-3.5 h-3.5" /> Add widget
              </button>
              {showAdd && (
                <div
                  className="absolute right-0 top-full mt-1 z-30 w-72 p-1 border rounded-md animate-brutal-in"
                  style={{
                    background: 'var(--color-surface)',
                    borderColor: 'var(--color-border-strong)',
                    boxShadow: 'var(--shadow-window)'
                  }}
                >
                  {WIDGET_KINDS.map((info) => (
                    <button
                      key={info.kind}
                      type="button"
                      onClick={() => addWidget(info.kind)}
                      className="w-full text-left px-3 py-2 rounded hover:bg-primary-soft"
                    >
                      <div className="text-xs font-black" style={{ color: 'var(--color-text)' }}>
                        {info.label}
                      </div>
                      <div className="text-[11px]" style={{ color: 'var(--color-muted)' }}>
                        {info.description}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
        {!collapsed && (
          <button
            type="button"
            onClick={() => {
              setEditing((value) => !value)
              setShowAdd(false)
            }}
            className={editing ? 'btn-primary text-xs' : 'btn-secondary text-xs'}
          >
            {editing ? (
              <>
                <Check className="w-3.5 h-3.5" /> Done
              </>
            ) : (
              <>
                <Settings2 className="w-3.5 h-3.5" /> Customize
              </>
            )}
          </button>
        )}
      </div>

      {!collapsed && loadError && (
        <p className="text-xs mb-3" style={{ color: 'var(--color-alert, #d94c57)' }} role="alert">
          Could not load dashboard data: {loadError}
        </p>
      )}
      {!collapsed &&
        (layout.length === 0 ? (
          <div
            className="aero-panel py-8 flex flex-col items-center gap-3 border border-dashed text-center"
            style={{ borderColor: 'var(--color-border)' }}
          >
            <p className="text-xs" style={{ color: 'var(--color-muted)' }}>
              No widgets. Add some to see deadlines, progress and activity at a glance.
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                className="btn-secondary text-xs"
                onClick={() => {
                  setEditing(true)
                  setShowAdd(true)
                }}
              >
                <Plus className="w-3.5 h-3.5" /> Add widget
              </button>
              <button
                type="button"
                className="btn-secondary text-xs"
                onClick={() => updateLayout(DEFAULT_LAYOUT)}
              >
                <RotateCcw className="w-3.5 h-3.5" /> Use defaults
              </button>
            </div>
          </div>
        ) : (
          <>
            {gridMode ? (
              <ReactGridLayout
                className="dashboard-grid"
                width={width}
                layout={gridLayout}
                gridConfig={{
                  cols: GRID_COLS,
                  rowHeight: ROW_HEIGHT,
                  margin: [GAP, GAP],
                  containerPadding: [0, 0]
                }}
                dragConfig={{
                  enabled: true,
                  handle: '.widget-drag-handle',
                  cancel: 'button, input, select, textarea, a'
                }}
                resizeConfig={{ enabled: true, handles: ['se'] }}
                onLayoutChange={(items) => {
                  const next = applyPositions(layout, items)
                  if (next !== layout) updateLayout(next)
                }}
              >
                {layout.map((widget) => (
                  <div key={widget.id}>{renderWidget(widget, true)}</div>
                ))}
              </ReactGridLayout>
            ) : (
              <div className="flex flex-col gap-4">
                {readingOrder(layout).map((widget) => (
                  <div key={widget.id}>{renderWidget(widget, false)}</div>
                ))}
              </div>
            )}
          </>
        ))}
    </section>
  )
}
