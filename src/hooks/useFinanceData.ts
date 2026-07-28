'use client'

import { useMemo, useState } from 'react'
import { useAllBookings } from '@/hooks/useBookings'
import {
  PeriodType,
  DateRange,
  MonthlyRevenue,
  TimeBreakdown,
  BookingStatistics,
  DailyRevenue,
  EquipmentBreakdown,
  getDateRangeForPeriod,
  filterBookingsByDateRange,
  calculateGrossRevenue,
  calculateTotalRefunds,
  calculateCancellationFees,
  calculateNetRevenue,
  calculateTimeBreakdown,
  calculateMonthlyRevenue,
  calculateBookingStatistics,
  calculateDailyRevenue,
  calculateEquipmentBreakdown,
} from '@/lib/financeUtils'

export interface FinanceSummary {
  grossRevenue: number
  totalRefunds: number
  cancellationFees: number
  netRevenue: number
  thisMonthRevenue: number
  lastMonthRevenue: number
  revenueGrowth: number
}

export function useFinanceData() {
  const { data: allBookings = [], isLoading, refetch } = useAllBookings()
  
  // Period selection state
  const [period, setPeriod] = useState<PeriodType>('allTime')
  const [customRange, setCustomRange] = useState<DateRange>({
    start: new Date(),
    end: new Date(),
  })

  // Get date range for selected period
  const dateRange = useMemo(() => {
    return getDateRangeForPeriod(period, customRange)
  }, [period, customRange])

  // Filter bookings by selected date range
  const filteredBookings = useMemo(() => {
    return filterBookingsByDateRange(allBookings, dateRange)
  }, [allBookings, dateRange])

  // Calculate summary statistics
  const summary: FinanceSummary = useMemo(() => {
    const thisMonthRange = getDateRangeForPeriod('thisMonth')
    const lastMonthRange = getDateRangeForPeriod('lastMonth')
    
    const thisMonthBookings = filterBookingsByDateRange(allBookings, thisMonthRange)
    const lastMonthBookings = filterBookingsByDateRange(allBookings, lastMonthRange)
    
    const thisMonthRevenue = calculateNetRevenue(thisMonthBookings)
    const lastMonthRevenue = calculateNetRevenue(lastMonthBookings)
    
    const revenueGrowth = lastMonthRevenue > 0 
      ? ((thisMonthRevenue - lastMonthRevenue) / lastMonthRevenue) * 100 
      : thisMonthRevenue > 0 ? 100 : 0

    return {
      grossRevenue: calculateGrossRevenue(filteredBookings),
      totalRefunds: calculateTotalRefunds(filteredBookings),
      cancellationFees: calculateCancellationFees(filteredBookings),
      netRevenue: calculateNetRevenue(filteredBookings),
      thisMonthRevenue,
      lastMonthRevenue,
      revenueGrowth,
    }
  }, [allBookings, filteredBookings])

  // Calculate time breakdown (daytime vs evening)
  const timeBreakdown: TimeBreakdown = useMemo(() => {
    return calculateTimeBreakdown(filteredBookings)
  }, [filteredBookings])

  // Calculate monthly revenue data (for table and charts)
  const monthlyRevenue: MonthlyRevenue[] = useMemo(() => {
    return calculateMonthlyRevenue(filteredBookings)
  }, [filteredBookings])

  // Calculate booking statistics
  const statistics: BookingStatistics = useMemo(() => {
    return calculateBookingStatistics(filteredBookings, dateRange)
  }, [filteredBookings, dateRange])

  // Equipment rental breakdown
  const equipment: EquipmentBreakdown = useMemo(() => {
    return calculateEquipmentBreakdown(filteredBookings)
  }, [filteredBookings])

  // Daily revenue (clamped to actual data span when the period is 'allTime',
  // otherwise the 2020→2100 dummy range from getDateRangeForPeriod would produce
  // an absurd number of days).
  const effectiveDailyRange = useMemo(() => {
    if (period !== 'allTime') return dateRange
    if (allBookings.length === 0) return dateRange
    const dates = allBookings.map(b => b.date).sort()
    return { start: new Date(dates[0] + 'T00:00:00'), end: new Date() }
  }, [period, dateRange, allBookings])

  const dailyRevenue: DailyRevenue[] = useMemo(() => {
    return calculateDailyRevenue(filteredBookings, effectiveDailyRange)
  }, [filteredBookings, effectiveDailyRange])

  // All-time monthly revenue for charts
  const allTimeMonthlyRevenue: MonthlyRevenue[] = useMemo(() => {
    return calculateMonthlyRevenue(allBookings)
  }, [allBookings])

  return {
    // Data
    allBookings,
    filteredBookings,
    isLoading,
    refetch,
    // Period selection
    period,
    setPeriod,
    customRange,
    setCustomRange,
    dateRange,
    // Calculated data
    summary,
    timeBreakdown,
    monthlyRevenue,
    statistics,
    equipment,
    dailyRevenue,
    allTimeMonthlyRevenue,
  }
}
