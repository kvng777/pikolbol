'use client'

import { useEffect, useRef, useState } from 'react'
import dynamic from 'next/dynamic'
import { Sparkles, X, SquarePen, Loader2 } from 'lucide-react'
import { useAuth } from '@/components/AuthProvider'
import { HttpError, useAgentThread } from '@/hooks/useAgentThread'
import { useAgentUsage } from '@/hooks/useAgentUsage'
import { AgentUsageBar } from './AgentUsageBar'

function Spinner() {
  return (
    <div className="flex h-full items-center justify-center text-gray-400">
      <Loader2 className="h-5 w-5 animate-spin" />
    </div>
  )
}

// Chat UI (and the AI SDK client) is only downloaded once the drawer is first opened.
const AgentChat = dynamic(() => import('./AgentChat').then(m => m.AgentChat), {
  ssr: false,
  loading: Spinner,
})

export function AgentDrawer() {
  const { user } = useAuth()
  const userId = user?.id ?? null
  // Remount per admin so each one gets their own stored thread.
  return <AgentDrawerPanel key={userId ?? 'anonymous'} userId={userId} />
}

function AgentDrawerPanel({ userId }: { userId: string | null }) {
  const [open, setOpen] = useState(false)
  const [everOpened, setEverOpened] = useState(false)
  const launcherRef = useRef<HTMLButtonElement>(null)
  const { threadId, newThread, history } = useAgentThread({ userId, enabled: everOpened })
  const usage = useAgentUsage({ enabled: everOpened })

  const openPanel = () => {
    setEverOpened(true)
    setOpen(true)
  }

  // Return focus to the launcher after closing.
  useEffect(() => {
    if (!open && everOpened) launcherRef.current?.focus()
  }, [open, everOpened])

  const forbidden = history.error instanceof HttpError && history.error.status === 403

  return (
    <>
      {/* Kept mounted (just hidden while open) so focus can return to it on close. */}
      <button
        ref={launcherRef}
        onClick={openPanel}
        className={`fixed bottom-6 right-6 z-40 flex items-center gap-2 rounded-full bg-emerald-500 px-4 py-3 text-sm font-medium text-white shadow-lg hover:bg-emerald-600 ${
          open ? 'hidden' : ''
        }`}
        aria-label="Open Pikol Assistant"
      >
        <Sparkles className="h-4 w-4" /> Ask Pikol
      </button>

      {/* Contents render after the first open, then stay mounted while closed so an in-progress chat survives. */}
      {everOpened && (
        <div
          className={`fixed inset-x-0 bottom-0 z-50 flex h-[85vh] flex-col overflow-hidden rounded-t-2xl border border-gray-200 bg-white shadow-2xl sm:inset-x-auto sm:bottom-6 sm:right-6 sm:h-[min(640px,calc(100vh-3rem))] sm:w-[420px] sm:rounded-2xl ${
            open ? '' : 'hidden'
          }`}
          role="dialog"
          aria-label="Pikol Assistant"
          onKeyDown={e => {
            if (e.key === 'Escape') {
              e.stopPropagation()
              setOpen(false)
            }
          }}
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

          <AgentUsageBar usage={usage.data} isLoading={usage.isLoading} isError={usage.isError} />

          <div className="min-h-0 flex-1">
            {history.isLoading && <Spinner />}
            {forbidden && (
              <div className="p-4 text-sm text-gray-600">
                This chat belongs to another account.{' '}
                <button className="font-medium text-emerald-700 underline" onClick={newThread}>
                  Start new chat
                </button>
              </div>
            )}
            {history.isError && !forbidden && (
              <div className="p-4 text-sm text-red-600">
                Couldn&apos;t load chat history.{' '}
                <button className="underline" onClick={() => void history.refetch()}>Try again</button>
              </div>
            )}
            {threadId && history.data && (
              <AgentChat
                key={threadId}
                threadId={threadId}
                initialMessages={history.data}
                isOpen={open}
                usageLoaded={usage.data !== undefined}
                budgetExceeded={usage.data?.exceeded ?? false}
                budgetResetsOn={usage.data?.resetsOn}
              />
            )}
          </div>
        </div>
      )}
    </>
  )
}
