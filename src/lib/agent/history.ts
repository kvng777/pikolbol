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

/**
 * Upserts only the messages from `startSeq` onward (the ones added this turn).
 * `messages` is the complete updated thread that AI SDK onEnd hands us; `startSeq` is how many were already stored.
 */
export async function saveThreadMessages(
  threadId: string,
  messages: AgentUIMessage[],
  startSeq: number
): Promise<void> {
  const rows = messages
    .slice(startSeq)
    .map((m, i) => ({ thread_id: threadId, id: m.id, seq: startSeq + i, role: m.role, parts: m.parts }))
    .filter(r => r.role === 'user' || r.role === 'assistant')
  if (rows.length === 0) return

  const { error } = await supabase.from('agent_messages').upsert(rows, { onConflict: 'thread_id,id' })
  if (error) throw new Error(`Failed to save messages: ${error.message}`)

  await supabase.from('agent_threads').update({ updated_at: new Date().toISOString() }).eq('id', threadId)
}

/** Removes messages at or after `fromSeq` (used to drop a failed/partial reply before regenerating it). */
export async function deleteMessagesFromSeq(threadId: string, fromSeq: number): Promise<void> {
  const { error } = await supabase.from('agent_messages').delete().eq('thread_id', threadId).gte('seq', fromSeq)
  if (error) throw new Error(`Failed to delete messages: ${error.message}`)
}

export interface TurnPlan {
  /** Full thread to send to the model (history + this turn's user message). */
  messages: AgentUIMessage[]
  /** If set, stored messages with seq >= this must be deleted before streaming. */
  deleteFromSeq: number | null
  /** Seq from which onEnd should save (number of messages kept in storage). */
  startSeq: number
}

function textOf(message: AgentUIMessage): string {
  return message.parts.map(p => (p.type === 'text' ? p.text : '')).join('\n')
}

/**
 * Decides which messages this turn sends and stores. On a retry (regenerate) whose text matches the
 * last stored user message, that message is reused and everything after it is dropped, so the
 * question isn't duplicated. Otherwise a new server-built user message is appended.
 * Seq equals array position because saveThreadMessages always writes seq = index.
 */
export function planTurn(
  history: AgentUIMessage[],
  text: string,
  regenerate: boolean,
  newId: () => string
): TurnPlan {
  if (regenerate) {
    const lastUser = history.findLastIndex(m => m.role === 'user')
    if (lastUser !== -1 && textOf(history[lastUser]) === text) {
      const kept = history.slice(0, lastUser + 1)
      return { messages: kept, deleteFromSeq: lastUser + 1, startSeq: kept.length }
    }
  }
  const userMessage: AgentUIMessage = { id: newId(), role: 'user', parts: [{ type: 'text', text }] }
  return { messages: [...history, userMessage], deleteFromSeq: null, startSeq: history.length }
}

/** Keep the last `limit` messages, dropping leading assistant turns so the model sees a user turn first. */
export function trimForModel(messages: AgentUIMessage[], limit: number = MODEL_HISTORY_LIMIT): AgentUIMessage[] {
  const recent = messages.slice(-limit)
  const firstUser = recent.findIndex(m => m.role === 'user')
  return firstUser <= 0 ? recent : recent.slice(firstUser)
}

const OMITTED_TOOL_OUTPUT = {
  omitted: 'Older tool result removed to save space; call the tool again if needed.',
}

/** Replace tool outputs in all but the last `keepRecent` assistant messages with a stub; the model can re-run tools. */
export function compactOldToolOutputs(messages: AgentUIMessage[], keepRecent = 2): AgentUIMessage[] {
  const assistantIdx = messages.flatMap((m, i) => (m.role === 'assistant' ? [i] : []))
  const keepFrom = keepRecent > 0 ? (assistantIdx.at(-keepRecent) ?? 0) : Infinity

  return messages.map((m, i) => {
    if (m.role !== 'assistant' || i >= keepFrom) return m
    return {
      ...m,
      parts: m.parts.map(part =>
        part.type.startsWith('tool-') && 'state' in part && part.state === 'output-available'
          ? ({ ...part, output: OMITTED_TOOL_OUTPUT } as unknown as typeof part)
          : part
      ),
    }
  })
}
