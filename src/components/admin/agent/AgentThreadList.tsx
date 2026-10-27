'use client'

import { useEffect, useRef } from 'react'
import { format, isThisYear, isToday, isYesterday } from 'date-fns'
import { ArrowLeft, Loader2 } from 'lucide-react'
import { useAgentThreads } from '@/hooks/useAgentThreads'

/** "Today, 3:21 PM" / "Yesterday, 9:05 AM" / "Oct 24" / "Oct 24, 2025" (local time). */
export function formatThreadDate(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  if (isToday(d)) return `Today, ${format(d, 'h:mm a')}`
  if (isYesterday(d)) return `Yesterday, ${format(d, 'h:mm a')}`
  return format(d, isThisYear(d) ? 'MMM d' : 'MMM d, yyyy')
}

interface AgentThreadListProps {
  currentThreadId: string | null
  onSelect: (id: string) => void
  onBack: () => void
}

/** The signed-in admin's previous chats. Mounted only while the history view is open, so it fetches then. */
export function AgentThreadList({ currentThreadId, onSelect, onBack }: AgentThreadListProps) {
  const threads = useAgentThreads({ enabled: true })
  const backRef = useRef<HTMLButtonElement>(null)

  // Focus would otherwise be stranded inside the now-hidden chat.
  useEffect(() => {
    backRef.current?.focus()
  }, [])

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b border-gray-100 px-3 py-2">
        <button
          ref={backRef}
          onClick={onBack}
          className="flex items-center gap-1 rounded px-1.5 py-1 text-xs font-medium text-gray-600 hover:bg-gray-100"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Back
        </button>
        <h2 className="text-sm font-semibold text-gray-900">Previous chats</h2>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {threads.isLoading && (
          <div className="flex h-full items-center justify-center text-gray-400">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        )}
        {threads.isError && (
          <div className="p-4 text-sm text-red-600">
            Couldn&apos;t load previous chats.{' '}
            <button className="underline" onClick={() => void threads.refetch()}>
              Try again
            </button>
          </div>
        )}
        {threads.data && threads.data.length === 0 && (
          <p className="p-4 text-sm text-gray-500">No previous chats yet.</p>
        )}
        {threads.data && threads.data.length > 0 && (
          <ul className="divide-y divide-gray-100">
            {threads.data.map(t => {
              const current = t.id === currentThreadId
              return (
                <li key={t.id}>
                  <button
                    onClick={() => onSelect(t.id)}
                    aria-current={current ? 'true' : undefined}
                    className={`flex w-full flex-col gap-0.5 border-l-2 px-4 py-2.5 text-left hover:bg-gray-50 ${
                      current ? 'border-emerald-500 bg-emerald-50/50' : 'border-transparent'
                    }`}
                  >
                    <span className="flex items-center gap-2">
                      <span className="min-w-0 flex-1 truncate text-sm text-gray-900">{t.title}</span>
                      {current && (
                        <span className="shrink-0 rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700">
                          Current
                        </span>
                      )}
                    </span>
                    <span className="text-xs text-gray-500">{formatThreadDate(t.updatedAt)}</span>
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </div>
  )
}
