'use server'

import { revalidatePath } from 'next/cache'
import { requireAdmin } from '@/lib/actionAuth'
import { getNotice, updateNotice, isNoticeActive } from '@/lib/noticeService'
import { Notice, UpdateNoticeData, NoticeResult } from '@/types/notice'

/**
 * Get the full site notice record (admin view).
 */
export async function getNoticeAction(accessToken: string): Promise<Notice> {
  await requireAdmin(accessToken)
  return getNotice()
}

/**
 * Get the site notice only if it is currently active (public view).
 * Returns null when there is nothing to display.
 */
export async function getActiveNoticeAction(): Promise<Notice | null> {
  const notice = await getNotice()
  return isNoticeActive(notice) ? notice : null
}

/**
 * Update the site notice (admin only).
 */
export async function updateNoticeAction(accessToken: string, data: UpdateNoticeData): Promise<NoticeResult> {
  await requireAdmin(accessToken)
  const notice = await updateNotice(data)

  if (!notice) {
    return { success: false, error: 'Failed to update notice' }
  }

  revalidatePath('/')
  revalidatePath('/admin')

  return { success: true, notice }
}
