'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  getNoticeAction,
  getActiveNoticeAction,
  updateNoticeAction,
} from '@/actions/notice'
import { Notice, UpdateNoticeData } from '@/types/notice'

const NOTICE_KEY = ['notice'] as const
const ACTIVE_NOTICE_KEY = ['activeNotice'] as const

/**
 * Admin hook: full notice record for editing.
 */
export function useNoticeSettings() {
  return useQuery<Notice>({
    queryKey: NOTICE_KEY,
    queryFn: getNoticeAction,
    staleTime: 60 * 1000,
  })
}

/**
 * Public hook: notice to display, or null when nothing is active.
 */
export function useActiveNotice() {
  return useQuery<Notice | null>({
    queryKey: ACTIVE_NOTICE_KEY,
    queryFn: getActiveNoticeAction,
    staleTime: 5 * 60 * 1000,
  })
}

/**
 * Admin hook: update the notice and refresh both admin and public caches.
 */
export function useUpdateNotice() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (data: UpdateNoticeData) => updateNoticeAction(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: NOTICE_KEY })
      queryClient.invalidateQueries({ queryKey: ACTIVE_NOTICE_KEY })
    },
  })
}
