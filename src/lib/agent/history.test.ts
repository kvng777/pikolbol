import { describe, it, expect, vi } from 'vitest'

vi.mock('@/lib/supabase-server', () => ({ supabase: {} }))

import { trimForModel } from './history'
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
