const MANILA_TZ = 'Asia/Manila'
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

/** Longest range a single tool call may query (keeps payloads and DB load bounded). */
export const MAX_RANGE_DAYS = 366

export interface ManilaNow {
  date: string    // 'YYYY-MM-DD'
  time: string    // 'HH:mm' (24h)
  weekday: string // 'Monday'
}

export function manilaNow(now: Date = new Date()): ManilaNow {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: MANILA_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
    weekday: 'long',
  }).formatToParts(now)
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find(p => p.type === type)?.value ?? ''

  return {
    date: `${get('year')}-${get('month')}-${get('day')}`,
    time: `${get('hour')}:${get('minute')}`,
    weekday: get('weekday'),
  }
}

function toUtcDay(date: string): number {
  const [y, m, d] = date.split('-').map(Number)
  return Date.UTC(y, m - 1, d) / 86_400_000
}

export function validateDateRange(
  startDate: string,
  endDate: string
): { ok: true } | { ok: false; error: string } {
  if (!DATE_RE.test(startDate) || !DATE_RE.test(endDate)) {
    return { ok: false, error: 'Dates must be in YYYY-MM-DD format.' }
  }
  if (startDate > endDate) {
    return { ok: false, error: 'startDate must be on or before endDate.' }
  }
  if (toUtcDay(endDate) - toUtcDay(startDate) + 1 > MAX_RANGE_DAYS) {
    return { ok: false, error: `Range too long; max ${MAX_RANGE_DAYS} days per query.` }
  }
  return { ok: true }
}
