'use client'

import { useQuery } from '@tanstack/react-query'
import { getAccessToken, HttpError } from '@/hooks/useAgentThread'
import type { BudgetSummary } from '@/lib/agent/usage'

/** This month's AI assistant spend vs. budget. Refreshed by AgentChat after every answer. */
export function useAgentUsage({ enabled }: { enabled: boolean }) {
  return useQuery({
    queryKey: ['agentUsage'],
    enabled,
    staleTime: 30_000,
    queryFn: async (): Promise<BudgetSummary> => {
      const res = await fetch('/api/admin/agent/usage', {
        headers: { Authorization: `Bearer ${await getAccessToken()}` },
      })
      if (!res.ok) throw new HttpError(res.status, 'Failed to load AI usage')
      return (await res.json()) as BudgetSummary
    },
  })
}
