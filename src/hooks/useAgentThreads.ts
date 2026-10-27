'use client'

import { useQuery } from '@tanstack/react-query'
import { getAccessToken, HttpError } from '@/hooks/useAgentThread'
import type { ThreadSummary } from '@/lib/agent/history'

/** The signed-in admin's previous chats, newest first. Refreshed by AgentChat after every answer. */
export function useAgentThreads({ enabled }: { enabled: boolean }) {
  return useQuery({
    queryKey: ['agentThreads'],
    enabled,
    staleTime: 0,
    retry: (count, err) => !(err instanceof HttpError && err.status < 500) && count < 2,
    queryFn: async (): Promise<ThreadSummary[]> => {
      const res = await fetch('/api/admin/agent/threads', {
        headers: { Authorization: `Bearer ${await getAccessToken()}` },
      })
      if (!res.ok) throw new HttpError(res.status, 'Failed to load previous chats')
      const body = (await res.json()) as { threads: ThreadSummary[] }
      return body.threads
    },
  })
}
