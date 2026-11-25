import React, { useCallback, useEffect, useMemo, useState } from 'react'
import {
  DndContext,
  DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors
} from '@dnd-kit/core'
import {
  SortableContext,
  arrayMove,
  rectSortingStrategy,
  sortableKeyboardCoordinates,
  useSortable
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
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
  WIDGET_KINDS,
  WidgetConfig,
  widgetKindInfo,
  WidgetKind,
  WidgetSize
} from '../../lib/dashboard'
import { parseTask } from '../../lib/data'
import { WidgetBody } from './Widgets'

const LAYOUT_KEY = 'shipyard:dashboard-layout'
const COLLAPSED_KEY = 'shipyard:dashboard-collapsed'

const loadLayout = (): WidgetConfig[] => {
  try {
    return parseLayout(localStorage.getItem(LAYOUT_KEY))
  } catch {
    return DEFAULT_LAYOUT
  }
}

const saveLayout = (layout: WidgetConfig[]): void => {
  try {
    localStorage.setItem(LAYOUT_KEY, JSON.stringify(layout))
  } catch {
    // Storage unavailable: the layout just isn't remembered.
  }
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

const SIZE_CLASS: Record<WidgetSize, string> = {
  1: 'lg:col-span-1',
  2: 'lg:col-span-2',
  3: 'lg:col-span-3'
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
        <label>
          <span className={field} style={{ color: 'var(--color-muted)' }}>
            Width
          </span>
          <select
            value={widget.size}
            onChange={(e) => onChange({ ...widget, size: Number(e.target.value) as WidgetSize })}
            className="aero-input px-2 py-1.5"
          >
            <option value={1}>Narrow</option>
            <option value={2}>Wide</option>
            <option value={3}>Full</option>
          </select>
        </label>
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
  onChange: (widget: WidgetConfig) => void
  onRemove: () => void
}> = ({ widget, data, overview, now, editing, onChange, onRemove }) => {
  const [configuring, setConfiguring] = useState(false)
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging
  } = useSortable({ id: widget.id, disabled: !editing })
  const title = widget.title || widgetKindInfo(widget.kind).label

  return (
    <section
      ref={setNodeRef}
      className={`aero-panel flex flex-col min-w-0 ${SIZE_CLASS[widget.size]}`}
      style={{
        transform: CSS.Translate.toString(transform),
        transition,
        opacity: isDragging ? 0.6 : 1,
        zIndex: isDragging ? 10 : undefined,
        borderColor: editing ? 'var(--color-primary)' : 'var(--color-border)',
        borderStyle: editing ? 'dashed' : undefined,
        boxShadow: 'var(--shadow-brutal-sm)'
      }}
      aria-label={title}
    >
      <header
        className="flex items-center gap-2 px-3 py-2 border-b"
        style={{ borderColor: 'var(--color-border)' }}
      >
        {editing && (
          <button
            type="button"
            ref={setActivatorNodeRef}
            {...attributes}
            {...listeners}
            className="p-0.5 cursor-grab active:cursor-grabbing"
            style={{ color: 'var(--color-muted)', touchAction: 'none' }}
            aria-label={`Move ${title}`}
          >
            <GripVertical className="w-4 h-4" />
          </button>
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
      <div className="p-3 flex-1 min-h-0 max-h-[360px] overflow-y-auto">
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
  const [layout, setLayout] = useState<WidgetConfig[]>(loadLayout)
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

  const load = useCallback(async () => {
    const [workspaces, projects, boards, columns, tasks, subtasks] = await Promise.all([
      window.electron.db.findAll('workspaces'),
      window.electron.db.findAll('projects'),
      window.electron.db.findAll('boards'),
      window.electron.db.findAll('columns'),
      window.electron.db.findAll('tasks'),
      window.electron.db.findAll('subtasks')
    ])
    setData({
      workspaces,
      projects,
      boards,
      columns,
      tasks: (tasks || []).map(parseTask),
      subtasks: (subtasks || []).map((subtask: any) => ({
        taskId: String(subtask.taskId),
        completed: !!subtask.completed
      }))
    })
    setNow(Date.now())
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

  const updateLayout = (next: WidgetConfig[]) => {
    setLayout(next)
    saveLayout(next)
  }

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
    updateLayout([...layout, createWidget(kind)])
    setShowAdd(false)
    setEditing(true)
  }

  const removeWidget = (widget: WidgetConfig) => {
    const previous = layout
    updateLayout(layout.filter((candidate) => candidate.id !== widget.id))
    window.dispatchEvent(
      new CustomEvent('show-toast', {
        detail: {
          message: `Removed "${widget.title || widgetKindInfo(widget.kind).label}" widget`,
          onUndo: () => updateLayout(previous)
        }
      })
    )
  }

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  const handleDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return
    const from = layout.findIndex((widget) => widget.id === active.id)
    const to = layout.findIndex((widget) => widget.id === over.id)
    if (from < 0 || to < 0) return
    updateLayout(arrayMove(layout, from, to))
  }

  return (
    <section>
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
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={layout.map((widget) => widget.id)}
              strategy={rectSortingStrategy}
            >
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-start">
                {layout.map((widget) => (
                  <WidgetCard
                    key={widget.id}
                    widget={widget}
                    data={data}
                    overview={overview}
                    now={now}
                    editing={editing}
                    onChange={(next) =>
                      updateLayout(
                        layout.map((candidate) => (candidate.id === next.id ? next : candidate))
                      )
                    }
                    onRemove={() => removeWidget(widget)}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        ))}
    </section>
  )
}
