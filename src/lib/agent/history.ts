import { supabase } from '@/lib/supabase-server'
import type { AgentUIMessage } from './types'

/** How many recent messages are replayed to the model (token budget). The full thread is still stored. */
export const MODEL_HISTORY_LIMIT = 20

export async function getThreadOwner(threadId: string): Promise<string | null> {
  const { data, error } = await supabase
    .from('agent_threads')
    .select('admin_user_id')
    .eq('id', threadId)
    .maybeSingle()
  if (error) throw new Error(`Failed to load thread: ${error.message}`)
  return data?.admin_user_id ?? null
}

/** Creates the thread on first use. Returns 'forbidden' if another admin owns it. */
export async function ensureThread(threadId: string, adminUserId: string): Promise<'ok' | 'forbidden'> {
  const owner = await getThreadOwner(threadId)
  if (owner && owner !== adminUserId) return 'forbidden'
  if (!owner) {
    const { error } = await supabase
      .from('agent_threads')
      .insert({ id: threadId, admin_user_id: adminUserId })
    if (error) throw new Error(`Failed to create thread: ${error.message}`)
  }
  return 'ok'
}

export async function loadThreadMessages(threadId: string): Promise<AgentUIMessage[]> {
  const { data, error } = await supabase
    .from('agent_messages')
    .select('id, role, parts')
    .eq('thread_id', threadId)
    .order('seq', { ascending: true })
  if (error) throw new Error(`Failed to load messages: ${error.message}`)
  return (data ?? []) as AgentUIMessage[]
}

/** Upserts the full message list (AI SDK onEnd hands us the complete updated thread). */
export async function saveThreadMessages(threadId: string, messages: AgentUIMessage[]): Promise<void> {
  const rows = messages
    .filter(m => m.role === 'user' || m.role === 'assistant')
    .map((m, seq) => ({ thread_id: threadId, id: m.id, seq, role: m.role, parts: m.parts }))

  const { error } = await supabase.from('agent_messages').upsert(rows, { onConflict: 'thread_id,id' })
  if (error) throw new Error(`Failed to save messages: ${error.message}`)

  await supabase.from('agent_threads').update({ updated_at: new Date().toISOString() }).eq('id', threadId)
}

/** Keep the last `limit` messages, dropping leading assistant turns so the model sees a user turn first. */
export function trimForModel(messages: AgentUIMessage[], limit: number = MODEL_HISTORY_LIMIT): AgentUIMessage[] {
  const recent = messages.slice(-limit)
  const firstUser = recent.findIndex(m => m.role === 'user')
  return firstUser <= 0 ? recent : recent.slice(firstUser)
}
