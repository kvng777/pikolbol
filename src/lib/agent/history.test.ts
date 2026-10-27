import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockSupabase = vi.hoisted(() => ({ from: vi.fn() }))
vi.mock('@/lib/supabase-server', () => ({ supabase: mockSupabase }))

import { compactOldToolOutputs, deleteMessagesFromSeq, listThreads, planTurn, threadTitle, trimForModel } from './history'
import type { AgentUIMessage } from './types'

function msg(i: number, role: 'user' | 'assistant'): AgentUIMessage {
  return { id: `m${i}`, role, parts: [{ type: 'text', text: `t${i}` }] }
}

describe('trimForModel', () => {
  const thread = Array.from({ length: 30 }, (_, i) => msg(i, i % 2 === 0 ? 'user' : 'assistant'))

  it('returns everything when under the limit', () => {
    expect(trimForModel(thread.slice(0, 5), 20)).toHaveLength(5)
  })

  it('keeps only the most recent messages', () => {
    const out = trimForModel(thread, 20)
    expect(out.at(-1)?.id).toBe('m29')
    expect(out.length).toBeLessThanOrEqual(20)
  })

  it('never starts with an assistant message', () => {
    const out = trimForModel(thread, 19) // a naive slice would start at m11 (assistant)
    expect(out[0].role).toBe('user')
  })
})

describe('compactOldToolOutputs', () => {
  const STUB = { omitted: 'Older tool result removed to save space; call the tool again if needed.' }

  function toolTurn(i: number): AgentUIMessage {
    return {
      id: `a${i}`,
      role: 'assistant',
      parts: [
        { type: 'text', text: `answer ${i}` },
        {
          type: 'tool-getActionQueue',
          toolCallId: `call${i}`,
          state: 'output-available',
          input: {},
          output: { marker: i },
        },
      ],
    } as unknown as AgentUIMessage
  }

  const thread: AgentUIMessage[] = [
    msg(0, 'user'),
    toolTurn(1),
    msg(2, 'user'),
    toolTurn(3),
    msg(4, 'user'),
    toolTurn(5),
  ]

  const outputOf = (m: AgentUIMessage) => (m.parts[1] as unknown as { output: unknown }).output

  it('keeps outputs in the last 2 assistant messages and stubs older ones', () => {
    const out = compactOldToolOutputs(thread)
    expect(outputOf(out[1])).toEqual(STUB)
    expect(outputOf(out[3])).toEqual({ marker: 3 })
    expect(outputOf(out[5])).toEqual({ marker: 5 })
  })

  it('leaves user messages and text parts untouched', () => {
    const out = compactOldToolOutputs(thread)
    expect(out[0]).toBe(thread[0])
    expect(out[2]).toBe(thread[2])
    expect(out[1].parts[0]).toEqual({ type: 'text', text: 'answer 1' })
  })

  it('does not mutate the input', () => {
    const snapshot = structuredClone(thread)
    compactOldToolOutputs(thread, 0)
    expect(thread).toEqual(snapshot)
  })
})

describe('planTurn', () => {
  const newId = () => 'new-id'
  const history: AgentUIMessage[] = [msg(0, 'user'), msg(1, 'assistant'), msg(2, 'user'), msg(3, 'assistant')]

  it('appends a new user message on a normal send', () => {
    const plan = planTurn(history, 'hello', false, newId)
    expect(plan.deleteFromSeq).toBeNull()
    expect(plan.startSeq).toBe(4)
    expect(plan.messages).toHaveLength(5)
    expect(plan.messages.at(-1)).toEqual({ id: 'new-id', role: 'user', parts: [{ type: 'text', text: 'hello' }] })
  })

  it('reuses the stored user message and drops the reply after it when regenerating the same text', () => {
    const plan = planTurn(history, 't2', true, newId)
    expect(plan.deleteFromSeq).toBe(3)
    expect(plan.startSeq).toBe(3)
    expect(plan.messages.map(m => m.id)).toEqual(['m0', 'm1', 'm2'])
  })

  it('reuses the stored user message when nothing was saved after it', () => {
    const plan = planTurn(history.slice(0, 3), 't2', true, newId)
    expect(plan.deleteFromSeq).toBe(3)
    expect(plan.startSeq).toBe(3)
    expect(plan.messages.map(m => m.id)).toEqual(['m0', 'm1', 'm2'])
  })

  it('appends when regenerating text that does not match the last user message', () => {
    const plan = planTurn(history, 'something else', true, newId)
    expect(plan.deleteFromSeq).toBeNull()
    expect(plan.startSeq).toBe(4)
    expect(plan.messages.at(-1)?.id).toBe('new-id')
  })

  it('appends when the matching user message is not at the end of history', () => {
    const h: AgentUIMessage[] = [
      { id: 'a', role: 'user', parts: [{ type: 'text', text: 'Q' }] },
      msg(1, 'assistant'),
      { id: 'c', role: 'user', parts: [{ type: 'text', text: 'other' }] },
      msg(3, 'assistant'),
    ]
    const plan = planTurn(h, 'Q', true, newId)
    expect(plan.deleteFromSeq).toBeNull()
    expect(plan.startSeq).toBe(4)
    expect(plan.messages.at(-1)?.id).toBe('new-id')
  })

  it('appends when stored messages after the last user message are not just an assistant reply', () => {
    const h: AgentUIMessage[] = [msg(0, 'user'), msg(1, 'assistant'), msg(2, 'assistant')]
    const plan = planTurn(h, 't0', true, newId)
    expect(plan.deleteFromSeq).toBeNull()
    expect(plan.startSeq).toBe(3)
  })

  it('appends when regenerating with no stored user message', () => {
    const plan = planTurn([], 'hi', true, newId)
    expect(plan.deleteFromSeq).toBeNull()
    expect(plan.startSeq).toBe(0)
    expect(plan.messages).toHaveLength(1)
  })
})

describe('deleteMessagesFromSeq', () => {
  const gte = vi.fn()
  const eq = vi.fn(() => ({ gte }))
  const del = vi.fn(() => ({ eq }))

  beforeEach(() => {
    vi.clearAllMocks()
    mockSupabase.from.mockReturnValue({ delete: del })
  })

  it('deletes messages of the thread at or after the given seq', async () => {
    gte.mockResolvedValue({ error: null })
    await deleteMessagesFromSeq('thread-1', 3)
    expect(mockSupabase.from).toHaveBeenCalledWith('agent_messages')
    expect(eq).toHaveBeenCalledWith('thread_id', 'thread-1')
    expect(gte).toHaveBeenCalledWith('seq', 3)
  })

  it('throws when the delete fails', async () => {
    gte.mockResolvedValue({ error: { message: 'boom' } })
    await expect(deleteMessagesFromSeq('thread-1', 3)).rejects.toThrow('boom')
  })
})

describe('threadTitle', () => {
  it('joins text parts and collapses whitespace', () => {
    expect(
      threadTitle([
        { type: 'text', text: '  How many   bookings\n' },
        { type: 'step-start' },
        { type: 'text', text: 'today?' },
      ])
    ).toBe('How many bookings today?')
  })

  it('truncates long titles with an ellipsis', () => {
    const title = threadTitle([{ type: 'text', text: 'a'.repeat(200) }], 10)
    expect(title).toBe(`${'a'.repeat(9)}…`)
    expect(title).toHaveLength(10)
  })

  it('does not truncate a title exactly at the limit', () => {
    expect(threadTitle([{ type: 'text', text: 'abcde' }], 5)).toBe('abcde')
  })

  it('falls back to Untitled chat when there is no text', () => {
    expect(threadTitle([])).toBe('Untitled chat')
    expect(threadTitle([{ type: 'text', text: '   ' }])).toBe('Untitled chat')
    expect(threadTitle([{ type: 'tool-x', output: 1 }])).toBe('Untitled chat')
    expect(threadTitle(null)).toBe('Untitled chat')
    expect(threadTitle('garbage')).toBe('Untitled chat')
    expect(threadTitle([null, 3, { type: 'text', text: 42 }])).toBe('Untitled chat')
  })
})

describe('listThreads', () => {
  type Result = { data: unknown; error: { message: string } | null }

  function setup(threads: Result, messages: Result) {
    const calls = {
      threadsEq: vi.fn(),
      order: vi.fn(),
      limit: vi.fn(),
      messagesIn: vi.fn(),
      messagesEq: vi.fn(),
    }
    const threadsChain = {
      select: () => threadsChain,
      eq: (...a: unknown[]) => (calls.threadsEq(...a), threadsChain),
      order: (...a: unknown[]) => (calls.order(...a), threadsChain),
      limit: (...a: unknown[]) => (calls.limit(...a), Promise.resolve(threads)),
    }
    const messagesChain = {
      select: () => messagesChain,
      in: (...a: unknown[]) => (calls.messagesIn(...a), messagesChain),
      eq: (...a: unknown[]) => (calls.messagesEq(...a), Promise.resolve(messages)),
    }
    mockSupabase.from.mockImplementation((table: string) =>
      table === 'agent_threads' ? threadsChain : messagesChain
    )
    return calls
  }

  beforeEach(() => mockSupabase.from.mockReset())

  it('filters by admin, keeps updated_at order, and skips empty threads', async () => {
    const calls = setup(
      {
        data: [
          { id: 't3', updated_at: '2026-10-27T10:00:00Z' },
          { id: 't2', updated_at: '2026-10-26T10:00:00Z' },
          { id: 't1', updated_at: '2026-10-25T10:00:00Z' },
        ],
        error: null,
      },
      {
        // Returned out of order on purpose; t2 has no first message.
        data: [
          { thread_id: 't1', parts: [{ type: 'text', text: 'First' }] },
          { thread_id: 't3', parts: [{ type: 'text', text: 'Third' }] },
        ],
        error: null,
      }
    )

    const out = await listThreads('admin-1', 10)

    expect(calls.threadsEq).toHaveBeenCalledWith('admin_user_id', 'admin-1')
    expect(calls.order).toHaveBeenCalledWith('updated_at', { ascending: false })
    expect(calls.limit).toHaveBeenCalledWith(10)
    expect(calls.messagesIn).toHaveBeenCalledWith('thread_id', ['t3', 't2', 't1'])
    expect(calls.messagesEq).toHaveBeenCalledWith('seq', 0)
    expect(out).toEqual([
      { id: 't3', title: 'Third', updatedAt: '2026-10-27T10:00:00Z' },
      { id: 't1', title: 'First', updatedAt: '2026-10-25T10:00:00Z' },
    ])
  })

  it('returns [] without querying messages when the admin has no threads', async () => {
    const calls = setup({ data: [], error: null }, { data: [], error: null })
    expect(await listThreads('admin-1')).toEqual([])
    expect(calls.messagesIn).not.toHaveBeenCalled()
  })

  it('throws on a threads query error', async () => {
    setup({ data: null, error: { message: 'boom' } }, { data: [], error: null })
    await expect(listThreads('admin-1')).rejects.toThrow('boom')
  })

  it('throws on a messages query error', async () => {
    setup(
      { data: [{ id: 't1', updated_at: '2026-10-25T10:00:00Z' }], error: null },
      { data: null, error: { message: 'kaput' } }
    )
    await expect(listThreads('admin-1')).rejects.toThrow('kaput')
  })
})
