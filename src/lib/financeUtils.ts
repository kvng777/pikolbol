import { Booking } from '@/types/booking'
import { format, startOfMonth, endOfMonth, subMonths, startOfYear, endOfYear, parseISO, isWithinInterval, getDay } from 'date-fns'
import { EVENING_START_HOUR } from './paymentConfig'

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
  bookingsCount: number
}

export interface TimeBreakdown {
  daytimeRevenue: number
  eveningRevenue: number
  daytimeBookings: number
  eveningBookings: number
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
 * Net = Gross Revenue - Refunds (cancellation fees are already excluded from refunds)
 */
export function calculateNetRevenue(bookings: Booking[]): number {
  const gross = calculateGrossRevenue(bookings)
  const refunds = calculateTotalRefunds(bookings)
  return gross - refunds
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
 * Check if a time slot is evening (6 PM onwards)
 */
export function isEveningSlot(timeSlot: string): boolean {
  const hour = parseSlotHour(timeSlot)
  return hour >= EVENING_START_HOUR
}

/**
 * Calculate revenue breakdown by time of day
 */
export function calculateTimeBreakdown(bookings: Booking[]): TimeBreakdown {
  const confirmed = getConfirmedBookings(bookings)
  
  let daytimeRevenue = 0
  let eveningRevenue = 0
  let daytimeBookings = 0
  let eveningBookings = 0
  
  // Group by booking_group_id to get unique bookings
  const groups = new Map<string, Booking[]>()
  for (const booking of confirmed) {
    const key = booking.booking_group_id || booking.id
    if (!groups.has(key)) {
      groups.set(key, [])
    }
    groups.get(key)!.push(booking)
  }
  
  // For each group, check if any slot is evening
  for (const [, groupBookings] of groups) {
    const firstBooking = groupBookings[0]
    const amount = firstBooking.payment_amount || 0
    
    // Check if any slot in the group is evening
    const hasEveningSlot = groupBookings.some(b => isEveningSlot(b.time_slot))
    
    if (hasEveningSlot) {
      eveningRevenue += amount
      eveningBookings++
    } else {
      daytimeRevenue += amount
      daytimeBookings++
    }
  }
  
  return {
    daytimeRevenue,
    eveningRevenue,
    daytimeBookings,
    eveningBookings,
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
    
    // Count unique confirmed bookings
    const confirmedGroups = new Set<string>()
    for (const b of monthBookings) {
      if (b.payment_status === 'confirmed') {
        confirmedGroups.add(b.booking_group_id || b.id)
      }
    }
    
    monthly.push({
      month: format(date, 'MMM yyyy'),
      year: date.getFullYear(),
      monthNumber: date.getMonth(),
      grossRevenue: calculateGrossRevenue(monthBookings),
      refunds: calculateTotalRefunds(monthBookings),
      cancellationFees: calculateCancellationFees(monthBookings),
      netRevenue: calculateNetRevenue(monthBookings),
      bookingsCount: confirmedGroups.size,
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
  
  const totalBookings = confirmedGroups.size
  const cancelledBookings = cancelledGroups.size
  const totalAll = totalBookings + cancelledBookings
  
  const grossRevenue = calculateGrossRevenue(bookings)
  
  return {
    totalBookings,
    cancelledBookings,
    cancellationRate: totalAll > 0 ? (cancelledBookings / totalAll) * 100 : 0,
    averageBookingValue: totalBookings > 0 ? grossRevenue / totalBookings : 0,
    averagePlayersPerBooking: totalBookings > 0 ? totalPlayers / totalBookings : 0,
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
  const headers = ['Month', 'Gross Revenue', 'Refunds', 'Cancellation Fees', 'Net Revenue', 'Bookings']
  
  const rows = data.map(row => [
    row.month,
    row.grossRevenue,
    row.refunds,
    row.cancellationFees,
    row.netRevenue,
    row.bookingsCount,
  ])
  
  // Add totals row
  const totals = data.reduce(
    (acc, row) => ({
      grossRevenue: acc.grossRevenue + row.grossRevenue,
      refunds: acc.refunds + row.refunds,
      cancellationFees: acc.cancellationFees + row.cancellationFees,
      netRevenue: acc.netRevenue + row.netRevenue,
      bookingsCount: acc.bookingsCount + row.bookingsCount,
    }),
    { grossRevenue: 0, refunds: 0, cancellationFees: 0, netRevenue: 0, bookingsCount: 0 }
  )
  
  rows.push([
    'TOTAL',
    totals.grossRevenue,
    totals.refunds,
    totals.cancellationFees,
    totals.netRevenue,
    totals.bookingsCount,
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
