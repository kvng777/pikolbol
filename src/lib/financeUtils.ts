import { Booking } from '@/types/booking'
import { format, startOfMonth, endOfMonth, subMonths, startOfYear, endOfYear, parseISO, isWithinInterval, getDay, eachDayOfInterval, startOfWeek } from 'date-fns'
import {
  EVENING_START_HOUR,
  LATE_NIGHT_START_HOUR,
  PADDLE_PRICE,
  BALL_SET_PRICE,
  TRAINING_BALLS_PRICE,
  isEquipmentChargeable,
} from './paymentConfig'

// ============================================================================
// Types
// ============================================================================

export interface MonthlyRevenue {
  month: string // e.g., "Apr 2025"
  year: number
  monthNumber: number
  grossRevenue: number
  refunds: number
  cancellationFees: number
  netRevenue: number
  /** Confirmed + cancelled groups in the month (i.e. every group that contributes to Net). */
  bookingsCount: number
  /** Cancelled groups only, shown as a separate column in the revenue table. */
  cancelledCount: number
}

export interface TimeBreakdown {
  daytimeRevenue: number
  eveningRevenue: number
  lateNightRevenue: number
  daytimeBookings: number
  eveningBookings: number
  lateNightBookings: number
}

export interface BookingStatistics {
  totalBookings: number
  cancelledBookings: number
  cancellationRate: number
  averageBookingValue: number
  averagePlayersPerBooking: number
  peakHours: { slot: string; count: number }[]
  busiestDay: { day: string; count: number; revenue: number }
  utilizationRate: number
}

export interface DailyRevenue {
  date: string          // 'YYYY-MM-DD'
  label: string         // 'Mon 27' for chart X-axis
  grossRevenue: number  // confirmed
  cancellationFees: number
  netRevenue: number
  bookingsCount: number // confirmed + cancelled groups on that day
}

export interface EquipmentBreakdown {
  /** Total paddles rented across all confirmed bookings in the period. */
  paddlesRented: number
  /** Number of bookings (groups) that included a set of 4 balls. */
  ballSetRentals: number
  /** Number of bookings (groups) that included training balls (50) w/ basket. */
  trainingBallsRentals: number
  /** Total confirmed bookings (groups) that had any equipment attached. */
  bookingsWithEquipment: number
  /** Revenue attributable to paddles (post-promo bookings only). */
  paddleRevenue: number
  /** Revenue attributable to ball-set rentals (post-promo bookings only). */
  ballSetRevenue: number
  /** Revenue attributable to training-balls rentals (post-promo bookings only). */
  trainingBallsRevenue: number
  /** Sum of the three revenue lines above. */
  totalEquipmentRevenue: number
}

export type PeriodType = 'thisMonth' | 'lastMonth' | 'thisYear' | 'allTime' | 'custom'

export interface DateRange {
  start: Date
  end: Date
}

// ============================================================================
// Period Helpers
// ============================================================================

export function getDateRangeForPeriod(period: PeriodType, customRange?: DateRange): DateRange {
  const now = new Date()
  
  switch (period) {
    case 'thisMonth':
      return {
        start: startOfMonth(now),
        end: endOfMonth(now),
      }
    case 'lastMonth':
      const lastMonth = subMonths(now, 1)
      return {
        start: startOfMonth(lastMonth),
        end: endOfMonth(lastMonth),
      }
    case 'thisYear':
      return {
        start: startOfYear(now),
        end: endOfYear(now),
      }
    case 'allTime':
      return {
        start: new Date(2020, 0, 1), // Far enough back
        end: new Date(2100, 11, 31), // Far enough forward
      }
    case 'custom':
      return customRange || { start: startOfMonth(now), end: endOfMonth(now) }
    default:
      return {
        start: startOfMonth(now),
        end: endOfMonth(now),
      }
  }
}

export function filterBookingsByDateRange(bookings: Booking[], range: DateRange): Booking[] {
  return bookings.filter(booking => {
    const bookingDate = parseISO(booking.date)
    return isWithinInterval(bookingDate, { start: range.start, end: range.end })
  })
}

// ============================================================================
// Revenue Calculations
// ============================================================================

/**
 * Get confirmed bookings (actual revenue)
 */
export function getConfirmedBookings(bookings: Booking[]): Booking[] {
  return bookings.filter(b => b.payment_status === 'confirmed')
}

/**
 * Get cancelled bookings
 */
export function getCancelledBookings(bookings: Booking[]): Booking[] {
  return bookings.filter(b => b.payment_status === 'cancelled')
}

/**
 * Calculate total gross revenue from confirmed bookings
 * Groups by booking_group_id to avoid double-counting multi-slot bookings
 */
export function calculateGrossRevenue(bookings: Booking[]): number {
  const confirmed = getConfirmedBookings(bookings)
  const seen = new Set<string>()
  let total = 0
  
  for (const booking of confirmed) {
    const key = booking.booking_group_id || booking.id
    if (!seen.has(key)) {
      seen.add(key)
      total += booking.payment_amount || 0
    }
  }
  
  return total
}

/**
 * Calculate total refunds processed
 */
export function calculateTotalRefunds(bookings: Booking[]): number {
  const cancelled = getCancelledBookings(bookings)
  const seen = new Set<string>()
  let total = 0
  
  for (const booking of cancelled) {
    if (booking.refund_status === 'completed') {
      const key = booking.booking_group_id || booking.id
      if (!seen.has(key)) {
        seen.add(key)
        total += booking.refund_amount || 0
      }
    }
  }
  
  return total
}

/**
 * Calculate total cancellation fees retained
 */
export function calculateCancellationFees(bookings: Booking[]): number {
  const cancelled = getCancelledBookings(bookings)
  const seen = new Set<string>()
  let total = 0
  
  for (const booking of cancelled) {
    const key = booking.booking_group_id || booking.id
    if (!seen.has(key)) {
      seen.add(key)
      total += booking.cancellation_fee || 0
    }
  }
  
  return total
}

/**
 * Calculate net revenue
 * Net = Gross Revenue + Cancellation Fees Retained
 * 
 * Rationale: Gross only counts confirmed bookings, so a cancelled booking's
 * original payment is never in gross. Retained cancellation fees are real
 * income that must be added. Refunds are informational (displayed separately)
 * but not subtracted, as that would double-penalize.
 */
export function calculateNetRevenue(bookings: Booking[]): number {
  const gross = calculateGrossRevenue(bookings)
  const cancellationFees = calculateCancellationFees(bookings)
  return gross + cancellationFees
}

// ============================================================================
// Time-based Revenue Breakdown
// ============================================================================

/**
 * Parse hour from time slot string (e.g., "06:00-07:00" -> 6)
 */
function parseSlotHour(timeSlot: string): number {
  const match = timeSlot.match(/^(\d{1,2}):/)
  return match ? parseInt(match[1], 10) : 0
}

/**
 * Check if a time slot is evening (6 PM - 10 PM). Excludes late-night.
 */
export function isEveningSlot(timeSlot: string): boolean {
  const hour = parseSlotHour(timeSlot)
  return hour >= EVENING_START_HOUR && hour < LATE_NIGHT_START_HOUR
}

/**
 * Check if a time slot is late-night (10 PM - 12 AM).
 */
export function isLateNightSlot(timeSlot: string): boolean {
  return parseSlotHour(timeSlot) >= LATE_NIGHT_START_HOUR
}

/**
 * Calculate revenue breakdown by time of day. A booking group is classified
 * by its latest tier: any late-night slot → latenight; else any evening slot → evening; else daytime.
 */
export function calculateTimeBreakdown(bookings: Booking[]): TimeBreakdown {
  const confirmed = getConfirmedBookings(bookings)
  const cancelled = getCancelledBookings(bookings)

  let daytimeRevenue = 0
  let eveningRevenue = 0
  let lateNightRevenue = 0
  let daytimeBookings = 0
  let eveningBookings = 0
  let lateNightBookings = 0

  const groupBy = (list: Booking[]) => {
    const groups = new Map<string, Booking[]>()
    for (const b of list) {
      const key = b.booking_group_id || b.id
      if (!groups.has(key)) groups.set(key, [])
      groups.get(key)!.push(b)
    }
    return groups
  }

  const classify = (rows: Booking[]) => {
    if (rows.some(b => isLateNightSlot(b.time_slot))) return 'latenight'
    if (rows.some(b => isEveningSlot(b.time_slot))) return 'evening'
    return 'daytime'
  }

  // Confirmed groups → full payment_amount + increment booking count
  for (const [, groupBookings] of groupBy(confirmed)) {
    const amount = groupBookings[0].payment_amount || 0
    const tier = classify(groupBookings)
    if (tier === 'latenight') { lateNightRevenue += amount; lateNightBookings++ }
    else if (tier === 'evening') { eveningRevenue += amount; eveningBookings++ }
    else { daytimeRevenue += amount; daytimeBookings++ }
  }

  // Cancelled groups → retained cancellation_fee only; DO NOT increment booking count
  // (those counters mean "played bookings"). Ensures the doughnut totals reconcile with Net Revenue.
  for (const [, groupBookings] of groupBy(cancelled)) {
    const fee = groupBookings[0].cancellation_fee || 0
    if (fee <= 0) continue
    const tier = classify(groupBookings)
    if (tier === 'latenight') lateNightRevenue += fee
    else if (tier === 'evening') eveningRevenue += fee
    else daytimeRevenue += fee
  }

  return {
    daytimeRevenue,
    eveningRevenue,
    lateNightRevenue,
    daytimeBookings,
    eveningBookings,
    lateNightBookings,
  }
}

// ============================================================================
// Monthly Breakdown
// ============================================================================

/**
 * Group bookings by month and calculate monthly revenue
 */
export function calculateMonthlyRevenue(bookings: Booking[]): MonthlyRevenue[] {
  const monthlyMap = new Map<string, Booking[]>()
  
  // Group all bookings by month
  for (const booking of bookings) {
    const date = parseISO(booking.date)
    const monthKey = format(date, 'yyyy-MM')
    
    if (!monthlyMap.has(monthKey)) {
      monthlyMap.set(monthKey, [])
    }
    monthlyMap.get(monthKey)!.push(booking)
  }
  
  // Calculate revenue for each month
  const monthly: MonthlyRevenue[] = []
  
  for (const [monthKey, monthBookings] of monthlyMap) {
    const date = parseISO(monthKey + '-01')

    // Count unique groups: confirmed + cancelled (i.e. every group that shows up in Net)
    const confirmedGroups = new Set<string>()
    const cancelledGroups = new Set<string>()
    for (const b of monthBookings) {
      const key = b.booking_group_id || b.id
      if (b.payment_status === 'confirmed') confirmedGroups.add(key)
      else if (b.payment_status === 'cancelled') cancelledGroups.add(key)
    }

    monthly.push({
      month: format(date, 'MMM yyyy'),
      year: date.getFullYear(),
      monthNumber: date.getMonth(),
      grossRevenue: calculateGrossRevenue(monthBookings),
      refunds: calculateTotalRefunds(monthBookings),
      cancellationFees: calculateCancellationFees(monthBookings),
      netRevenue: calculateNetRevenue(monthBookings),
      bookingsCount: confirmedGroups.size + cancelledGroups.size,
      cancelledCount: cancelledGroups.size,
    })
  }
  
  // Sort by date descending (most recent first)
  return monthly.sort((a, b) => {
    if (a.year !== b.year) return b.year - a.year
    return b.monthNumber - a.monthNumber
  })
}

// ============================================================================
// Booking Statistics
// ============================================================================

const DAYS_OF_WEEK = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const TOTAL_SLOTS_PER_DAY = 15 // 6 AM to 9 PM = 15 slots

/**
 * Get popular time slots (most booked)
 */
export function getPopularTimeSlots(bookings: Booking[], limit: number = 5): { slot: string; count: number }[] {
  const confirmed = getConfirmedBookings(bookings)
  const slotCounts = new Map<string, number>()
  
  for (const booking of confirmed) {
    const count = slotCounts.get(booking.time_slot) || 0
    slotCounts.set(booking.time_slot, count + 1)
  }
  
  return Array.from(slotCounts.entries())
    .map(([slot, count]) => ({ slot, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, limit)
}

/**
 * Get busiest day of week
 */
export function getBusiestDay(bookings: Booking[]): { day: string; count: number; revenue: number } {
  const confirmed = getConfirmedBookings(bookings)
  const cancelled = getCancelledBookings(bookings)
  const dayStats = new Map<number, { count: number; revenue: number; seen: Set<string> }>()

  // Initialize all days
  for (let i = 0; i < 7; i++) {
    dayStats.set(i, { count: 0, revenue: 0, seen: new Set() })
  }

  for (const booking of confirmed) {
    const date = parseISO(booking.date)
    const dayOfWeek = getDay(date)
    const stats = dayStats.get(dayOfWeek)!
    const key = booking.booking_group_id || booking.id

    if (!stats.seen.has(key)) {
      stats.seen.add(key)
      stats.count++
      stats.revenue += booking.payment_amount || 0
    }
  }

  // Cancelled groups contribute their retained cancellation_fee to the same day.
  for (const booking of cancelled) {
    const date = parseISO(booking.date)
    const dayOfWeek = getDay(date)
    const stats = dayStats.get(dayOfWeek)!
    const key = booking.booking_group_id || booking.id

    if (!stats.seen.has(key)) {
      stats.seen.add(key)
      stats.count++
      stats.revenue += booking.cancellation_fee || 0
    }
  }
  
  // Find busiest day
  let busiestDay = 0
  let maxCount = 0
  
  for (const [day, stats] of dayStats) {
    if (stats.count > maxCount) {
      maxCount = stats.count
      busiestDay = day
    }
  }
  
  const stats = dayStats.get(busiestDay)!
  return {
    day: DAYS_OF_WEEK[busiestDay],
    count: stats.count,
    revenue: stats.revenue,
  }
}

/**
 * Calculate utilization rate
 * = (booked slots / total available slots) * 100
 */
export function calculateUtilizationRate(bookings: Booking[], dateRange: DateRange): number {
  const confirmed = getConfirmedBookings(bookings)
  const filteredBookings = filterBookingsByDateRange(confirmed, dateRange)
  
  // Count unique dates in the range that have bookings
  const datesWithBookings = new Set<string>()
  let totalBookedSlots = 0
  
  for (const booking of filteredBookings) {
    datesWithBookings.add(booking.date)
    totalBookedSlots++
  }
  
  // Calculate days in range
  const daysDiff = Math.ceil((dateRange.end.getTime() - dateRange.start.getTime()) / (1000 * 60 * 60 * 24)) + 1
  const totalAvailableSlots = daysDiff * TOTAL_SLOTS_PER_DAY
  
  if (totalAvailableSlots === 0) return 0
  
  return (totalBookedSlots / totalAvailableSlots) * 100
}

/**
 * Calculate all booking statistics
 */
export function calculateBookingStatistics(bookings: Booking[], dateRange: DateRange): BookingStatistics {
  const confirmed = getConfirmedBookings(bookings)
  const cancelled = getCancelledBookings(bookings)
  
  // Count unique booking groups
  const confirmedGroups = new Set<string>()
  const cancelledGroups = new Set<string>()
  let totalPlayers = 0
  
  for (const b of confirmed) {
    const key = b.booking_group_id || b.id
    if (!confirmedGroups.has(key)) {
      confirmedGroups.add(key)
      totalPlayers += b.players || 2
    }
  }
  
  for (const b of cancelled) {
    const key = b.booking_group_id || b.id
    cancelledGroups.add(key)
  }
  
  const confirmedCount = confirmedGroups.size
  const cancelledBookings = cancelledGroups.size
  // totalBookings represents every group that contributes to Net Revenue
  const totalBookings = confirmedCount + cancelledBookings

  const netRevenue = calculateNetRevenue(bookings)

  return {
    totalBookings,
    cancelledBookings,
    cancellationRate: totalBookings > 0 ? (cancelledBookings / totalBookings) * 100 : 0,
    averageBookingValue: totalBookings > 0 ? netRevenue / totalBookings : 0,
    averagePlayersPerBooking: confirmedCount > 0 ? totalPlayers / confirmedCount : 0,
    peakHours: getPopularTimeSlots(bookings, 3),
    busiestDay: getBusiestDay(bookings),
    utilizationRate: calculateUtilizationRate(bookings, dateRange),
  }
}

// ============================================================================
// CSV Export
// ============================================================================

/**
 * Export monthly revenue data to CSV
 */
export function exportToCSV(data: MonthlyRevenue[], filename: string = 'finance-report'): void {
  const headers = ['Month', 'Bookings', 'Cancelled', 'Gross Revenue', 'Refunds', 'Cancellation Fees', 'Net Revenue']

  const rows = data.map(row => [
    row.month,
    row.bookingsCount,
    row.cancelledCount,
    row.grossRevenue,
    row.refunds,
    row.cancellationFees,
    row.netRevenue,
  ])

  // Add totals row
  const totals = data.reduce(
    (acc, row) => ({
      grossRevenue: acc.grossRevenue + row.grossRevenue,
      refunds: acc.refunds + row.refunds,
      cancellationFees: acc.cancellationFees + row.cancellationFees,
      netRevenue: acc.netRevenue + row.netRevenue,
      bookingsCount: acc.bookingsCount + row.bookingsCount,
      cancelledCount: acc.cancelledCount + row.cancelledCount,
    }),
    { grossRevenue: 0, refunds: 0, cancellationFees: 0, netRevenue: 0, bookingsCount: 0, cancelledCount: 0 }
  )

  rows.push([
    'TOTAL',
    totals.bookingsCount,
    totals.cancelledCount,
    totals.grossRevenue,
    totals.refunds,
    totals.cancellationFees,
    totals.netRevenue,
  ])
  
  // Build CSV content
  const csvContent = [
    headers.join(','),
    ...rows.map(row => row.join(',')),
  ].join('\n')
  
  // Create and trigger download
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `${filename}-${format(new Date(), 'yyyy-MM-dd')}.csv`
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

/**
 * Bucket revenue by play date across the given range. Days without activity
 * still appear as zero rows so the chart X-axis is dense.
 * Follows the same dedup-by-group_id rule as calculateGrossRevenue /
 * calculateCancellationFees, so per-day net reconciles with the monthly view.
 */
export function calculateDailyRevenue(bookings: Booking[], range: DateRange): DailyRevenue[] {
  if (range.end < range.start) return []

  // Group bookings by ISO date
  const byDate = new Map<string, Booking[]>()
  for (const b of bookings) {
    if (!byDate.has(b.date)) byDate.set(b.date, [])
    byDate.get(b.date)!.push(b)
  }

  const days = eachDayOfInterval({ start: range.start, end: range.end })
  const result: DailyRevenue[] = []

  for (const day of days) {
    const key = format(day, 'yyyy-MM-dd')
    const rows = byDate.get(key) || []

    const gross = calculateGrossRevenue(rows)
    const fees = calculateCancellationFees(rows)

    // Count unique groups for confirmed + cancelled
    const groups = new Set<string>()
    for (const b of rows) {
      if (b.payment_status === 'confirmed' || b.payment_status === 'cancelled') {
        groups.add(b.booking_group_id || b.id)
      }
    }

    result.push({
      date: key,
      label: format(day, 'EEE d'),
      grossRevenue: gross,
      cancellationFees: fees,
      netRevenue: gross + fees,
      bookingsCount: groups.size,
    })
  }

  return result
}

/**
 * Weekly rollup of `DailyRevenue` (Monday-week). Used when the daily series
 * would render as an unreadable comb (typically > ~90 days).
 */
export function rollupDailyToWeekly(daily: DailyRevenue[]): DailyRevenue[] {
  const byWeek = new Map<string, DailyRevenue>()
  for (const d of daily) {
    const monday = startOfWeek(parseISO(d.date), { weekStartsOn: 1 })
    const key = format(monday, 'yyyy-MM-dd')
    const existing = byWeek.get(key)
    if (existing) {
      existing.grossRevenue += d.grossRevenue
      existing.cancellationFees += d.cancellationFees
      existing.netRevenue += d.netRevenue
      existing.bookingsCount += d.bookingsCount
    } else {
      byWeek.set(key, {
        date: key,
        label: `Wk of ${format(monday, 'MMM d')}`,
        grossRevenue: d.grossRevenue,
        cancellationFees: d.cancellationFees,
        netRevenue: d.netRevenue,
        bookingsCount: d.bookingsCount,
      })
    }
  }
  return [...byWeek.values()].sort((a, b) => a.date.localeCompare(b.date))
}

/**
 * Aggregate equipment rentals + revenue over confirmed bookings, deduplicated
 * by booking_group_id so a multi-slot order counts once. Revenue applies only
 * to play dates on/after the promo end (see isEquipmentChargeable).
 */
export function calculateEquipmentBreakdown(bookings: Booking[]): EquipmentBreakdown {
  const confirmed = getConfirmedBookings(bookings)
  const seen = new Set<string>()

  let paddlesRented = 0
  let ballSetRentals = 0
  let trainingBallsRentals = 0
  let bookingsWithEquipment = 0
  let paddleRevenue = 0
  let ballSetRevenue = 0
  let trainingBallsRevenue = 0

  for (const b of confirmed) {
    const key = b.booking_group_id || `legacy-${b.id}`
    if (seen.has(key)) continue
    seen.add(key)

    const paddles = b.paddles_count ?? 0
    const hasBalls = !!b.needs_balls
    const hasTraining = !!b.training_balls
    const hasAny = paddles > 0 || hasBalls || hasTraining
    if (!hasAny) continue

    bookingsWithEquipment += 1
    paddlesRented += paddles
    if (hasBalls) ballSetRentals += 1
    if (hasTraining) trainingBallsRentals += 1

    if (isEquipmentChargeable(b.date)) {
      paddleRevenue += paddles * PADDLE_PRICE
      if (hasBalls) ballSetRevenue += BALL_SET_PRICE
      if (hasTraining) trainingBallsRevenue += TRAINING_BALLS_PRICE
    }
  }

  return {
    paddlesRented,
    ballSetRentals,
    trainingBallsRentals,
    bookingsWithEquipment,
    paddleRevenue,
    ballSetRevenue,
    trainingBallsRevenue,
    totalEquipmentRevenue: paddleRevenue + ballSetRevenue + trainingBallsRevenue,
  }
}

/**
 * Format currency for display
 */
export function formatCurrency(amount: number): string {
  return `P${amount.toLocaleString()}`
}

/**
 * Format percentage for display
 */
export function formatPercentage(value: number): string {
  return `${value.toFixed(1)}%`
}
