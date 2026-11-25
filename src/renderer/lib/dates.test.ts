import { describe, expect, it } from 'vitest'
import { fromDateInputValue, toDateInputValue } from './dates'

describe('date input helpers', () => {
  it('round-trips a calendar date in local time', () => {
    const ms = fromDateInputValue('2026-11-25')!
    const d = new Date(ms)
    expect([d.getFullYear(), d.getMonth(), d.getDate()]).toEqual([2026, 10, 25])
    expect(toDateInputValue(ms)).toBe('2026-11-25')
  })

  it('uses the end of the day so today is not overdue', () => {
    const ms = fromDateInputValue('2026-01-01')!
    expect(new Date(ms).getHours()).toBe(23)
  })

  it('formats the local date, not the UTC date', () => {
    const lateEvening = new Date(2026, 4, 3, 23, 30).getTime()
    expect(toDateInputValue(lateEvening)).toBe('2026-05-03')
    const earlyMorning = new Date(2026, 4, 3, 0, 15).getTime()
    expect(toDateInputValue(earlyMorning)).toBe('2026-05-03')
  })

  it('handles empty and invalid values', () => {
    expect(toDateInputValue(null)).toBe('')
    expect(toDateInputValue(undefined)).toBe('')
    expect(fromDateInputValue('')).toBeNull()
    expect(fromDateInputValue('not a date')).toBeNull()
  })
})
