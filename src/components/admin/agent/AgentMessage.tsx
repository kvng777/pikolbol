'use client'

import Markdown, { type Components } from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Loader2, CheckCircle2, AlertCircle } from 'lucide-react'
import type { AgentUIMessage } from '@/lib/agent/types'

const TOOL_LABELS: Record<string, string> = {
  'tool-listBookings': 'bookings',
  'tool-getRevenueSummary': 'revenue',
  'tool-getSlotAvailability': 'availability',
  'tool-getActionQueue': 'pending items',
}

// react-markdown escapes raw HTML by default (no rehype-raw), so model output can't inject markup.
const markdownComponents: Components = {
  p: props => <p className="mb-2 last:mb-0" {...props} />,
  ul: props => <ul className="mb-2 list-disc pl-5" {...props} />,
  ol: props => <ol className="mb-2 list-decimal pl-5" {...props} />,
  table: props => (
    <div className="my-2 overflow-x-auto">
      <table className="w-full text-xs border-collapse" {...props} />
    </div>
  ),
  th: props => <th className="border-b border-gray-200 px-2 py-1 text-left font-semibold" {...props} />,
  td: props => <td className="border-b border-gray-100 px-2 py-1" {...props} />,
  a: props => <a className="text-emerald-700 underline" target="_blank" rel="noreferrer" {...props} />,
}

function ToolChip({ type, state }: { type: string; state: string }) {
  const label = TOOL_LABELS[type] ?? 'data'
  if (state === 'output-error') {
    return (
      <div className="flex items-center gap-1.5 text-xs text-red-600">
        <AlertCircle className="h-3.5 w-3.5" /> Couldn&apos;t load {label}
      </div>
    )
  }
  if (state === 'output-available') {
    return (
      <div className="flex items-center gap-1.5 text-xs text-gray-500">
        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" /> Checked {label}
      </div>
    )
  }
  return (
    <div className="flex items-center gap-1.5 text-xs text-gray-500">
      <Loader2 className="h-3.5 w-3.5 animate-spin" /> Checking {label}…
    </div>
  )
}

export function AgentMessage({ message }: { message: AgentUIMessage }) {
  const isUser = message.role === 'user'

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-[90%] rounded-2xl px-3 py-2 text-sm space-y-1.5 ${
          isUser ? 'bg-emerald-500 text-white' : 'bg-gray-100 text-gray-900'
        }`}
      >
        {message.parts.map((part, i) => {
          const key = `${message.id}-${i}`
          switch (part.type) {
            case 'text':
              return isUser ? (
                <p key={key} className="whitespace-pre-wrap">{part.text}</p>
              ) : (
                <Markdown key={key} remarkPlugins={[remarkGfm]} components={markdownComponents}>
                  {part.text}
                </Markdown>
              )
            case 'tool-listBookings':
            case 'tool-getRevenueSummary':
            case 'tool-getSlotAvailability':
            case 'tool-getActionQueue':
              return <ToolChip key={key} type={part.type} state={part.state} />
            default:
              return null
          }
        })}
      </div>
    </div>
  )
}
