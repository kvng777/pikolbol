'use client'

import { useState } from 'react'
import { Sparkles, X, SquarePen, Loader2 } from 'lucide-react'
import { useAgentThread } from '@/hooks/useAgentThread'
import { AgentChat } from './AgentChat'

export function AgentDrawer() {
  const [open, setOpen] = useState(false)
  const { threadId, newThread, history } = useAgentThread()

  return (
    <>
      {!open && (
        <button
          onClick={() => setOpen(true)}
          className="fixed bottom-6 right-6 z-40 flex items-center gap-2 rounded-full bg-emerald-500 px-4 py-3 text-sm font-medium text-white shadow-lg hover:bg-emerald-600"
          aria-label="Open Pikol Assistant"
        >
          <Sparkles className="h-4 w-4" /> Ask Pikol
        </button>
      )}

      {/* Kept mounted while closed so an in-progress chat survives close/reopen. */}
      <div
        className={`fixed inset-x-0 bottom-0 z-50 flex h-[85vh] flex-col overflow-hidden rounded-t-2xl border border-gray-200 bg-white shadow-2xl sm:inset-x-auto sm:bottom-6 sm:right-6 sm:h-[min(640px,calc(100vh-3rem))] sm:w-[420px] sm:rounded-2xl ${
          open ? '' : 'hidden'
        }`}
        role="dialog"
        aria-label="Pikol Assistant"
      >
        <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-emerald-500" />
            <span className="text-sm font-semibold text-gray-900">Pikol Assistant</span>
            <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-gray-500">read-only</span>
          </div>
          <div className="flex items-center gap-1">
            <button onClick={newThread} className="rounded p-1.5 text-gray-500 hover:bg-gray-100" aria-label="New chat">
              <SquarePen className="h-4 w-4" />
            </button>
            <button onClick={() => setOpen(false)} className="rounded p-1.5 text-gray-500 hover:bg-gray-100" aria-label="Close">
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="min-h-0 flex-1">
          {history.isLoading && (
            <div className="flex h-full items-center justify-center text-gray-400">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          )}
          {history.isError && (
            <div className="p-4 text-sm text-red-600">
              Couldn&apos;t load chat history.{' '}
              <button className="underline" onClick={() => void history.refetch()}>Try again</button>
            </div>
          )}
          {threadId && history.data && (
            <AgentChat key={threadId} threadId={threadId} initialMessages={history.data} />
          )}
        </div>
      </div>
    </>
  )
}
