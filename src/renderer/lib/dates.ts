/**
 * Conversions between stored deadlines (epoch ms) and `<input type="date">`
 * values (YYYY-MM-DD), both in the user's local time zone.
 *
 * `new Date('2026-11-25')` parses as UTC midnight and `toISOString()` prints
 * the UTC date, which shifts deadlines by a day for anyone not on UTC.
 */

const pad = (n: number): string => String(n).padStart(2, '0')

/** Local calendar date of a timestamp, as YYYY-MM-DD ('' for no deadline). */
export const toDateInputValue = (ms: number | null | undefined): string => {
  if (ms == null || !Number.isFinite(Number(ms)) || Number(ms) <= 0) return ''
  const d = new Date(Number(ms))
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/**
 * A YYYY-MM-DD value as the end of that local day, so a task due today only
 * counts as overdue once the day is over. Returns null for an empty value.
 */
export const fromDateInputValue = (value: string): number | null => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim())
  if (!match) return null
  const [, y, m, d] = match
  return new Date(Number(y), Number(m) - 1, Number(d), 23, 59, 59, 999).getTime()
}
