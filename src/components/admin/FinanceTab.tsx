'use client'

import { useState } from 'react'
import { format } from 'date-fns'
import { CalendarDays } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useFinanceData } from '@/hooks/useFinanceData'
import { PeriodType } from '@/lib/financeUtils'
import { FinanceSummaryCards } from './FinanceSummaryCards'
import { FinanceRevenueTable } from './FinanceRevenueTable'
import { FinanceCharts } from './FinanceCharts'
import { FinanceStatistics } from './FinanceStatistics'

const PERIOD_OPTIONS: { value: PeriodType; label: string }[] = [
  { value: 'thisMonth', label: 'This Month' },
  { value: 'lastMonth', label: 'Last Month' },
  { value: 'thisYear', label: 'This Year' },
  { value: 'allTime', label: 'All Time' },
  { value: 'custom', label: 'Custom' },
]

export function FinanceTab() {
  const {
    isLoading,
    period,
    setPeriod,
    customRange,
    setCustomRange,
    dateRange,
    summary,
    timeBreakdown,
    monthlyRevenue,
    statistics,
    allTimeMonthlyRevenue,
  } = useFinanceData()

  const [showCustomDatePicker, setShowCustomDatePicker] = useState(false)

  const handlePeriodChange = (newPeriod: PeriodType) => {
    setPeriod(newPeriod)
    if (newPeriod === 'custom') {
      setShowCustomDatePicker(true)
    } else {
      setShowCustomDatePicker(false)
    }
  }

  const handleCustomDateChange = (type: 'start' | 'end', value: string) => {
    const date = new Date(value)
    if (type === 'start') {
      setCustomRange(prev => ({ ...prev, start: date }))
    } else {
      setCustomRange(prev => ({ ...prev, end: date }))
    }
  }

  // Show period description
  const getPeriodDescription = () => {
    if (period === 'custom') {
      return `${format(dateRange.start, 'MMM d, yyyy')} - ${format(dateRange.end, 'MMM d, yyyy')}`
    }
    return PERIOD_OPTIONS.find(p => p.value === period)?.label || ''
  }

  return (
    <div className="space-y-6">
      {/* Period Selector */}
      <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center gap-2">
            <CalendarDays className="w-5 h-5 text-gray-400" />
            <span className="text-sm font-medium text-gray-700">Period:</span>
            <span className="text-sm text-gray-500">{getPeriodDescription()}</span>
          </div>
          
          <div className="flex flex-wrap gap-2">
            {PERIOD_OPTIONS.map(option => (
              <Button
                key={option.value}
                size="sm"
                variant={period === option.value ? 'default' : 'outline'}
                onClick={() => handlePeriodChange(option.value)}
                className={period === option.value ? 'bg-emerald-500 hover:bg-emerald-600' : ''}
              >
                {option.label}
              </Button>
            ))}
          </div>
        </div>

        {/* Custom Date Range Picker */}
        {showCustomDatePicker && (
          <div className="mt-4 pt-4 border-t border-gray-100">
            <div className="flex flex-col sm:flex-row gap-4">
              <div className="flex-1">
                <label className="text-sm font-medium text-gray-700 mb-1 block">Start Date</label>
                <input
                  type="date"
                  value={format(customRange.start, 'yyyy-MM-dd')}
                  onChange={(e) => handleCustomDateChange('start', e.target.value)}
                  className="w-full bg-gray-50 border border-gray-200 rounded-lg px-4 py-2 text-gray-900 text-sm"
                />
              </div>
              <div className="flex-1">
                <label className="text-sm font-medium text-gray-700 mb-1 block">End Date</label>
                <input
                  type="date"
                  value={format(customRange.end, 'yyyy-MM-dd')}
                  onChange={(e) => handleCustomDateChange('end', e.target.value)}
                  className="w-full bg-gray-50 border border-gray-200 rounded-lg px-4 py-2 text-gray-900 text-sm"
                />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Summary Cards */}
      <FinanceSummaryCards summary={summary} isLoading={isLoading} />

      {/* Charts Section */}
      <FinanceCharts
        monthlyRevenue={period === 'allTime' ? allTimeMonthlyRevenue : monthlyRevenue}
        timeBreakdown={timeBreakdown}
        isLoading={isLoading}
      />

      {/* Statistics */}
      <FinanceStatistics statistics={statistics} isLoading={isLoading} />

      {/* Revenue Table */}
      <FinanceRevenueTable
        data={period === 'allTime' ? allTimeMonthlyRevenue : monthlyRevenue}
        isLoading={isLoading}
      />
    </div>
  )
}
