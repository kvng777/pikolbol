'use client'

import { useCallback, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { AgentUIMessage } from '@/lib/agent/types'

const STORAGE_PREFIX = 'pikol-agent-thread-id'

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message)
    this.name = 'HttpError'
  }
}

export async function getAccessToken(): Promise<string> {
  const { data } = await supabase.auth.getSession()
  return data.session?.access_token ?? ''
}

/** crypto.randomUUID is missing outside secure contexts (e.g. plain HTTP on a LAN IP). */
function newId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
}

function storageKey(userId: string): string {
  return `${STORAGE_PREFIX}:${userId}`
}

function writeThreadId(userId: string, id: string): void {
  try {
    localStorage.setItem(storageKey(userId), id)
  } catch {
    // Storage unavailable (private mode, quota): the id just lives in memory for this page.
  }
}

function readOrCreateThreadId(userId: string | null): string | null {
  if (typeof window === 'undefined' || !userId) return null
  try {
    const stored = localStorage.getItem(storageKey(userId))
    if (stored) return stored
  } catch {
    // Fall through to an in-memory id.
  }
  const id = newId()
  writeThreadId(userId, id)
  return id
}

interface UseAgentThreadOptions {
  userId: string | null
  /** History is only fetched once this is true (e.g. after the drawer is first opened). */
  enabled: boolean
}

/** Current chat thread (persisted per browser and admin) and its saved messages. */
export function useAgentThread({ userId, enabled }: UseAgentThreadOptions) {
  // Read once per mount; callers key the component by userId so switching admins remounts with that admin's thread.
  const [threadId, setThreadId] = useState<string | null>(() => readOrCreateThreadId(userId))

  const newThread = useCallback(() => {
    if (!userId) return
    const id = newId()
    writeThreadId(userId, id)
    setThreadId(id)
  }, [userId])

  const history = useQuery({
    queryKey: ['agentHistory', threadId],
    enabled: enabled && !!threadId,
    // Loaded once per thread while mounted; after that useChat owns the live state.
    staleTime: Infinity,
    // Drop the cache on unmount so returning to /admin shows fresh history.
    gcTime: 0,
    retry: (count, err) => !(err instanceof HttpError && err.status < 500) && count < 2,
    queryFn: async (): Promise<AgentUIMessage[]> => {
      const res = await fetch(`/api/admin/agent/history?id=${encodeURIComponent(threadId!)}`, {
        headers: { Authorization: `Bearer ${await getAccessToken()}` },
      })
      if (!res.ok) throw new HttpError(res.status, 'Failed to load chat history')
      const body = (await res.json()) as { messages: AgentUIMessage[] }
      return body.messages
    },
  })

  return { threadId, newThread, history }
}
