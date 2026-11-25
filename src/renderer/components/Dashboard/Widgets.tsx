import React, { useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  Clock,
  ListChecks,
  Loader2
} from 'lucide-react'
import {
  activityByDay,
  DashboardData,
  OverviewFilter,
  overdueTasks,
  progressBy,
  projectsInScope,
  recentlyUpdated,
  reposInScope,
  statusBreakdown,
  summarize,
  tagCounts,
  TaskEntry,
  tasksInScope,
  upcomingDeadlines,
  WidgetConfig
} from '../../lib/dashboard'
import { GitHubItem, listCommits, listIssues, listPullRequests } from '../../lib/github'
import { GitHubItemRow } from '../GitHub/GitHubItems'

const DAY = 24 * 60 * 60 * 1000

const openTask = (entry: TaskEntry): void => {
  window.dispatchEvent(
    new CustomEvent('navigate-to-task', {
      detail: { projectId: entry.project.id, boardId: entry.board.id, taskId: entry.task.id }
    })
  )
}

const Empty: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <p className="text-xs py-4 text-center" style={{ color: 'var(--color-muted)' }}>
    {children}
  </p>
)

const dueLabel = (deadline: number, now: number): string => {
  const days = Math.round((deadline - now) / DAY)
  if (days === 0) return deadline < now ? 'earlier today' : 'today'
  if (days === 1) return 'tomorrow'
  if (days === -1) return '1 day ago'
  if (days < 0) return `${-days} days ago`
  return `in ${days} days`
}

/** A clickable list of tasks with where they live and a right-hand note. */
const TaskList: React.FC<{
  entries: TaskEntry[]
  note: (entry: TaskEntry) => React.ReactNode
  empty: string
}> = ({ entries, note, empty }) => {
  if (entries.length === 0) return <Empty>{empty}</Empty>
  return (
    <ul className="space-y-1">
      {entries.map((entry) => (
        <li key={entry.task.id}>
          <button
            type="button"
            onClick={() => openTask(entry)}
            className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-left hover:bg-primary-soft"
            title={`Open "${entry.task.title}"`}
          >
            <span
              className="w-1.5 h-6 rounded-full shrink-0"
              style={{
                background: entry.board.color || entry.project.color || 'var(--color-primary)'
              }}
            />
            <span className="flex-1 min-w-0">
              <span
                className="block text-xs font-bold truncate"
                style={{
                  color: 'var(--color-text)',
                  textDecoration: entry.done ? 'line-through' : undefined
                }}
              >
                {entry.task.title || 'Untitled task'}
              </span>
              <span className="block text-[10px] truncate" style={{ color: 'var(--color-muted)' }}>
                {entry.project.name} › {entry.board.name}
                {entry.column ? ` › ${entry.column.name}` : ''}
              </span>
            </span>
            <span
              className="text-[10px] font-bold shrink-0"
              style={{ color: 'var(--color-muted)' }}
            >
              {note(entry)}
            </span>
          </button>
        </li>
      ))}
    </ul>
  )
}

/** Horizontal bars: label, bar proportional to the largest count, value. */
const CountBars: React.FC<{
  rows: {
    key: string
    label: string
    sublabel?: string
    color?: string
    value: number
    max: number
    text: string
  }[]
}> = ({ rows }) => (
  <ul className="space-y-2">
    {rows.map((row) => (
      <li key={row.key} title={`${row.label}: ${row.text}`}>
        <div className="flex items-baseline gap-2 text-xs mb-0.5">
          <span className="font-bold truncate flex-1" style={{ color: 'var(--color-text)' }}>
            {row.label}
            {row.sublabel && (
              <span className="font-normal ml-1" style={{ color: 'var(--color-muted)' }}>
                {row.sublabel}
              </span>
            )}
          </span>
          <span className="font-mono text-[11px] shrink-0" style={{ color: 'var(--color-muted)' }}>
            {row.text}
          </span>
        </div>
        <div
          className="h-2 rounded-full overflow-hidden"
          style={{ background: 'var(--color-border)' }}
        >
          <div
            className="h-full rounded-full"
            style={{
              width: `${row.max ? Math.max(2, (row.value / row.max) * 100) : 0}%`,
              background: row.color || 'var(--color-primary)'
            }}
          />
        </div>
      </li>
    ))}
  </ul>
)

const Stat: React.FC<{
  label: string
  value: React.ReactNode
  icon: React.ReactNode
  hint?: string
}> = ({ label, value, icon, hint }) => (
  <div
    className="flex-1 min-w-[110px] px-3 py-2.5 rounded-md border"
    style={{ borderColor: 'var(--color-border)', background: 'var(--color-background)' }}
    title={hint}
  >
    <div
      className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wider"
      style={{ color: 'var(--color-muted)' }}
    >
      {icon}
      {label}
    </div>
    <div className="text-2xl font-black mt-0.5 tabular-nums" style={{ color: 'var(--color-text)' }}>
      {value}
    </div>
  </div>
)

/** Created vs. finished per day: two thin bars per day on one axis. */
const ActivityChart: React.FC<{ entries: TaskEntry[]; days: number; now: number }> = ({
  entries,
  days,
  now
}) => {
  const buckets = useMemo(() => activityByDay(entries, now, days), [entries, now, days])
  const [hover, setHover] = useState<number | null>(null)
  const max = Math.max(1, ...buckets.map((bucket) => Math.max(bucket.created, bucket.completed)))
  const totals = buckets.reduce(
    (sum, bucket) => ({
      created: sum.created + bucket.created,
      completed: sum.completed + bucket.completed
    }),
    { created: 0, completed: 0 }
  )
  const format = (day: number) =>
    new Date(day).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
  const hovered = hover !== null ? buckets[hover] : null

  return (
    <div>
      <div
        className="flex flex-wrap items-center gap-4 text-[11px] mb-2"
        style={{ color: 'var(--color-text)' }}
      >
        <span className="inline-flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-sm" style={{ background: 'var(--chart-created)' }} />
          Created <strong className="tabular-nums">{totals.created}</strong>
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span
            className="w-2.5 h-2.5 rounded-sm"
            style={{ background: 'var(--chart-finished)' }}
          />
          Finished <strong className="tabular-nums">{totals.completed}</strong>
        </span>
        <span className="ml-auto text-[10px]" style={{ color: 'var(--color-muted)' }}>
          {hovered
            ? `${format(hovered.day)}: ${hovered.created} created, ${hovered.completed} finished`
            : `Last ${days} days`}
        </span>
      </div>
      <div
        className="relative flex items-end h-28 border-b"
        style={{ borderColor: 'var(--color-border-strong)' }}
        onMouseLeave={() => setHover(null)}
        role="img"
        aria-label={`Tasks created and finished per day over the last ${days} days: ${totals.created} created, ${totals.completed} finished`}
      >
        {buckets.map((bucket, index) => (
          <div
            key={bucket.day}
            className="flex-1 h-full flex items-end justify-center gap-[2px] px-px"
            style={{ background: hover === index ? 'var(--color-primary-soft)' : undefined }}
            onMouseEnter={() => setHover(index)}
          >
            {(['created', 'completed'] as const).map((series) => (
              <div
                key={series}
                className="flex-1 max-w-[8px] rounded-t-[4px]"
                style={{
                  height: `${(bucket[series] / max) * 100}%`,
                  minHeight: bucket[series] ? 2 : 0,
                  background:
                    series === 'created' ? 'var(--chart-created)' : 'var(--chart-finished)'
                }}
              />
            ))}
          </div>
        ))}
      </div>
      <div
        className="flex justify-between text-[10px] mt-1"
        style={{ color: 'var(--color-muted)' }}
      >
        <span>{format(buckets[0].day)}</span>
        <span>Today</span>
      </div>
    </div>
  )
}

/** Open pull requests, issues or recent commits across the scope's repositories. */
const GitHubWidget: React.FC<{
  repos: string[]
  mode: 'pulls' | 'issues' | 'commits'
  limit: number
}> = ({ repos, mode, limit }) => {
  const [state, setState] = useState<
    | { status: 'loading' }
    | { status: 'ok'; items: GitHubItem[] }
    | { status: 'error'; message: string }
  >({ status: 'loading' })
  const key = repos.join(',')

  useEffect(() => {
    if (repos.length === 0) return
    let cancelled = false
    setState({ status: 'loading' })
    const load = async () => {
      const results = await Promise.allSettled(
        repos
          .slice(0, 6)
          .map((repo) =>
            mode === 'pulls'
              ? listPullRequests(repo)
              : mode === 'issues'
                ? listIssues(repo)
                : listCommits(repo, limit)
          )
      )
      if (cancelled) return
      const items = results.flatMap((result) => (result.status === 'fulfilled' ? result.value : []))
      const failure = results.find((result) => result.status === 'rejected') as
        PromiseRejectedResult | undefined
      if (items.length === 0 && failure) {
        setState({ status: 'error', message: String(failure.reason?.message || failure.reason) })
        return
      }
      items.sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''))
      setState({ status: 'ok', items: items.slice(0, limit) })
    }
    void load()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `key` stands for `repos`
  }, [key, mode, limit])

  if (repos.length === 0)
    return <Empty>No project here has a linked GitHub repository (Edit Project › GitHub).</Empty>
  if (state.status === 'loading')
    return (
      <div
        className="flex items-center gap-2 text-xs py-4 justify-center"
        style={{ color: 'var(--color-muted)' }}
      >
        <Loader2 className="w-4 h-4 animate-spin" /> Loading{' '}
        {repos.length === 1 ? repos[0] : `${repos.length} repositories`}…
      </div>
    )
  if (state.status === 'error')
    return (
      <p className="text-xs py-2" style={{ color: 'var(--color-alert, #d94c57)' }}>
        {state.message}
      </p>
    )
  if (state.items.length === 0)
    return (
      <Empty>
        {mode === 'commits'
          ? 'No commits.'
          : `No open ${mode === 'pulls' ? 'pull requests' : 'issues'}.`}
      </Empty>
    )
  return (
    <div className="space-y-1.5">
      {state.items.map((item) => (
        <GitHubItemRow
          key={`${item.ref.repo}:${item.ref.number ?? item.ref.sha}`}
          item={item}
          defaultRepo={repos.length === 1 ? repos[0] : null}
          compact
        />
      ))}
    </div>
  )
}

/** The body of one widget. */
export const WidgetBody: React.FC<{
  widget: WidgetConfig
  data: DashboardData
  overview: OverviewFilter
  now: number
}> = ({ widget, data, overview, now }) => {
  const entries = useMemo(
    () => tasksInScope(data, widget.scope, overview),
    [data, widget.scope, overview]
  )
  const limit = widget.limit ?? 8

  switch (widget.kind) {
    case 'summary': {
      const summary = summarize(entries, data.subtasks, now)
      return (
        <div>
          <div className="flex flex-wrap gap-2">
            <Stat label="Open" value={summary.open} icon={<ListChecks className="w-3.5 h-3.5" />} />
            <Stat
              label="Done"
              value={summary.done}
              icon={<CheckCircle2 className="w-3.5 h-3.5" />}
            />
            <Stat
              label="Overdue"
              value={summary.overdue}
              icon={
                <AlertTriangle
                  className="w-3.5 h-3.5"
                  style={{ color: 'var(--color-alert, #d94c57)' }}
                />
              }
              hint="Open tasks past their deadline"
            />
            <Stat
              label="Due in 7 days"
              value={summary.dueSoon}
              icon={<CalendarClock className="w-3.5 h-3.5" />}
            />
            <Stat
              label="Subtasks"
              value={
                summary.subtasksTotal ? `${summary.subtasksDone}/${summary.subtasksTotal}` : '—'
              }
              icon={<CheckCircle2 className="w-3.5 h-3.5" />}
            />
          </div>
          <div className="mt-3">
            <div
              className="flex justify-between text-[11px] mb-1"
              style={{ color: 'var(--color-text)' }}
            >
              <span className="font-bold">Completion</span>
              <span className="tabular-nums">
                {summary.completion}% · {summary.done} of {summary.total} tasks
              </span>
            </div>
            <div
              className="h-2 rounded-full overflow-hidden"
              style={{ background: 'var(--color-border)' }}
            >
              <div
                className="h-full rounded-full"
                style={{ width: `${summary.completion}%`, background: 'var(--chart-finished)' }}
              />
            </div>
          </div>
        </div>
      )
    }
    case 'status': {
      const rows = statusBreakdown(entries)
      if (rows.length === 0) return <Empty>No tasks.</Empty>
      const max = Math.max(...rows.map((row) => row.count))
      return (
        <CountBars
          rows={rows.slice(0, limit).map((row) => ({
            key: row.key,
            label: row.label,
            color: row.color,
            value: row.count,
            max,
            text: String(row.count)
          }))}
        />
      )
    }
    case 'tags': {
      const rows = tagCounts(entries, limit)
      if (rows.length === 0) return <Empty>No tagged tasks.</Empty>
      return (
        <div className="flex flex-wrap gap-1.5">
          {rows.map((row) => (
            <span
              key={row.key}
              className="inline-flex items-center gap-1.5 px-2 py-1 rounded-full border text-xs font-bold"
              style={{
                borderColor: row.color || 'var(--color-border-strong)',
                color: 'var(--color-text)'
              }}
            >
              <span
                className="w-2 h-2 rounded-full"
                style={{ background: row.color || 'var(--color-muted)' }}
              />
              {row.label}
              <span className="tabular-nums" style={{ color: 'var(--color-muted)' }}>
                {row.count}
              </span>
            </span>
          ))}
        </div>
      )
    }
    case 'deadlines': {
      const days = widget.days ?? 14
      return (
        <TaskList
          entries={upcomingDeadlines(entries, now, days, limit)}
          note={(entry) => dueLabel(entry.task.deadline!, now)}
          empty={`Nothing due in the next ${days} days.`}
        />
      )
    }
    case 'overdue':
      return (
        <TaskList
          entries={overdueTasks(entries, now, limit)}
          note={(entry) => (
            <span
              className="inline-flex items-center gap-1"
              style={{ color: 'var(--color-alert, #d94c57)' }}
            >
              <AlertTriangle className="w-3 h-3" /> {dueLabel(entry.task.deadline!, now)}
            </span>
          )}
          empty="Nothing overdue."
        />
      )
    case 'recent':
      return (
        <TaskList
          entries={recentlyUpdated(entries, limit)}
          note={(entry) => (
            <span className="inline-flex items-center gap-1">
              <Clock className="w-3 h-3" />
              {new Date(entry.task.updatedAt).toLocaleDateString(undefined, {
                month: 'short',
                day: 'numeric'
              })}
            </span>
          )}
          empty="No tasks yet."
        />
      )
    case 'progress': {
      const rows = progressBy(entries, widget.groupBy ?? 'project').slice(0, limit)
      if (rows.length === 0) return <Empty>No tasks.</Empty>
      return (
        <CountBars
          rows={rows.map((row) => ({
            key: row.id,
            label: row.label,
            sublabel: row.sublabel,
            color: row.color,
            value: row.done,
            max: row.total,
            text: `${row.done}/${row.total} · ${Math.round((row.done / row.total) * 100)}%`
          }))}
        />
      )
    }
    case 'activity':
      return <ActivityChart entries={entries} days={widget.days ?? 14} now={now} />
    case 'github':
      return (
        <GitHubWidget
          repos={reposInScope(projectsInScope(data, widget.scope, overview))}
          mode={widget.github ?? 'pulls'}
          limit={limit}
        />
      )
  }
}
