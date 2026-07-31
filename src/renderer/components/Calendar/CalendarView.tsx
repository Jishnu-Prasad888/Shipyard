import React, { useEffect, useState, useMemo } from 'react'
import {
  ChevronLeft,
  ChevronRight,
  Calendar,
  AlertCircle,
  Clock,
  CheckCircle2,
  FolderKanban,
  LayoutGrid,
  Navigation
} from 'lucide-react'

// ── Helpers ─────────────────────────────────────────────────────────
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December'
]

function getDaysInMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate()
}

function getFirstDayOfMonth(year: number, month: number) {
  return new Date(year, month, 1).getDay()
}

function isSameDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  )
}

function isOverdue(deadline: number) {
  return deadline < Date.now()
}

function isDueSoon(deadline: number) {
  const diff = deadline - Date.now()
  return diff > 0 && diff < 86400000 * 3 // within 3 days
}

// ── Tag badge ────────────────────────────────────────────────────────
const StatusPill = ({ task }: { task: any }) => {
  const status = task._parsedStatus
  if (!status) return null
  return (
    <span
      className="text-[8px] font-black uppercase px-1 py-0.5 border shrink-0"
      style={{ borderColor: status.color, color: status.color, background: status.color + '18' }}
    >
      {status.name}
    </span>
  )
}

// ── Single event chip used in both views ─────────────────────────────
const TaskChip = ({
  task,
  onClick,
  compact = false
}: {
  task: any
  onClick: (task: any) => void
  compact?: boolean
}) => {
  const over = isOverdue(task.deadline)
  const soon = isDueSoon(task.deadline)

  let chipColor = task.color || 'var(--color-primary)'
  let urgencyIcon: React.ReactNode = null
  if (over) {
    chipColor = '#D97B66'
    urgencyIcon = <AlertCircle className="w-3 h-3 shrink-0" />
  } else if (soon) {
    urgencyIcon = <Clock className="w-3 h-3 shrink-0" />
  }

  if (compact) {
    return (
      <div
        onClick={() => onClick(task)}
        title={task.title}
        className="w-2.5 h-2.5 rounded-full cursor-pointer hover:scale-125 transition-transform shrink-0"
        style={{ background: chipColor }}
      />
    )
  }

  return (
    <button
      onClick={() => onClick(task)}
      className="w-full flex items-center gap-1.5 px-2 py-1 text-left text-[10px] font-bold border-l-2 transition-all duration-100 hover:translate-x-px group"
      style={{
        borderColor: chipColor,
        background: chipColor + '14',
        color: 'var(--color-text)'
      }}
    >
      {urgencyIcon}
      <span className="flex-1 break-words whitespace-pre-wrap font-black leading-tight">
        {task.title}
      </span>
      <StatusPill task={task} />
      <span className="text-[8px] shrink-0 opacity-60 group-hover:opacity-100">
        {task._boardName}
      </span>
    </button>
  )
}

// ── Day Cell ─────────────────────────────────────────────────────────
const DayCell = ({
  day,
  month,
  year,
  tasks,
  today,
  onTaskClick
}: {
  day: number
  month: number
  year: number
  tasks: any[]
  today: Date
  onTaskClick: (task: any) => void
}) => {
  const date = new Date(year, month, day)
  const isToday = isSameDay(date, today)
  const MAX_VISIBLE = 3

  return (
    <div
      className="min-h-[100px] p-1.5 border-r-2 border-b-2 flex flex-col gap-1 overflow-hidden"
      style={{ borderColor: 'var(--color-border-strong)' + '30' }}
    >
      {/* Day number */}
      <div className="flex items-center justify-between">
        <span
          className="flex items-center justify-center w-6 h-6 text-xs font-black"
          style={{
            background: isToday ? 'var(--color-primary)' : 'transparent',
            color: isToday ? 'white' : 'var(--color-text)',
            boxShadow: isToday ? 'var(--shadow-control)' : 'none',
            border: isToday ? '2px solid var(--color-border-strong)' : '2px solid transparent'
          }}
        >
          {day}
        </span>
        {tasks.length > MAX_VISIBLE && (
          <span className="text-[9px] font-black" style={{ color: 'var(--color-primary)' }}>
            +{tasks.length - MAX_VISIBLE}
          </span>
        )}
      </div>

      {/* Task chips */}
      <div className="flex flex-col gap-0.5">
        {tasks.slice(0, MAX_VISIBLE).map((task) => (
          <TaskChip key={task.id} task={task} onClick={onTaskClick} />
        ))}
      </div>
    </div>
  )
}

// ── Main Calendar Component ──────────────────────────────────────────
interface CalendarViewProps {
  dataVersion?: number
}

type ViewMode = 'month' | 'week' | 'agenda'

export const CalendarView: React.FC<CalendarViewProps> = ({ dataVersion }) => {
  const today = useMemo(() => new Date(), [])
  const [viewDate, setViewDate] = useState(new Date(today.getFullYear(), today.getMonth(), 1))
  const [viewMode, setViewMode] = useState<ViewMode>('month')
  const [allTasks, setAllTasks] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedTask, setSelectedTask] = useState<any | null>(null)

  const curYear = viewDate.getFullYear()
  const curMonth = viewDate.getMonth()

  // Load all tasks that have a deadline.
  useEffect(() => {
    const load = async () => {
      setLoading(true)
      try {
        const [tasks, boards, columns, projects] = await Promise.all([
          window.electron.db.findAll('tasks'),
          window.electron.db.findAll('boards'),
          window.electron.db.findAll('columns'),
          window.electron.db.findAll('projects')
        ])

        const boardMap: Record<string, any> = {}
        boards.forEach((b: any) => {
          boardMap[b.id] = b
        })

        const columnMap: Record<string, any> = {}
        columns.forEach((column: any) => {
          columnMap[column.id] = column
        })

        const projectMap: Record<string, any> = {}
        projects.forEach((project: any) => {
          projectMap[project.id] = project
        })

        const withDeadline = tasks
          .filter((task: any) => task.deadline && task.deadline > 0)
          .map((task: any) => {
            const column = columnMap[task.columnId]
            const board = column ? boardMap[column.boardId] : null
            const project = board ? projectMap[board.projectId] : null

            let parsedStatus: any = null
            if (task.status) {
              try {
                parsedStatus =
                  typeof task.status === 'string' ? JSON.parse(task.status) : task.status
              } catch {}
            }

            let parsedTags: any[] = []
            if (task.tags) {
              try {
                parsedTags = typeof task.tags === 'string' ? JSON.parse(task.tags) : task.tags
              } catch {}
            }

            return {
              ...task,
              _parsedStatus: parsedStatus,
              _parsedTags: parsedTags,
              _boardName: board?.name || '',
              _boardId: board?.id || task.boardId || null,
              _columnName: column?.name || '',
              _projectName: project?.name || '',
              _projectId: project?.id || null,
              _boardColor: board?.color || '#2D82B7'
            }
          })
          .sort((a: any, b: any) => a.deadline - b.deadline)

        setAllTasks(withDeadline)
      } catch (err) {
        console.error('Calendar load error:', err)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [dataVersion])

  // ── Map deadlines → dates ──────────────────────────────────────────
  const tasksByDate = useMemo(() => {
    const map: Record<string, any[]> = {}
    allTasks.forEach((task) => {
      const d = new Date(task.deadline)
      const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`
      if (!map[key]) map[key] = []
      map[key].push(task)
    })
    return map
  }, [allTasks])

  const tasksForDate = (y: number, m: number, d: number) => tasksByDate[`${y}-${m}-${d}`] || []

  // ── Navigation ────────────────────────────────────────────────────
  const goBack = () => {
    if (viewMode === 'month') setViewDate(new Date(curYear, curMonth - 1, 1))
    else if (viewMode === 'week') setViewDate(new Date(viewDate.getTime() - 7 * 86400000))
  }
  const goForward = () => {
    if (viewMode === 'month') setViewDate(new Date(curYear, curMonth + 1, 1))
    else if (viewMode === 'week') setViewDate(new Date(viewDate.getTime() + 7 * 86400000))
  }
  const goToday = () => setViewDate(new Date(today.getFullYear(), today.getMonth(), 1))

  const handleTaskClick = (task: any) => {
    setSelectedTask(task)
  }

  // ── MONTH grid ──────────────────────────────────────────────────
  const renderMonth = () => {
    const daysInMonth = getDaysInMonth(curYear, curMonth)
    const firstDay = getFirstDayOfMonth(curYear, curMonth)
    const prevMonthDays = getDaysInMonth(curYear, curMonth - 1)

    const cells: React.ReactNode[] = []

    // Leading grey days from prev month
    for (let i = 0; i < firstDay; i++) {
      const d = prevMonthDays - firstDay + 1 + i
      cells.push(
        <div
          key={`prev-${i}`}
          className="min-h-[100px] p-1.5 border-r-2 border-b-2"
          style={{
            borderColor: 'var(--color-border-strong)' + '30',
            background: 'var(--color-surface-3)' + '40',
            opacity: 0.4
          }}
        >
          <span className="text-xs font-bold" style={{ color: 'var(--color-muted)' }}>
            {d}
          </span>
        </div>
      )
    }

    // This month's days
    for (let d = 1; d <= daysInMonth; d++) {
      cells.push(
        <DayCell
          key={d}
          day={d}
          month={curMonth}
          year={curYear}
          tasks={tasksForDate(curYear, curMonth, d)}
          today={today}
          onTaskClick={handleTaskClick}
        />
      )
    }

    // Trailing days
    const total = firstDay + daysInMonth
    const trailing = (7 - (total % 7)) % 7
    for (let i = 1; i <= trailing; i++) {
      cells.push(
        <div
          key={`next-${i}`}
          className="min-h-[100px] p-1.5 border-r-2 border-b-2"
          style={{
            borderColor: 'var(--color-border-strong)' + '30',
            background: 'var(--color-surface-3)' + '40',
            opacity: 0.4
          }}
        >
          <span className="text-xs font-bold" style={{ color: 'var(--color-muted)' }}>
            {i}
          </span>
        </div>
      )
    }

    return cells
  }

  // ── WEEK view ─────────────────────────────────────────────────────
  const renderWeek = () => {
    // Find the Sunday of viewDate's week
    const day = viewDate.getDay()
    const sunday = new Date(viewDate.getTime() - day * 86400000)
    const days = Array.from({ length: 7 }, (_, i) => new Date(sunday.getTime() + i * 86400000))

    return (
      <div className="grid grid-cols-7 flex-1 overflow-auto">
        {days.map((date, i) => {
          const tasks = tasksForDate(date.getFullYear(), date.getMonth(), date.getDate())
          const isToday = isSameDay(date, today)
          return (
            <div
              key={i}
              className="border-r-2"
              style={{ borderColor: 'var(--color-border)' + '30' }}
            >
              {/* Day header */}
              <div
                className="p-2 border-b-2 text-center sticky top-0 z-10"
                style={{
                  borderColor: 'var(--color-border)' + '30',
                  background: isToday ? 'var(--color-primary)' : 'var(--color-surface-2)'
                }}
              >
                <p
                  className="text-[9px] font-black uppercase tracking-widest"
                  style={{ color: isToday ? 'white' : 'var(--color-muted)' }}
                >
                  {DAYS[i]}
                </p>
                <p
                  className="text-lg font-black"
                  style={{ color: isToday ? 'white' : 'var(--color-text)' }}
                >
                  {date.getDate()}
                </p>
              </div>
              {/* Tasks */}
              <div className="p-1.5 space-y-1 min-h-[200px]">
                {tasks.length === 0 ? (
                  <p
                    className="text-center text-[9px] py-4"
                    style={{ color: 'var(--color-muted)', opacity: 0.4 }}
                  >
                    —
                  </p>
                ) : (
                  tasks.map((task) => (
                    <TaskChip key={task.id} task={task} onClick={handleTaskClick} />
                  ))
                )}
              </div>
            </div>
          )
        })}
      </div>
    )
  }

  // ── AGENDA view ────────────────────────────────────────────────────
  const renderAgenda = () => {
    const sorted = [...allTasks].sort((a, b) => a.deadline - b.deadline)
    if (sorted.length === 0) {
      return (
        <div
          className="flex flex-col items-center justify-center py-20 gap-4"
          style={{ color: 'var(--color-muted)' }}
        >
          <Calendar className="w-12 h-12 opacity-30" />
          <p className="text-sm font-bold uppercase tracking-widest opacity-50">
            No task deadlines
          </p>
        </div>
      )
    }

    // Group by calendar date
    const groups: Record<string, any[]> = {}
    sorted.forEach((c) => {
      const d = new Date(c.deadline)
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
      if (!groups[key]) groups[key] = []
      groups[key].push(c)
    })

    return (
      <div className="space-y-4 p-4 overflow-auto flex-1">
        {Object.entries(groups).map(([dateKey, tasks]) => {
          const date = new Date(dateKey)
          const isT = isSameDay(date, today)
          const past = date < today && !isT
          return (
            <div key={dateKey}>
              {/* Date header */}
              <div className="flex items-center gap-3 mb-2">
                <div
                  className="flex flex-col items-center justify-center w-10 h-10 border-2 shrink-0"
                  style={{
                    borderColor: isT
                      ? 'var(--color-primary)'
                      : past
                        ? 'var(--color-warning)'
                        : 'var(--color-border)',
                    background: isT ? 'var(--color-primary)' : 'var(--color-surface)',
                    boxShadow: isT ? 'var(--shadow-control)' : 'none'
                  }}
                >
                  <span
                    className="text-[8px] font-black uppercase"
                    style={{ color: isT ? 'rgba(255,255,255,0.8)' : 'var(--color-muted)' }}
                  >
                    {MONTHS[date.getMonth()].slice(0, 3)}
                  </span>
                  <span
                    className="text-base font-black leading-none"
                    style={{ color: isT ? 'white' : 'var(--color-text)' }}
                  >
                    {date.getDate()}
                  </span>
                </div>
                <div>
                  <p
                    className="text-xs font-black uppercase tracking-wider"
                    style={{ color: 'var(--color-text)' }}
                  >
                    {isT
                      ? '🎯 Today'
                      : date.toLocaleDateString('en-US', {
                          weekday: 'long',
                          year: 'numeric',
                          month: 'long',
                          day: 'numeric'
                        })}
                  </p>
                  {past && (
                    <p
                      className="text-[9px] font-bold uppercase"
                      style={{ color: 'var(--color-warning)' }}
                    >
                      ⚠ Overdue
                    </p>
                  )}
                </div>
              </div>

              {/* Tasks */}
              <div className="ml-13 space-y-1.5" style={{ marginLeft: '3.5rem' }}>
                {tasks.map((task) => (
                  <button
                    key={task.id}
                    onClick={() => handleTaskClick(task)}
                    className="w-full flex items-center gap-3 px-3 py-2 border-2 text-left transition-all duration-100 hover:translate-y-px group"
                    style={{
                      background: 'var(--color-surface)',
                      borderColor: task.color || 'var(--color-border)',
                      boxShadow: 'var(--shadow-control)'
                    }}
                  >
                    {/* Color swatch dot */}
                    <div
                      className="w-2.5 h-2.5 border border-black/20 shrink-0 rounded-full"
                      style={{ background: task.color || 'var(--color-primary)' }}
                    />
                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <p
                        className="text-xs font-black break-words whitespace-pre-wrap leading-tight"
                        style={{ color: 'var(--color-text)' }}
                      >
                        {task.title}
                      </p>
                      <p className="text-[9px] font-bold" style={{ color: 'var(--color-muted)' }}>
                        {task._projectName && (
                          <>
                            <FolderKanban className="w-2.5 h-2.5 inline mr-0.5" />
                            {task._projectName} ·{' '}
                          </>
                        )}
                        <LayoutGrid className="w-2.5 h-2.5 inline mr-0.5" />
                        {task._boardName}
                        {task._columnName && <> · {task._columnName}</>}
                      </p>
                    </div>
                    <StatusPill task={task} />
                    {isOverdue(task.deadline) && (
                      <AlertCircle className="w-3.5 h-3.5 text-orange-500 shrink-0" />
                    )}
                    {isDueSoon(task.deadline) && !isOverdue(task.deadline) && (
                      <Clock
                        className="w-3.5 h-3.5 shrink-0"
                        style={{ color: 'var(--color-warning)' }}
                      />
                    )}
                    {task._parsedStatus?.name === 'Done' && (
                      <CheckCircle2 className="w-3.5 h-3.5 text-teal-500 shrink-0" />
                    )}
                  </button>
                ))}
              </div>
            </div>
          )
        })}
      </div>
    )
  }

  const TaskDetail = ({ task }: { task: any }) => {
    const over = isOverdue(task.deadline)
    const soon = isDueSoon(task.deadline)

    const handleOpenTask = () => {
      window.dispatchEvent(
        new CustomEvent('navigate-to-task', {
          detail: {
            projectId: task._projectId,
            boardId: task._boardId,
            taskId: task.id
          }
        })
      )
      setSelectedTask(null)
    }

    return (
      <div
        className="fixed inset-0 bg-black/40 flex items-center justify-center z-50"
        onClick={() => setSelectedTask(null)}
      >
        <div
          className="aero-window w-full max-w-md animate-brutal-in"
          style={{
            background: 'var(--color-surface)',
            border: '1px solid var(--color-border-strong)',
            boxShadow: 'var(--shadow-window)'
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header bar */}
          <div
            className="aero-titlebar px-4 py-3 border-b"
            style={
              {
                '--aero-titlebar-start': task.color || 'var(--color-primary-hover)',
                '--aero-titlebar-accent': task.color || 'var(--color-primary)',
                '--aero-titlebar-end': task.color || 'var(--color-secondary)',
                borderColor: 'var(--color-border-strong)'
              } as React.CSSProperties
            }
          >
            <p className="text-sm font-black text-white uppercase tracking-wide">{task.title}</p>
          </div>
          <div className="p-4 space-y-2">
            {task.description && (
              <p className="text-xs" style={{ color: 'var(--color-muted)' }}>
                {task.description}
              </p>
            )}
            <div className="grid grid-cols-2 gap-2 text-xs font-bold">
              <div
                className="p-2 border-2"
                style={{ borderColor: 'var(--color-border)', color: 'var(--color-muted)' }}
              >
                <p className="text-[9px] uppercase tracking-widest mb-0.5">Deadline</p>
                <p
                  style={{
                    color: over ? '#D97B66' : soon ? 'var(--color-warning)' : 'var(--color-text)'
                  }}
                >
                  {over && 'Overdue: '}
                  {new Date(task.deadline).toLocaleDateString('en-US', {
                    weekday: 'short',
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric'
                  })}
                </p>
              </div>
              <div
                className="p-2 border-2"
                style={{ borderColor: 'var(--color-border)', color: 'var(--color-muted)' }}
              >
                <p className="text-[9px] uppercase tracking-widest mb-0.5">Status</p>
                <p>{task._parsedStatus?.name || '-'}</p>
              </div>
              <div
                className="p-2 border-2"
                style={{ borderColor: 'var(--color-border)', color: 'var(--color-muted)' }}
              >
                <p className="text-[9px] uppercase tracking-widest mb-0.5">Board</p>
                <p>{task._boardName || '-'}</p>
              </div>
              <div
                className="p-2 border-2"
                style={{ borderColor: 'var(--color-border)', color: 'var(--color-muted)' }}
              >
                <p className="text-[9px] uppercase tracking-widest mb-0.5">Project</p>
                <p>{task._projectName || '-'}</p>
              </div>
            </div>
            {task._parsedTags?.length > 0 && (
              <div className="flex flex-wrap gap-1 pt-1">
                {task._parsedTags.map((t: any, i: number) => (
                  <span
                    key={i}
                    className="text-[9px] font-black uppercase px-1.5 py-0.5 border"
                    style={{
                      borderColor: t.color || 'var(--color-primary)',
                      color: t.color || 'var(--color-primary)'
                    }}
                  >
                    {t.name}
                  </span>
                ))}
              </div>
            )}
          </div>
          <div className="px-4 pb-4 flex justify-end">
            <button
              className="btn-primary text-xs uppercase tracking-wider flex items-center gap-2 mr-2"
              onClick={handleOpenTask}
              title="Open task on its board"
            >
              <Navigation className="w-4 h-4" />
              Open Task
            </button>
            <button
              className="btn-secondary text-xs uppercase tracking-wider"
              onClick={() => setSelectedTask(null)}
            >
              Close
            </button>
          </div>
        </div>
      </div>
    )
  }

  // ── Stats bar ──────────────────────────────────────────────────────
  const overdue = allTasks.filter((task) => isOverdue(task.deadline))
  const dueSoon = allTasks.filter((task) => isDueSoon(task.deadline))

  // ── Header title ───────────────────────────────────────────────────
  const headerTitle =
    viewMode === 'month'
      ? `${MONTHS[curMonth]} ${curYear}`
      : viewMode === 'week'
        ? (() => {
            const day = viewDate.getDay()
            const sun = new Date(viewDate.getTime() - day * 86400000)
            const sat = new Date(sun.getTime() + 6 * 86400000)
            return `${sun.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${sat.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`
          })()
        : 'All Deadlines'

  return (
    <div
      className="flex flex-col h-full overflow-hidden"
      style={{ background: 'var(--color-background)' }}
    >
      {/* ── TOP BAR ── */}
      <div
        className="aero-toolbar flex items-center justify-between px-5 py-3 border-b shrink-0"
        style={{ background: 'var(--color-header)', borderColor: 'var(--color-border-strong)' }}
      >
        <div className="flex items-center gap-3">
          <Calendar className="w-5 h-5 text-white" />
          <div>
            <h1 className="text-base font-black text-white uppercase tracking-widest">
              Project Calendar
            </h1>
            <p className="text-[10px] text-white/60 font-bold uppercase tracking-wider">
              {headerTitle}
            </p>
          </div>
        </div>

        {/* Stats pills */}
        <div className="flex items-center gap-2">
          {overdue.length > 0 && (
            <div
              className="flex items-center gap-1.5 px-3 py-1 border-2 border-[#D97B66] text-[#D97B66]"
              style={{ background: '#D97B6614' }}
            >
              <AlertCircle className="w-3.5 h-3.5" />
              <span className="text-xs font-black">{overdue.length} Overdue</span>
            </div>
          )}
          {dueSoon.length > 0 && (
            <div
              className="flex items-center gap-1.5 px-3 py-1 border-2 border-[#d97706] text-[#d97706]"
              style={{ background: '#d9770614' }}
            >
              <Clock className="w-3.5 h-3.5" />
              <span className="text-xs font-black">{dueSoon.length} Due Soon</span>
            </div>
          )}
          <div
            className="flex items-center gap-1.5 px-3 py-1 border-2 border-[#5FA8D3] text-[#5FA8D3]"
            style={{ background: '#5FA8D314' }}
          >
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span className="text-xs font-black">{allTasks.length} Tasks</span>
          </div>
        </div>

        {/* View toggle + nav */}
        <div className="flex items-center gap-2">
          {/* View mode selector */}
          <div className="flex border-2 border-white/30">
            {(['month', 'week', 'agenda'] as ViewMode[]).map((m) => (
              <button
                key={m}
                onClick={() => setViewMode(m)}
                className="px-3 py-1 text-[10px] font-black uppercase tracking-wider transition-all"
                style={{
                  background: viewMode === m ? 'white' : 'transparent',
                  color: viewMode === m ? 'var(--color-header)' : 'white',
                  borderRight: m !== 'agenda' ? '2px solid rgba(255,255,255,0.3)' : 'none'
                }}
              >
                {m}
              </button>
            ))}
          </div>

          {/* Nav arrows (not for agenda) */}
          {viewMode !== 'agenda' && (
            <div className="flex items-center gap-1">
              <button
                onClick={goBack}
                className="w-8 h-8 border-2 border-white/30 text-white flex items-center justify-center hover:bg-white/20 transition"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                onClick={goToday}
                className="px-2 py-1 border-2 border-white/30 text-white text-[10px] font-black uppercase hover:bg-white/20 transition"
              >
                Today
              </button>
              <button
                onClick={goForward}
                className="w-8 h-8 border-2 border-white/30 text-white flex items-center justify-center hover:bg-white/20 transition"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ── CALENDAR BODY ── */}
      {loading ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center space-y-2">
            <Calendar
              className="w-8 h-8 mx-auto animate-pulse"
              style={{ color: 'var(--color-primary)' }}
            />
            <p
              className="text-xs font-bold uppercase tracking-widest"
              style={{ color: 'var(--color-muted)' }}
            >
              Loading Project Calendar...
            </p>
          </div>
        </div>
      ) : (
        <div className="flex-1 flex flex-col overflow-hidden">
          {viewMode === 'month' && (
            <>
              {/* Day headers */}
              <div
                className="grid grid-cols-7 border-b-2 shrink-0"
                style={{
                  borderColor: 'var(--color-border-strong)',
                  background: 'var(--color-surface-2)'
                }}
              >
                {DAYS.map((d) => (
                  <div
                    key={d}
                    className="py-2 text-center text-[10px] font-black uppercase tracking-widest border-r-2"
                    style={{
                      borderColor: 'var(--color-border)' + '40',
                      color: 'var(--color-muted)'
                    }}
                  >
                    {d}
                  </div>
                ))}
              </div>
              {/* Grid */}
              <div
                className="grid grid-cols-7 flex-1 overflow-auto border-t-0 border-l-2"
                style={{ borderColor: 'var(--color-border-strong)' + '30' }}
              >
                {renderMonth()}
              </div>
            </>
          )}

          {viewMode === 'week' && <>{renderWeek()}</>}

          {viewMode === 'agenda' && renderAgenda()}
        </div>
      )}

      {selectedTask && <TaskDetail task={selectedTask} />}
    </div>
  )
}
