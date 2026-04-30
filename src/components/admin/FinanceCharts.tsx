'use client'

import { useMemo } from 'react'
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  LineElement,
  PointElement,
  ArcElement,
  Title,
  Tooltip,
  Legend,
  Filler,
} from 'chart.js'
import { Bar, Doughnut, Line } from 'react-chartjs-2'
import { MonthlyRevenue, TimeBreakdown, formatCurrency } from '@/lib/financeUtils'

// Register Chart.js components
ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  LineElement,
  PointElement,
  ArcElement,
  Title,
  Tooltip,
  Legend,
  Filler
)

interface FinanceChartsProps {
  monthlyRevenue: MonthlyRevenue[]
  timeBreakdown: TimeBreakdown
  isLoading?: boolean
}

export function FinanceCharts({ monthlyRevenue, timeBreakdown, isLoading }: FinanceChartsProps) {
  // Reverse to show chronological order (oldest first)
  const sortedMonthly = useMemo(() => [...monthlyRevenue].reverse(), [monthlyRevenue])

  // Monthly revenue chart data
  const monthlyChartData = useMemo(() => ({
    labels: sortedMonthly.map(m => m.month),
    datasets: [
      {
        label: 'Net Revenue',
        data: sortedMonthly.map(m => m.netRevenue),
        backgroundColor: 'rgba(16, 185, 129, 0.8)',
        borderColor: 'rgb(16, 185, 129)',
        borderWidth: 1,
        borderRadius: 6,
      },
      {
        label: 'Refunds',
        data: sortedMonthly.map(m => m.refunds),
        backgroundColor: 'rgba(251, 146, 60, 0.8)',
        borderColor: 'rgb(251, 146, 60)',
        borderWidth: 1,
        borderRadius: 6,
      },
    ],
  }), [sortedMonthly])

  // Revenue trend line chart
  const trendChartData = useMemo(() => ({
    labels: sortedMonthly.map(m => m.month),
    datasets: [
      {
        label: 'Revenue Trend',
        data: sortedMonthly.map(m => m.netRevenue),
        borderColor: 'rgb(16, 185, 129)',
        backgroundColor: 'rgba(16, 185, 129, 0.1)',
        fill: true,
        tension: 0.4,
        pointBackgroundColor: 'rgb(16, 185, 129)',
        pointBorderColor: '#fff',
        pointBorderWidth: 2,
        pointRadius: 4,
      },
    ],
  }), [sortedMonthly])

  // Time breakdown doughnut chart
  const timeBreakdownData = useMemo(() => ({
    labels: ['Daytime (7AM-6PM)', 'Evening (6PM+)'],
    datasets: [
      {
        data: [timeBreakdown.daytimeRevenue, timeBreakdown.eveningRevenue],
        backgroundColor: [
          'rgba(59, 130, 246, 0.8)',
          'rgba(139, 92, 246, 0.8)',
        ],
        borderColor: [
          'rgb(59, 130, 246)',
          'rgb(139, 92, 246)',
        ],
        borderWidth: 2,
      },
    ],
  }), [timeBreakdown])

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'bottom' as const,
        labels: {
          padding: 20,
          usePointStyle: true,
        },
      },
      tooltip: {
        callbacks: {
          label: function(context: any) {
            return `${context.dataset.label}: ${formatCurrency(context.raw)}`
          },
        },
      },
    },
    scales: {
      y: {
        beginAtZero: true,
        ticks: {
          callback: function(value: any) {
            return formatCurrency(value)
          },
        },
      },
    },
  }

  const doughnutOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'bottom' as const,
        labels: {
          padding: 20,
          usePointStyle: true,
        },
      },
      tooltip: {
        callbacks: {
          label: function(context: any) {
            const total = context.dataset.data.reduce((a: number, b: number) => a + b, 0)
            const percentage = total > 0 ? ((context.raw / total) * 100).toFixed(1) : 0
            return `${context.label}: ${formatCurrency(context.raw)} (${percentage}%)`
          },
        },
      },
    },
  }

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {[...Array(3)].map((_, i) => (
          <div key={i} className={`rounded-xl border border-gray-200 bg-white p-6 shadow-sm animate-pulse ${i === 0 ? 'lg:col-span-2' : ''}`}>
            <div className="h-6 bg-gray-200 rounded w-40 mb-4" />
            <div className="h-64 bg-gray-100 rounded" />
          </div>
        ))}
      </div>
    )
  }

  const hasData = monthlyRevenue.length > 0

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Monthly Revenue Bar Chart */}
      <div className="lg:col-span-2 rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Monthly Revenue</h3>
        <div className="h-72">
          {hasData ? (
            <Bar data={monthlyChartData} options={chartOptions} />
          ) : (
            <div className="flex items-center justify-center h-full text-gray-400">
              No data available
            </div>
          )}
        </div>
      </div>

      {/* Revenue Trend Line Chart */}
      <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Revenue Trend</h3>
        <div className="h-64">
          {hasData ? (
            <Line data={trendChartData} options={chartOptions} />
          ) : (
            <div className="flex items-center justify-center h-full text-gray-400">
              No data available
            </div>
          )}
        </div>
      </div>

      {/* Time Breakdown Doughnut */}
      <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Revenue by Time of Day</h3>
        <div className="h-64">
          {timeBreakdown.daytimeRevenue > 0 || timeBreakdown.eveningRevenue > 0 ? (
            <Doughnut data={timeBreakdownData} options={doughnutOptions} />
          ) : (
            <div className="flex items-center justify-center h-full text-gray-400">
              No data available
            </div>
          )}
        </div>
        {/* Stats below chart */}
        <div className="grid grid-cols-2 gap-4 mt-4 pt-4 border-t border-gray-100">
          <div className="text-center">
            <p className="text-sm text-gray-500">Daytime</p>
            <p className="text-lg font-semibold text-blue-600">{timeBreakdown.daytimeBookings} bookings</p>
          </div>
          <div className="text-center">
            <p className="text-sm text-gray-500">Evening</p>
            <p className="text-lg font-semibold text-purple-600">{timeBreakdown.eveningBookings} bookings</p>
          </div>
        </div>
      </div>
    </div>
  )
}
