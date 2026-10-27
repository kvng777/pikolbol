'use client'

import { useEffect, useRef, useState } from 'react'
import { useChat } from '@ai-sdk/react'
import { useQueryClient } from '@tanstack/react-query'
import { DefaultChatTransport } from 'ai'
import { Send, Square, RotateCcw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { getAccessToken } from '@/hooks/useAgentThread'
import type { AgentUIMessage } from '@/lib/agent/types'
import { AgentMessage } from './AgentMessage'
import { formatResetDate } from './AgentUsageBar'
import { budgetErrorKind } from '@/lib/agent/budgetErrors'

const SUGGESTIONS = [
  'How much did we earn this month?',
  'What slots are still open tomorrow?',
  'Any payments waiting for confirmation?',
  'What were our busiest time slots last month?',
]

// Auto-scroll only while the user is near the bottom, so reading older messages isn't interrupted.
const STICK_TO_BOTTOM_PX = 80

interface AgentChatProps {
  threadId: string
  initialMessages: AgentUIMessage[]
  isOpen: boolean
  /** The usage query has data; once true it decides blocking (so a raised/reset budget unblocks the chat). */
  usageLoaded: boolean
  /** Monthly AI budget reached: input is disabled until it resets. */
  budgetExceeded: boolean
  /** YYYY-MM-DD the budget resets (1st of next month, Manila). */
  budgetResetsOn?: string
}

export function AgentChat({
  threadId,
  initialMessages,
  isOpen,
  usageLoaded,
  budgetExceeded,
  budgetResetsOn,
}: AgentChatProps) {
  const queryClient = useQueryClient()
  const [input, setInput] = useState('')
  const listRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const nearBottomRef = useRef(true)

  const { messages, sendMessage, status, stop, error, clearError, regenerate } = useChat<AgentUIMessage>({
    id: threadId,
    messages: initialMessages,
    transport: new DefaultChatTransport<AgentUIMessage>({
      api: '/api/admin/agent',
      headers: async () => ({ Authorization: `Bearer ${await getAccessToken()}` }),
      // Server replays history from the DB and builds the user message itself, so send only the new text.
      // On retry the server reuses its stored copy of the question instead of saving it twice.
      prepareSendMessagesRequest: ({ id, messages, trigger }) => {
        const last = messages[messages.length - 1]
        const text = last.parts.map(p => (p.type === 'text' ? p.text : '')).join('\n')
        return { body: { id, text, regenerate: trigger === 'regenerate-message' } }
      },
    }),
    // Refresh the budget meter and previous-chats list after every answer (budget also when the server says it is used up).
    onFinish: () => {
      void queryClient.invalidateQueries({ queryKey: ['agentUsage'] })
      void queryClient.invalidateQueries({ queryKey: ['agentThreads'] })
    },
    onError: err => {
      if (budgetErrorKind(err)) void queryClient.invalidateQueries({ queryKey: ['agentUsage'] })
    },
  })

  const busy = status === 'submitted' || status === 'streaming'
  const budgetError = budgetErrorKind(error)
  // Usage data (refreshed after a 402) is the source of truth once loaded; until then trust the 402 itself.
  // If usage later shows room again, the stale 402 is simply not shown and the admin can send (which clears it).
  const blocked = usageLoaded ? budgetExceeded : budgetError === 'exceeded'
  const budgetNotice = `This month's AI budget has been reached. The assistant will be available again on ${
    budgetResetsOn ? formatResetDate(budgetResetsOn) : 'the 1st of next month'
  }.`

  const scrollToBottom = () => {
    const el = listRef.current
    if (el) el.scrollTop = el.scrollHeight
  }

  useEffect(() => {
    if (nearBottomRef.current) scrollToBottom()
  }, [messages, status])

  useEffect(() => {
    if (!isOpen) return
    nearBottomRef.current = true
    scrollToBottom()
    inputRef.current?.focus()
  }, [isOpen])

  const submit = (text: string) => {
    const trimmed = text.trim()
    if (!trimmed || busy || blocked) return
    nearBottomRef.current = true
    void sendMessage({ text: trimmed })
    setInput('')
  }

  return (
    <div className="flex h-full flex-col">
      <div
        ref={listRef}
        onScroll={e => {
          const el = e.currentTarget
          nearBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < STICK_TO_BOTTOM_PX
        }}
        aria-live="polite"
        className="flex-1 space-y-3 overflow-y-auto p-4"
      >
        {messages.length === 0 && !blocked && (
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

        {blocked && (
          <div className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">{budgetNotice}</div>
        )}

        {error && budgetError !== 'exceeded' && (
          <div className="flex items-center justify-between rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
            <span>
              {budgetError === 'unavailable'
                ? "Couldn't check the AI budget right now. Please try again shortly."
                : 'Something went wrong.'}
            </span>
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
      </div>

      <form
        onSubmit={e => {
          e.preventDefault()
          submit(input)
        }}
        className="flex items-end gap-2 border-t border-gray-100 p-3"
      >
        <textarea
          ref={inputRef}
          value={input}
          aria-label="Message Pikol Assistant"
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              submit(input)
            }
          }}
          rows={1}
          maxLength={4000}
          disabled={blocked}
          placeholder={blocked ? 'Monthly AI budget reached' : 'Ask Pikol Assistant…'}
          className="max-h-32 flex-1 resize-none rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-emerald-400 focus:outline-none disabled:cursor-not-allowed disabled:bg-gray-50"
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
            disabled={!input.trim() || blocked}
            aria-label="Send"
          >
            <Send className="h-4 w-4" />
          </Button>
        )}
      </form>
    </div>
  )
}
