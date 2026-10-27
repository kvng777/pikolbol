'use client'

import { useEffect, useRef, useState } from 'react'
import { useChat } from '@ai-sdk/react'
import { DefaultChatTransport } from 'ai'
import { Send, Square, RotateCcw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { getAccessToken } from '@/hooks/useAgentThread'
import type { AgentUIMessage } from '@/lib/agent/types'
import { AgentMessage } from './AgentMessage'

const SUGGESTIONS = [
  'How much did we earn this month?',
  'What slots are still open tomorrow?',
  'Any payments waiting for confirmation?',
  'What were our busiest time slots last month?',
]

interface AgentChatProps {
  threadId: string
  initialMessages: AgentUIMessage[]
}

export function AgentChat({ threadId, initialMessages }: AgentChatProps) {
  const [input, setInput] = useState('')
  const bottomRef = useRef<HTMLDivElement>(null)

  const { messages, sendMessage, status, stop, error, clearError, regenerate } = useChat<AgentUIMessage>({
    id: threadId,
    messages: initialMessages,
    transport: new DefaultChatTransport<AgentUIMessage>({
      api: '/api/admin/agent',
      headers: async () => ({ Authorization: `Bearer ${await getAccessToken()}` }),
      // Server replays history from the DB and builds the user message itself, so send only the new text.
      prepareSendMessagesRequest: ({ id, messages }) => {
        const last = messages[messages.length - 1]
        const text = last.parts.map(p => (p.type === 'text' ? p.text : '')).join('\n')
        return { body: { id, text } }
      },
    }),
  })

  const busy = status === 'submitted' || status === 'streaming'

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const submit = (text: string) => {
    const trimmed = text.trim()
    if (!trimmed || busy) return
    void sendMessage({ text: trimmed })
    setInput('')
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 space-y-3 overflow-y-auto p-4">
        {messages.length === 0 && (
          <div className="space-y-2">
            <p className="text-sm text-gray-500">Ask about bookings, revenue, availability or pending work.</p>
            {SUGGESTIONS.map(s => (
              <button
                key={s}
                onClick={() => submit(s)}
                className="block w-full rounded-lg border border-gray-200 px-3 py-2 text-left text-sm text-gray-700 hover:border-emerald-300 hover:bg-emerald-50"
              >
                {s}
              </button>
            ))}
          </div>
        )}

        {messages.map(m => (
          <AgentMessage key={m.id} message={m} />
        ))}

        {status === 'submitted' && <p className="text-xs text-gray-400">Thinking…</p>}

        {error && (
          <div className="flex items-center justify-between rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
            <span>Something went wrong.</span>
            <button
              onClick={() => {
                clearError()
                void regenerate()
              }}
              className="flex items-center gap-1 font-medium"
            >
              <RotateCcw className="h-3.5 w-3.5" /> Retry
            </button>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      <form
        onSubmit={e => {
          e.preventDefault()
          submit(input)
        }}
        className="flex items-end gap-2 border-t border-gray-100 p-3"
      >
        <textarea
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              submit(input)
            }
          }}
          rows={1}
          maxLength={4000}
          placeholder="Ask Pikol Assistant…"
          className="max-h-32 flex-1 resize-none rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-emerald-400 focus:outline-none"
        />
        {busy ? (
          <Button type="button" size="icon" variant="outline" onClick={() => void stop()} aria-label="Stop">
            <Square className="h-4 w-4" />
          </Button>
        ) : (
          <Button
            type="submit"
            size="icon"
            className="bg-emerald-500 hover:bg-emerald-600"
            disabled={!input.trim()}
            aria-label="Send"
          >
            <Send className="h-4 w-4" />
          </Button>
        )}
      </form>
    </div>
  )
}
