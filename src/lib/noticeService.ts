/**
 * Site Notice Service
 * CRUD operations and activity logic for the site-wide announcement banner.
 * Single-row config table (mirrors paymentSettingsService).
 */

import { supabase } from './supabase-server'
import { Notice, UpdateNoticeData } from '@/types/notice'

const DEFAULT_NOTICE: Notice = {
  id: '',
  title: '',
  message: '',
  is_enabled: false,
  auto_close_seconds: 10,
  start_date: null,
  end_date: null,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
}

/**
 * Get the current date in Philippines timezone (UTC+8) as a 'YYYY-MM-DD' string.
 */
function getPhilippinesToday(): string {
  // 'en-CA' yields ISO-style YYYY-MM-DD formatting
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Manila',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())
}

/**
 * Get the current site notice.
 * Returns a disabled default if no row exists yet.
 */
export async function getNotice(): Promise<Notice> {
  const { data, error } = await supabase
    .from('site_notice')
    .select('*')
    .limit(1)
    .single()

  if (error) {
    if (error.code === 'PGRST116') {
      // No row yet - return a disabled default
      return DEFAULT_NOTICE
    }
    console.error('Error fetching site notice:', error)
    return DEFAULT_NOTICE
  }

  return data
}

/**
 * Update the site notice (upsert - creates the row if it doesn't exist).
 */
export async function updateNotice(updates: UpdateNoticeData): Promise<Notice | null> {
  const existing = await getNotice()

  if (existing.id) {
    const { data, error } = await supabase
      .from('site_notice')
      .update(updates)
      .eq('id', existing.id)
      .select()
      .single()

    if (error) {
      console.error('Error updating site notice:', error)
      return null
    }

    return data
  }

  const { data, error } = await supabase
    .from('site_notice')
    .insert(updates)
    .select()
    .single()

  if (error) {
    console.error('Error creating site notice:', error)
    return null
  }

  return data
}

/**
 * Determine whether a notice should currently be displayed to visitors.
 * Active when enabled, has content, and today (PH) falls within the optional
 * start/end date window (inclusive). Null bounds mean "no limit".
 */
export function isNoticeActive(notice: Notice | null): boolean {
  if (!notice || !notice.is_enabled) return false
  if (!notice.title.trim() && !notice.message.trim()) return false

  const today = getPhilippinesToday()

  if (notice.start_date && today < notice.start_date) return false
  if (notice.end_date && today > notice.end_date) return false

  return true
}
