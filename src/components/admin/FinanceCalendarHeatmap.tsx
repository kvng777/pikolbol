'use client'

import { useMemo } from 'react'
import { parseISO, format, startOfWeek, differenceInCalendarWeeks, addWeeks, addDays, isSameMonth } from 'date-fns'
import { DailyRevenue, formatCurrency } from '@/lib/financeUtils'

interface FinanceCalendarHeatmapProps {
  daily: DailyRevenue[]
  isLoading?: boolean
}

const WEEKDAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

// 5-step emerald ramp, plus neutral for zero.
function shadeFor(net: number, max: number): string {
  if (net <= 0 || max <= 0) return 'bg-gray-100'
  const ratio = net / max
  if (ratio > 0.8) return 'bg-emerald-600'
  if (ratio > 0.6) return 'bg-emerald-500'
  if (ratio > 0.4) return 'bg-emerald-400'
  if (ratio > 0.2) return 'bg-emerald-300'
  return 'bg-emerald-200'
}

export function FinanceCalendarHeatmap({ daily, isLoading }: FinanceCalendarHeatmapProps) {
  const { weeks, maxNet, isDense } = useMemo(() => {
    if (daily.length === 0) return { weeks: [], maxNet: 0, isDense: false }

    const byDate = new Map<string, DailyRevenue>()
    for (const d of daily) byDate.set(d.date, d)

    const firstDate = parseISO(daily[0].date)
    const lastDate = parseISO(daily[daily.length - 1].date)
    const gridStart = startOfWeek(firstDate, { weekStartsOn: 1 })
    const gridEnd = startOfWeek(lastDate, { weekStartsOn: 1 })
    const weekCount = differenceInCalendarWeeks(gridEnd, gridStart, { weekStartsOn: 1 }) + 1

    const weeks: Array<{
      monday: Date
      days: Array<{ date: Date; entry: DailyRevenue | null; inRange: boolean }>
    }> = []

    for (let w = 0; w < weekCount; w++) {
      const monday = addWeeks(gridStart, w)
      const days = Array.from({ length: 7 }, (_, i) => {
        const d = addDays(monday, i)
        const key = format(d, 'yyyy-MM-dd')
        const entry = byDate.get(key) || null
        const inRange = d >= firstDate && d <= lastDate
        return { date: d, entry, inRange }
      })
      weeks.push({ monday, days })
    }

    const maxNet = daily.reduce((m, d) => Math.max(m, d.netRevenue), 0)
    return { weeks, maxNet, isDense: weekCount > 26 }
  }, [daily])

  if (isLoading) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm animate-pulse">
        <div className="h-6 bg-gray-200 rounded w-40 mb-4" />
        <div className="h-40 bg-gray-100 rounded" />
      </div>
    )
  }

  if (weeks.length === 0) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Revenue Heatmap</h3>
        <p className="text-sm text-gray-500 text-center py-6">No data in this period.</p>
      </div>
    )
  }

  const cellSize = isDense ? 'w-2.5 h-2.5' : 'w-4 h-4'
  const gap = isDense ? 'gap-[3px]' : 'gap-1'

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
      <div className="flex items-center justify-between mb-4 gap-3">
        <div>
          <h3 className="text-lg font-semibold text-gray-900">Revenue Heatmap</h3>
          <p className="text-xs text-gray-500 mt-0.5">Darker = higher daily net revenue</p>
        </div>
        <div className="flex items-center gap-1.5 text-[11px] text-gray-500">
          <span>Less</span>
          <span className="w-3 h-3 rounded-sm bg-gray-100" />
          <span className="w-3 h-3 rounded-sm bg-emerald-200" />
          <span className="w-3 h-3 rounded-sm bg-emerald-300" />
          <span className="w-3 h-3 rounded-sm bg-emerald-400" />
          <span className="w-3 h-3 rounded-sm bg-emerald-500" />
          <span className="w-3 h-3 rounded-sm bg-emerald-600" />
          <span>More</span>
        </div>
      </div>

      <div className="overflow-x-auto">
        <div className="inline-flex gap-2">
          {/* Weekday labels */}
          <div className={`flex flex-col ${gap} pt-4`}>
            {WEEKDAY_LABELS.map((label, i) => (
              <div
                key={label}
                className={`${cellSize} flex items-center text-[10px] text-gray-400 leading-none`}
              >
                {i % 2 === 1 ? label : ''}
              </div>
            ))}
          </div>

          {/* Week columns */}
          <div className={`flex ${gap}`}>
            {weeks.map((week, wIdx) => {
              // Show a month label above the first column of each month
              const firstInRange = week.days.find(d => d.inRange)?.date || week.monday
              const prevWeekFirstInRange =
                wIdx > 0
                  ? weeks[wIdx - 1].days.find(d => d.inRange)?.date || weeks[wIdx - 1].monday
                  : null
              const showMonth =
                wIdx === 0 || !isSameMonth(firstInRange, prevWeekFirstInRange as Date)

              return (
                <div key={week.monday.toISOString()} className={`flex flex-col ${gap}`}>
                  <div className="h-3 text-[10px] text-gray-400 leading-none">
                    {showMonth ? format(firstInRange, 'MMM') : ''}
                  </div>
                  {week.days.map(({ date, entry, inRange }) => {
                    if (!inRange) {
                      return <div key={date.toISOString()} className={`${cellSize}`} />
                    }
                    const net = entry?.netRevenue ?? 0
                    const bookings = entry?.bookingsCount ?? 0
                    const title = `${format(date, 'EEE, MMM d, yyyy')} — ${formatCurrency(net)}${
                      bookings ? ` · ${bookings} booking${bookings > 1 ? 's' : ''}` : ''
                    }`
                    return (
                      <div
                        key={date.toISOString()}
                        className={`${cellSize} rounded-[3px] ${shadeFor(net, maxNet)}`}
                        title={title}
                        aria-label={title}
                      />
                    )
                  })}
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}
