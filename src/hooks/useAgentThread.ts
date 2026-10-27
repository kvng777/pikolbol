'use client'

import { useCallback, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { AgentUIMessage } from '@/lib/agent/types'

const STORAGE_KEY = 'pikol-agent-thread-id'

export async function getAccessToken(): Promise<string> {
  const { data } = await supabase.auth.getSession()
  return data.session?.access_token ?? ''
}

function readOrCreateThreadId(): string | null {
  if (typeof window === 'undefined') return null
  const stored = localStorage.getItem(STORAGE_KEY)
  if (stored) return stored
  const id = crypto.randomUUID()
  localStorage.setItem(STORAGE_KEY, id)
  return id
}

/** Current chat thread (persisted per browser) and its saved messages. */
export function useAgentThread() {
  const [threadId, setThreadId] = useState<string | null>(readOrCreateThreadId)

  const newThread = useCallback(() => {
    const id = crypto.randomUUID()
    localStorage.setItem(STORAGE_KEY, id)
    setThreadId(id)
  }, [])

  const history = useQuery({
    queryKey: ['agentHistory', threadId],
    enabled: !!threadId,
    // Loaded once per thread; after that useChat owns the live state.
    staleTime: Infinity,
    queryFn: async (): Promise<AgentUIMessage[]> => {
      const res = await fetch(`/api/admin/agent/history?id=${encodeURIComponent(threadId!)}`, {
        headers: { Authorization: `Bearer ${await getAccessToken()}` },
      })
      if (!res.ok) throw new Error('Failed to load chat history')
      const body = (await res.json()) as { messages: AgentUIMessage[] }
      return body.messages
    },
  })

  return { threadId, newThread, history }
}
