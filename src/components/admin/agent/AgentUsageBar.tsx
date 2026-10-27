'use client'

import type { BudgetLevel, BudgetSummary } from '@/lib/agent/usage'

const FILL: Record<BudgetLevel, string> = {
  ok: 'bg-emerald-500',
  warning: 'bg-amber-500',
  exceeded: 'bg-red-500',
}

const peso = (n: number) => `₱${n.toLocaleString('en-PH', { maximumFractionDigits: 0 })}`

/** "2026-11-01" → "Nov 1" (date-only, so format in UTC to avoid a timezone shift). */
export function formatResetDate(isoDate: string): string {
  return new Date(`${isoDate}T00:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })
}

interface AgentUsageBarProps {
  usage?: BudgetSummary
  isLoading: boolean
  isError: boolean
}

export function AgentUsageBar({ usage, isLoading, isError }: AgentUsageBarProps) {
  if (isLoading) {
    return (
      <div className="border-b border-gray-100 px-4 py-2" aria-hidden>
        <div className="h-1.5 w-full animate-pulse rounded-full bg-gray-100" />
      </div>
    )
  }
  if (!usage) {
    return isError ? (
      <div className="border-b border-gray-100 px-4 py-2 text-xs text-gray-400">AI usage unavailable</div>
    ) : null
  }

  if (usage.budgetPhp === null || usage.percent === null) {
    return (
      <div className="border-b border-gray-100 px-4 py-2 text-xs text-gray-500">
        {peso(usage.usedPhp)} used this month
      </div>
    )
  }

  const label = usage.exceeded
    ? `Monthly AI budget reached — resets ${formatResetDate(usage.resetsOn)}`
    : `${usage.percent}% of monthly AI budget used`

  return (
    <div className="border-b border-gray-100 px-4 py-2 text-xs">
      <div className="flex items-center gap-3">
        <div
          role="progressbar"
          aria-valuenow={usage.percent}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuetext={`${peso(usage.usedPhp)} of ${peso(usage.budgetPhp)} used`}
          aria-label="Monthly AI budget used"
          className="h-1.5 flex-1 overflow-hidden rounded-full bg-gray-100"
        >
          <div className={`h-full rounded-full ${FILL[usage.level]}`} style={{ width: `${usage.percent}%` }} />
        </div>
        <span className="shrink-0 font-medium text-gray-700">
          {peso(usage.usedPhp)} / {peso(usage.budgetPhp)}
        </span>
      </div>
      <p className={`mt-1 ${usage.exceeded ? 'text-red-600' : usage.level === 'warning' ? 'text-amber-700' : 'text-gray-500'}`}>
        {label}
      </p>
    </div>
  )
}
