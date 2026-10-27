import { describe, it, expect, vi } from 'vitest'

vi.mock('@/lib/supabase-server', () => ({ supabase: {} }))

import { compactOldToolOutputs, trimForModel } from './history'
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
