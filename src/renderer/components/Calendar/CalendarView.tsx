import React, { useEffect, useState, useMemo } from 'react'
import {
  ChevronLeft, ChevronRight, Calendar,
  AlertCircle, Clock, CheckCircle2, Ship, LayoutGrid
} from 'lucide-react'

// ── Helpers ─────────────────────────────────────────────────────────
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
]

function getDaysInMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate()
}

function getFirstDayOfMonth(year: number, month: number) {
  return new Date(year, month, 1).getDay()
}

function isSameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
}

function isOverdue(deadline: number) {
  return deadline < Date.now()
}

function isDueSoon(deadline: number) {
  const diff = deadline - Date.now()
  return diff > 0 && diff < 86400000 * 3 // within 3 days
}

// ── Tag badge ────────────────────────────────────────────────────────
const StatusPill = ({ card }: { card: any }) => {
  const status = card._parsedStatus
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
const CardChip = ({
  card,
  onClick,
  compact = false
}: {
  card: any
  onClick: (card: any) => void
  compact?: boolean
}) => {
  const over = isOverdue(card.deadline)
  const soon = isDueSoon(card.deadline)

  let chipColor = card.color || 'var(--color-primary)'
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
        onClick={() => onClick(card)}
        title={card.title}
        className="w-2.5 h-2.5 rounded-full cursor-pointer hover:scale-125 transition-transform shrink-0"
        style={{ background: chipColor }}
      />
    )
  }

  return (
    <button
      onClick={() => onClick(card)}
      className="w-full flex items-center gap-1.5 px-2 py-1 text-left text-[10px] font-bold border-l-2 transition-all duration-100 hover:translate-x-px group"
      style={{
        borderColor: chipColor,
        background: chipColor + '14',
        color: 'var(--color-text)'
      }}
    >
      {urgencyIcon}
      <span className="flex-1 truncate font-black">{card.title}</span>
      <StatusPill card={card} />
      <span className="text-[8px] shrink-0 opacity-60 group-hover:opacity-100">
        {card._boardName}
      </span>
    </button>
  )
}

// ── Day Cell ─────────────────────────────────────────────────────────
const DayCell = ({
  day, month, year, cards, today, onCardClick
}: {
  day: number
  month: number
  year: number
  cards: any[]
  today: Date
  onCardClick: (card: any) => void
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
            boxShadow: isToday ? '2px 2px 0 var(--color-border-strong)' : 'none',
            border: isToday ? '2px solid var(--color-border-strong)' : '2px solid transparent'
          }}
        >
          {day}
        </span>
        {cards.length > MAX_VISIBLE && (
          <span className="text-[9px] font-black" style={{ color: 'var(--color-primary)' }}>
            +{cards.length - MAX_VISIBLE}
          </span>
        )}
      </div>

      {/* Card chips */}
      <div className="flex flex-col gap-0.5">
        {cards.slice(0, MAX_VISIBLE).map(c => (
          <CardChip key={c.id} card={c} onClick={onCardClick} />
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
  const [allCards, setAllCards] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedCard, setSelectedCard] = useState<any | null>(null)

  const curYear = viewDate.getFullYear()
  const curMonth = viewDate.getMonth()

  // Load all cards that have a deadline
  useEffect(() => {
    const load = async () => {
      setLoading(true)
      try {
        const [cards, boards, lists, docks] = await Promise.all([
          window.electron.db.findAll('cards'),
          window.electron.db.findAll('boards'),
          window.electron.db.findAll('lists'),
          window.electron.db.findAll('docks')
        ])

        const boardMap: Record<string, any> = {}
        boards.forEach((b: any) => { boardMap[b.id] = b })

        const listMap: Record<string, any> = {}
        lists.forEach((l: any) => { listMap[l.id] = l })

        const dockMap: Record<string, any> = {}
        docks.forEach((d: any) => { dockMap[d.id] = d })

        const withDeadline = cards
          .filter((c: any) => c.deadline && c.deadline > 0)
          .map((c: any) => {
            const list = listMap[c.listId]
            const board = list ? boardMap[list.boardId] : null
            const dock = board ? dockMap[board.dockId] : null

            let parsedStatus: any = null
            if (c.status) {
              try {
                parsedStatus = typeof c.status === 'string' ? JSON.parse(c.status) : c.status
              } catch {}
            }

            let parsedTags: any[] = []
            if (c.tags) {
              try {
                parsedTags = typeof c.tags === 'string' ? JSON.parse(c.tags) : c.tags
              } catch {}
            }

            return {
              ...c,
              _parsedStatus: parsedStatus,
              _parsedTags: parsedTags,
              _boardName: board?.name || '',
              _listName: list?.name || '',
              _dockName: dock?.name || '',
              _boardColor: board?.color || '#2D82B7'
            }
          })
          .sort((a: any, b: any) => a.deadline - b.deadline)

        setAllCards(withDeadline)
      } catch (err) {
        console.error('Calendar load error:', err)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [dataVersion])

  // ── Map deadlines → dates ──────────────────────────────────────────
  const cardsByDate = useMemo(() => {
    const map: Record<string, any[]> = {}
    allCards.forEach(c => {
      const d = new Date(c.deadline)
      const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`
      if (!map[key]) map[key] = []
      map[key].push(c)
    })
    return map
  }, [allCards])

  const cardsForDate = (y: number, m: number, d: number) =>
    cardsByDate[`${y}-${m}-${d}`] || []

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

  const handleCardClick = (card: any) => {
    setSelectedCard(card)
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
          style={{ borderColor: 'var(--color-border-strong)' + '30', background: 'var(--color-surface-3)' + '40', opacity: 0.4 }}
        >
          <span className="text-xs font-bold" style={{ color: 'var(--color-muted)' }}>{d}</span>
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
          cards={cardsForDate(curYear, curMonth, d)}
          today={today}
          onCardClick={handleCardClick}
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
          style={{ borderColor: 'var(--color-border-strong)' + '30', background: 'var(--color-surface-3)' + '40', opacity: 0.4 }}
        >
          <span className="text-xs font-bold" style={{ color: 'var(--color-muted)' }}>{i}</span>
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
          const cards = cardsForDate(date.getFullYear(), date.getMonth(), date.getDate())
          const isToday = isSameDay(date, today)
          return (
            <div key={i} className="border-r-2" style={{ borderColor: 'var(--color-border)' + '30' }}>
              {/* Day header */}
              <div
                className="p-2 border-b-2 text-center sticky top-0 z-10"
                style={{
                  borderColor: 'var(--color-border)' + '30',
                  background: isToday ? 'var(--color-primary)' : 'var(--color-surface-2)'
                }}
              >
                <p className="text-[9px] font-black uppercase tracking-widest" style={{ color: isToday ? 'white' : 'var(--color-muted)' }}>
                  {DAYS[i]}
                </p>
                <p className="text-lg font-black" style={{ color: isToday ? 'white' : 'var(--color-text)' }}>
                  {date.getDate()}
                </p>
              </div>
              {/* Cards */}
              <div className="p-1.5 space-y-1 min-h-[200px]">
                {cards.length === 0
                  ? <p className="text-center text-[9px] py-4" style={{ color: 'var(--color-muted)', opacity: 0.4 }}>—</p>
                  : cards.map(c => <CardChip key={c.id} card={c} onClick={handleCardClick} />)
                }
              </div>
            </div>
          )
        })}
      </div>
    )
  }

  // ── AGENDA view ────────────────────────────────────────────────────
  const renderAgenda = () => {
    // Group all cards by date, sorted
    const sorted = [...allCards].sort((a, b) => a.deadline - b.deadline)
    if (sorted.length === 0) {
      return (
        <div className="flex flex-col items-center justify-center py-20 gap-4" style={{ color: 'var(--color-muted)' }}>
          <Calendar className="w-12 h-12 opacity-30" />
          <p className="text-sm font-bold uppercase tracking-widest opacity-50">No deadlines set on any Cargo</p>
        </div>
      )
    }

    // Group by calendar date
    const groups: Record<string, any[]> = {}
    sorted.forEach(c => {
      const d = new Date(c.deadline)
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
      if (!groups[key]) groups[key] = []
      groups[key].push(c)
    })

    return (
      <div className="space-y-4 p-4 overflow-auto flex-1">
        {Object.entries(groups).map(([dateKey, cards]) => {
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
                    borderColor: isT ? 'var(--color-primary)' : past ? 'var(--color-warning)' : 'var(--color-border)',
                    background: isT ? 'var(--color-primary)' : 'var(--color-surface)',
                    boxShadow: isT ? '2px 2px 0 var(--color-border-strong)' : 'none'
                  }}
                >
                  <span className="text-[8px] font-black uppercase" style={{ color: isT ? 'rgba(255,255,255,0.8)' : 'var(--color-muted)' }}>
                    {MONTHS[date.getMonth()].slice(0, 3)}
                  </span>
                  <span className="text-base font-black leading-none" style={{ color: isT ? 'white' : 'var(--color-text)' }}>
                    {date.getDate()}
                  </span>
                </div>
                <div>
                  <p className="text-xs font-black uppercase tracking-wider" style={{ color: 'var(--color-text)' }}>
                    {isT ? '🎯 Today' : date.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
                  </p>
                  {past && (
                    <p className="text-[9px] font-bold uppercase" style={{ color: 'var(--color-warning)' }}>
                      ⚠ Overdue
                    </p>
                  )}
                </div>
              </div>

              {/* Cards */}
              <div className="ml-13 space-y-1.5" style={{ marginLeft: '3.5rem' }}>
                {cards.map(c => (
                  <button
                    key={c.id}
                    onClick={() => handleCardClick(c)}
                    className="w-full flex items-center gap-3 px-3 py-2 border-2 text-left transition-all duration-100 hover:translate-y-px group"
                    style={{
                      background: 'var(--color-surface)',
                      borderColor: c.color || 'var(--color-border)',
                      boxShadow: `2px 2px 0 ${c.color || 'var(--color-border-strong)'}`
                    }}
                  >
                    {/* Color swatch dot */}
                    <div className="w-2.5 h-2.5 border border-black/20 shrink-0 rounded-full" style={{ background: c.color || 'var(--color-primary)' }} />
                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-black truncate" style={{ color: 'var(--color-text)' }}>{c.title}</p>
                      <p className="text-[9px] font-bold" style={{ color: 'var(--color-muted)' }}>
                        {c._dockName && <><Ship className="w-2.5 h-2.5 inline mr-0.5" />{c._dockName} · </>}
                        <LayoutGrid className="w-2.5 h-2.5 inline mr-0.5" />{c._boardName}
                        {c._listName && <> · {c._listName}</>}
                      </p>
                    </div>
                    <StatusPill card={c} />
                    {isOverdue(c.deadline) && <AlertCircle className="w-3.5 h-3.5 text-orange-500 shrink-0" />}
                    {isDueSoon(c.deadline) && !isOverdue(c.deadline) && <Clock className="w-3.5 h-3.5 shrink-0" style={{ color: 'var(--color-warning)' }} />}
                    {c._parsedStatus?.name === 'Shipped' || c._parsedStatus?.name === 'Done' && <CheckCircle2 className="w-3.5 h-3.5 text-teal-500 shrink-0" />}
                  </button>
                ))}
              </div>
            </div>
          )
        })}
      </div>
    )
  }

  // ── Card detail popover ────────────────────────────────────────────
  const CardDetail = ({ card }: { card: any }) => {
    const over = isOverdue(card.deadline)
    const soon = isDueSoon(card.deadline)
    return (
      <div
        className="fixed inset-0 bg-black/40 flex items-center justify-center z-50"
        onClick={() => setSelectedCard(null)}
      >
        <div
          className="w-full max-w-md animate-brutal-in"
          style={{
            background: 'var(--color-surface)',
            border: '3px solid var(--color-border-strong)',
            boxShadow: 'var(--shadow-brutal-lg)'
          }}
          onClick={e => e.stopPropagation()}
        >
          {/* Header bar */}
          <div
            className="px-4 py-3 border-b-2"
            style={{ background: card.color || 'var(--color-primary)', borderColor: 'var(--color-border-strong)' }}
          >
            <p className="text-sm font-black text-white uppercase tracking-wide">{card.title}</p>
          </div>
          <div className="p-4 space-y-2">
            {card.description && (
              <p className="text-xs" style={{ color: 'var(--color-muted)' }}>{card.description}</p>
            )}
            <div className="grid grid-cols-2 gap-2 text-xs font-bold">
              <div className="p-2 border-2" style={{ borderColor: 'var(--color-border)', color: 'var(--color-muted)' }}>
                <p className="text-[9px] uppercase tracking-widest mb-0.5">Deadline</p>
                <p style={{ color: over ? '#D97B66' : soon ? 'var(--color-warning)' : 'var(--color-text)' }}>
                  {over && '⚠ '}{new Date(card.deadline).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}
                </p>
              </div>
              <div className="p-2 border-2" style={{ borderColor: 'var(--color-border)', color: 'var(--color-muted)' }}>
                <p className="text-[9px] uppercase tracking-widest mb-0.5">Status</p>
                <p>{card._parsedStatus?.name || '—'}</p>
              </div>
              <div className="p-2 border-2" style={{ borderColor: 'var(--color-border)', color: 'var(--color-muted)' }}>
                <p className="text-[9px] uppercase tracking-widest mb-0.5">Ship</p>
                <p>{card._boardName || '—'}</p>
              </div>
              <div className="p-2 border-2" style={{ borderColor: 'var(--color-border)', color: 'var(--color-muted)' }}>
                <p className="text-[9px] uppercase tracking-widest mb-0.5">Dock</p>
                <p>{card._dockName || '—'}</p>
              </div>
            </div>
            {card._parsedTags?.length > 0 && (
              <div className="flex flex-wrap gap-1 pt-1">
                {card._parsedTags.map((t: any, i: number) => (
                  <span key={i} className="text-[9px] font-black uppercase px-1.5 py-0.5 border" style={{ borderColor: t.color || 'var(--color-primary)', color: t.color || 'var(--color-primary)' }}>
                    {t.name}
                  </span>
                ))}
              </div>
            )}
          </div>
          <div className="px-4 pb-4 flex justify-end">
            <button
              className="btn-secondary text-xs uppercase tracking-wider"
              onClick={() => setSelectedCard(null)}
            >
              Close
            </button>
          </div>
        </div>
      </div>
    )
  }

  // ── Stats bar ──────────────────────────────────────────────────────
  const overdue = allCards.filter(c => isOverdue(c.deadline))
  const dueSoon = allCards.filter(c => isDueSoon(c.deadline))

  // ── Header title ───────────────────────────────────────────────────
  const headerTitle = viewMode === 'month'
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
        className="flex items-center justify-between px-5 py-3 border-b-4 shrink-0"
        style={{ background: 'var(--color-header)', borderColor: 'var(--color-border-strong)' }}
      >
        <div className="flex items-center gap-3">
          <Calendar className="w-5 h-5 text-white" />
          <div>
            <h1 className="text-base font-black text-white uppercase tracking-widest">Voyage Calendar</h1>
            <p className="text-[10px] text-white/60 font-bold uppercase tracking-wider">{headerTitle}</p>
          </div>
        </div>

        {/* Stats pills */}
        <div className="flex items-center gap-2">
          {overdue.length > 0 && (
            <div className="flex items-center gap-1.5 px-3 py-1 border-2 border-[#D97B66] text-[#D97B66]" style={{ background: '#D97B6614' }}>
              <AlertCircle className="w-3.5 h-3.5" />
              <span className="text-xs font-black">{overdue.length} Overdue</span>
            </div>
          )}
          {dueSoon.length > 0 && (
            <div className="flex items-center gap-1.5 px-3 py-1 border-2 border-[#d97706] text-[#d97706]" style={{ background: '#d9770614' }}>
              <Clock className="w-3.5 h-3.5" />
              <span className="text-xs font-black">{dueSoon.length} Due Soon</span>
            </div>
          )}
          <div className="flex items-center gap-1.5 px-3 py-1 border-2 border-[#5FA8D3] text-[#5FA8D3]" style={{ background: '#5FA8D314' }}>
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span className="text-xs font-black">{allCards.length} Total</span>
          </div>
        </div>

        {/* View toggle + nav */}
        <div className="flex items-center gap-2">
          {/* View mode selector */}
          <div className="flex border-2 border-white/30">
            {(['month', 'week', 'agenda'] as ViewMode[]).map(m => (
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
            <Calendar className="w-8 h-8 mx-auto animate-pulse" style={{ color: 'var(--color-primary)' }} />
            <p className="text-xs font-bold uppercase tracking-widest" style={{ color: 'var(--color-muted)' }}>Loading Voyage Schedule…</p>
          </div>
        </div>
      ) : (
        <div className="flex-1 flex flex-col overflow-hidden">
          {viewMode === 'month' && (
            <>
              {/* Day headers */}
              <div
                className="grid grid-cols-7 border-b-2 shrink-0"
                style={{ borderColor: 'var(--color-border-strong)', background: 'var(--color-surface-2)' }}
              >
                {DAYS.map(d => (
                  <div
                    key={d}
                    className="py-2 text-center text-[10px] font-black uppercase tracking-widest border-r-2"
                    style={{ borderColor: 'var(--color-border)' + '40', color: 'var(--color-muted)' }}
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

          {viewMode === 'week' && (
            <>
              {renderWeek()}
            </>
          )}

          {viewMode === 'agenda' && renderAgenda()}
        </div>
      )}

      {/* ── Card detail modal ── */}
      {selectedCard && <CardDetail card={selectedCard} />}
    </div>
  )
}
