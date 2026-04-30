'use client'

import { DollarSign, TrendingUp, TrendingDown, RefreshCw, Minus } from 'lucide-react'
import { formatCurrency, formatPercentage } from '@/lib/financeUtils'
import { FinanceSummary } from '@/hooks/useFinanceData'

interface FinanceSummaryCardsProps {
  summary: FinanceSummary
  isLoading?: boolean
}

interface SummaryCardProps {
  title: string
  value: string
  subtitle?: string
  icon: React.ReactNode
  trend?: number
  trendLabel?: string
  colorClass: string
  bgClass: string
}

function SummaryCard({ title, value, subtitle, icon, trend, trendLabel, colorClass, bgClass }: SummaryCardProps) {
  const getTrendIcon = () => {
    if (trend === undefined) return null
    if (trend > 0) return <TrendingUp className="w-4 h-4 text-emerald-500" />
    if (trend < 0) return <TrendingDown className="w-4 h-4 text-red-500" />
    return <Minus className="w-4 h-4 text-gray-400" />
  }

  const getTrendColor = () => {
    if (trend === undefined) return ''
    if (trend > 0) return 'text-emerald-600'
    if (trend < 0) return 'text-red-600'
    return 'text-gray-500'
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm font-medium text-gray-500">{title}</span>
        <div className={`p-2 rounded-lg ${bgClass}`}>
          {icon}
        </div>
      </div>
      <div className={`text-2xl font-bold ${colorClass}`}>{value}</div>
      {(subtitle || trend !== undefined) && (
        <div className="flex items-center gap-2 mt-2">
          {trend !== undefined && (
            <>
              {getTrendIcon()}
              <span className={`text-sm font-medium ${getTrendColor()}`}>
                {trend > 0 ? '+' : ''}{formatPercentage(trend)}
              </span>
            </>
          )}
          {trendLabel && (
            <span className="text-xs text-gray-400">{trendLabel}</span>
          )}
          {subtitle && !trend && (
            <span className="text-xs text-gray-400">{subtitle}</span>
          )}
        </div>
      )}
    </div>
  )
}

export function FinanceSummaryCards({ summary, isLoading }: FinanceSummaryCardsProps) {
  if (isLoading) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm animate-pulse">
            <div className="h-4 bg-gray-200 rounded w-24 mb-3" />
            <div className="h-8 bg-gray-200 rounded w-32" />
          </div>
        ))}
      </div>
    )
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      <SummaryCard
        title="Gross Revenue"
        value={formatCurrency(summary.grossRevenue)}
        icon={<DollarSign className="w-5 h-5 text-emerald-600" />}
        colorClass="text-gray-900"
        bgClass="bg-emerald-100"
      />
      <SummaryCard
        title="This Month"
        value={formatCurrency(summary.thisMonthRevenue)}
        trend={summary.revenueGrowth}
        trendLabel="vs last month"
        icon={<TrendingUp className="w-5 h-5 text-blue-600" />}
        colorClass="text-gray-900"
        bgClass="bg-blue-100"
      />
      <SummaryCard
        title="Refunds"
        value={formatCurrency(summary.totalRefunds)}
        subtitle={summary.cancellationFees > 0 ? `Fees retained: ${formatCurrency(summary.cancellationFees)}` : undefined}
        icon={<RefreshCw className="w-5 h-5 text-orange-600" />}
        colorClass="text-orange-600"
        bgClass="bg-orange-100"
      />
      <SummaryCard
        title="Net Revenue"
        value={formatCurrency(summary.netRevenue)}
        subtitle="After refunds"
        icon={<DollarSign className="w-5 h-5 text-emerald-600" />}
        colorClass="text-emerald-600"
        bgClass="bg-emerald-100"
      />
    </div>
  )
}
