'use client'

import { supabase } from './supabase'

/** Current session's access token ('' when signed out). Pass it to protected server actions. */
export async function getAccessToken(): Promise<string> {
  const { data } = await supabase.auth.getSession()
  return data.session?.access_token ?? ''
}
