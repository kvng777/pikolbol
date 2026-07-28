'use client'

import { useMemo } from 'react'
import { Bar } from 'react-chartjs-2'
import { DailyRevenue, formatCurrency, rollupDailyToWeekly } from '@/lib/financeUtils'

interface FinanceDailyChartProps {
  daily: DailyRevenue[]
  isLoading?: boolean
}

const DAILY_MAX_BARS = 92 // ~3 months; beyond this we bucket weekly

export function FinanceDailyChart({ daily, isLoading }: FinanceDailyChartProps) {
  const { series, granularity } = useMemo(() => {
    if (daily.length > DAILY_MAX_BARS) {
      return { series: rollupDailyToWeekly(daily), granularity: 'weekly' as const }
    }
    return { series: daily, granularity: 'daily' as const }
  }, [daily])

  const chartData = useMemo(() => ({
    labels: series.map(d => d.label),
    datasets: [
      {
        label: 'Confirmed Revenue',
        data: series.map(d => d.grossRevenue),
        backgroundColor: 'rgba(16, 185, 129, 0.85)',
        borderColor: 'rgb(16, 185, 129)',
        borderWidth: 1,
        borderRadius: 4,
        stack: 'net',
      },
      {
        label: 'Fees Retained',
        data: series.map(d => d.cancellationFees),
        backgroundColor: 'rgba(245, 158, 11, 0.85)',
        borderColor: 'rgb(245, 158, 11)',
        borderWidth: 1,
        borderRadius: 4,
        stack: 'net',
      },
    ],
  }), [series])

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'bottom' as const,
        labels: { padding: 16, usePointStyle: true },
      },
      tooltip: {
        callbacks: {
          label: function (context: any) {
            return `${context.dataset.label}: ${formatCurrency(context.raw)}`
          },
          footer: function (items: any[]) {
            const total = items.reduce((sum, i) => sum + (i.raw || 0), 0)
            return `Net: ${formatCurrency(total)}`
          },
        },
      },
    },
    scales: {
      x: { stacked: true, ticks: { autoSkip: true, maxRotation: 0 } },
      y: {
        stacked: true,
        beginAtZero: true,
        ticks: { callback: (v: any) => formatCurrency(v) },
      },
    },
  }

  const totalNet = useMemo(
    () => series.reduce((sum, d) => sum + d.netRevenue, 0),
    [series]
  )
  const hasData = series.some(d => d.netRevenue > 0)

  if (isLoading) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm animate-pulse">
        <div className="h-6 bg-gray-200 rounded w-40 mb-4" />
        <div className="h-72 bg-gray-100 rounded" />
      </div>
    )
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
      <div className="flex items-start justify-between mb-4 gap-3">
        <div>
          <h3 className="text-lg font-semibold text-gray-900">
            {granularity === 'weekly' ? 'Weekly Revenue' : 'Daily Revenue'}
          </h3>
          <p className="text-xs text-gray-500 mt-0.5">
            {granularity === 'weekly'
              ? 'Bucketed by week — pick a shorter period to see day-by-day'
              : 'One bar per day in the selected period'}
          </p>
        </div>
        <div className="text-right shrink-0">
          <p className="text-xs text-gray-500">Total net</p>
          <p className="text-xl font-bold text-emerald-600 tabular-nums">
            {formatCurrency(totalNet)}
          </p>
        </div>
      </div>
      <div className="h-72">
        {hasData ? (
          <Bar data={chartData} options={options} />
        ) : (
          <div className="flex items-center justify-center h-full text-gray-400">
            No revenue in this period
          </div>
        )}
      </div>
    </div>
  )
}
