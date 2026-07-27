'use client'

import { format } from 'date-fns'
import { CalendarDays, Activity, ArrowRight, Gauge } from 'lucide-react'
import { useAllBookings, useDisabledSlotsByDate } from '@/hooks/useBookings'
import { generateTimeSlots } from '@/lib/timeSlotGenerator'
import type { Booking, ClosedDate } from '@/types/booking'

interface Props {
  closedDates: ClosedDate[]
}

function isDateInClosedRange(dateStr: string, closed: ClosedDate[]) {
  return closed.some(cd => dateStr >= cd.start_date && dateStr <= cd.end_date)
}

function startHourOf(slot: string): number {
  const h = parseInt((slot || '').slice(0, 2), 10)
  return Number.isNaN(h) ? -1 : h
}

function endHourOf(slot: string): number {
  const parts = (slot || '').split('-')
  const h = parseInt((parts[1] || '').slice(0, 2), 10)
  return Number.isNaN(h) ? -1 : h
}

export default function TodaySummary({ closedDates }: Props) {
  const { data: allBookings = [] } = useAllBookings()

  const now = new Date()
  const todayStr = format(now, 'yyyy-MM-dd')
  const currentHour = now.getHours()

  const { data: disabledToday = [] } = useDisabledSlotsByDate(todayStr)

  const isClosedToday = isDateInClosedRange(todayStr, closedDates)

  const computed = (() => {
    const todayBookings = allBookings.filter(
      (b: Booking) => b.date === todayStr &&
        (b.payment_status === 'confirmed' || b.payment_status === 'pending')
    )

    const groups = new Set<string>()
    const bookedSlots = new Set<string>()
    const confirmedByStart = new Map<number, Booking>()
    // Group confirmed bookings by group id to compute durations
    const confirmedGroupSlots = new Map<string, string[]>()
    const confirmedGroupInfo = new Map<string, Booking>()

    for (const b of todayBookings) {
      const key = b.booking_group_id || `legacy-${b.id}`
      groups.add(key)
      bookedSlots.add(b.time_slot)

      if (b.payment_status === 'confirmed') {
        confirmedByStart.set(startHourOf(b.time_slot), b)
        const arr = confirmedGroupSlots.get(key) ?? []
        arr.push(b.time_slot)
        confirmedGroupSlots.set(key, arr)
        if (!confirmedGroupInfo.has(key)) confirmedGroupInfo.set(key, b)
      }
    }

    // Court status
    let status: { state: 'occupied' | 'free' | 'idle' | 'closed'; label: string; sub?: string }
    if (isClosedToday) {
      status = { state: 'closed', label: 'Closed today', sub: 'Court unavailable' }
    } else {
      const current = confirmedByStart.get(currentHour)
      if (current) {
        // Extend "until" through any consecutive confirmed slots in the same group
        const key = current.booking_group_id || `legacy-${current.id}`
        const slots = (confirmedGroupSlots.get(key) ?? [current.time_slot])
          .slice()
          .sort()
        let endHour = endHourOf(current.time_slot)
        for (const s of slots) {
          const sh = startHourOf(s)
          if (sh >= currentHour) endHour = Math.max(endHour, endHourOf(s))
        }
        status = {
          state: 'occupied',
          label: `Occupied · until ${String(endHour).padStart(2, '0')}:00`,
          sub: current.name || undefined,
        }
      } else {
        const upcomingHours = [...confirmedByStart.keys()]
          .filter(h => h > currentHour)
          .sort((a, b) => a - b)
        if (upcomingHours.length > 0) {
          const nextHour = upcomingHours[0]
          status = {
            state: 'free',
            label: `Free · next ${String(nextHour).padStart(2, '0')}:00`,
          }
        } else {
          status = { state: 'idle', label: 'Idle · no more bookings' }
        }
      }
    }

    // Next booking (strictly after current hour)
    const upcomingHours = [...confirmedByStart.keys()]
      .filter(h => h > currentHour)
      .sort((a, b) => a - b)
    let next: { time: string; name: string; duration: number } | null = null
    if (upcomingHours.length > 0) {
      const h = upcomingHours[0]
      const b = confirmedByStart.get(h)!
      const key = b.booking_group_id || `legacy-${b.id}`
      const duration = (confirmedGroupSlots.get(key) ?? [b.time_slot]).length
      next = {
        time: `${String(h).padStart(2, '0')}:00`,
        name: b.name || 'Booked',
        duration,
      }
    }

    // Occupancy
    const disabledSet = new Set(disabledToday.map(d => d.time_slot))
    const total = Math.max(0, generateTimeSlots().length - disabledSet.size)
    const booked = [...bookedSlots].filter(s => !disabledSet.has(s)).length

    return {
      todayGroupCount: groups.size,
      courtStatus: status,
      nextBooking: next,
      occBooked: booked,
      occTotal: total,
    }
  })()
  const { todayGroupCount, courtStatus, nextBooking, occBooked, occTotal } = computed

  const statusTone =
    courtStatus.state === 'closed'
      ? 'text-red-700 bg-red-50 border-red-200'
      : courtStatus.state === 'occupied'
        ? 'text-amber-800 bg-amber-50 border-amber-200'
        : courtStatus.state === 'free'
          ? 'text-teal-700 bg-teal-50 border-teal-100'
          : 'text-gray-600 bg-gray-50 border-gray-200'

  const occPct = occTotal > 0 ? Math.round((occBooked / occTotal) * 100) : 0

  const tiles: Array<{
    key: string
    label: string
    value: string | number
    icon: React.ReactNode
    tone: string
    hint?: string
  }> = [
    {
      key: 'today',
      label: "Today's bookings",
      value: todayGroupCount,
      icon: <CalendarDays className="w-4 h-4" />,
      tone: 'text-emerald-700 bg-emerald-50 border-emerald-100',
      hint: format(now, 'EEE, MMM d'),
    },
    {
      key: 'status',
      label: 'Court status now',
      value: courtStatus.label,
      icon: <Activity className="w-4 h-4" />,
      tone: statusTone,
      hint: courtStatus.sub,
    },
    {
      key: 'next',
      label: 'Next booking',
      value: nextBooking ? nextBooking.time : '—',
      icon: <ArrowRight className="w-4 h-4" />,
      tone: 'text-indigo-700 bg-indigo-50 border-indigo-100',
      hint: nextBooking
        ? `${nextBooking.name} · ${nextBooking.duration}h`
        : 'Nothing scheduled',
    },
    {
      key: 'occ',
      label: "Today's occupancy",
      value: `${occBooked}/${occTotal}`,
      icon: <Gauge className="w-4 h-4" />,
      tone: 'text-violet-700 bg-violet-50 border-violet-100',
      hint: `${occPct}% booked`,
    },
  ]

  return (
    <div className="mb-6 grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-3">
      {tiles.map(t => (
        <div
          key={t.key}
          className={`rounded-xl border ${t.tone} px-4 py-3 shadow-sm`}
        >
          <div className="flex items-center justify-between text-xs font-medium opacity-80">
            <span>{t.label}</span>
            {t.icon}
          </div>
          <div className="mt-1 text-xs sm:text-xl font-bold tabular-nums truncate">{t.value}</div>
          {t.hint && <div className="mt-0.5 text-[11px] opacity-70 truncate">{t.hint}</div>}
        </div>
      ))}
    </div>
  )
}
