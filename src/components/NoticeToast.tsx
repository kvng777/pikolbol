'use client'

import { useEffect, useRef } from 'react'
import { toast } from 'sonner'
import { Megaphone, X } from 'lucide-react'
import { useActiveNotice } from '@/hooks/useNotice'
import { Notice } from '@/types/notice'

const TOAST_ID = 'site-notice'
const AUTO_CLOSE_MS = 5000

/**
 * Renders the active site notice as an auto-dismissing announcement toast.
 * Fires once per page load when a notice is active. Mount on public pages only.
 */
export default function NoticeToast() {
  const { data: notice } = useActiveNotice()
  const hasShownRef = useRef(false)

  useEffect(() => {
    if (!notice || hasShownRef.current) return
    hasShownRef.current = true

    toast.custom((id) => <NoticeCard notice={notice} onClose={() => toast.dismiss(id)} />, {
      id: TOAST_ID,
      duration: AUTO_CLOSE_MS,
    })
  }, [notice])

  return null
}

function NoticeCard({ notice, onClose }: { notice: Notice; onClose: () => void }) {
  return (
    <div className="w-full max-w-md rounded-xl border border-emerald-200 bg-white shadow-lg overflow-hidden">
      <div className="flex items-start gap-3 p-4">
        <div className="mt-0.5 shrink-0 p-2 rounded-lg bg-emerald-100">
          <Megaphone className="w-5 h-5 text-emerald-600" />
        </div>

        <div className="flex-1 min-w-0">
          {notice.title && (
            <p className="text-sm font-semibold text-gray-900 pr-6">{notice.title}</p>
          )}
          {notice.message && (
            <p className="mt-1 text-sm text-gray-600 whitespace-pre-line leading-relaxed">
              {notice.message}
            </p>
          )}
        </div>

        <button
          type="button"
          onClick={onClose}
          aria-label="Close notice"
          className="shrink-0 -mt-1 -mr-1 p-1 rounded-md text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Auto-close progress bar */}
      <div className="h-1 w-full bg-emerald-100 overflow-hidden">
        <div className="h-full bg-emerald-500 origin-left animate-[notice-progress_5s_linear_forwards]" />
      </div>
    </div>
  )
}
