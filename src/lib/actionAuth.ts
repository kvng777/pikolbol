import { supabase } from './supabase-server'
import { getProfileByUserId } from './profileService'

/**
 * Server-side caller checks for server actions.
 * The browser keeps the Supabase session in localStorage (not cookies), so
 * protected actions take the caller's access token as their first argument.
 */
export class ActionAuthError extends Error {
  constructor(public code: 'unauthorized' | 'forbidden') {
    super(code === 'unauthorized' ? 'Please sign in again.' : 'You do not have access to this action.')
    this.name = 'ActionAuthError'
  }
}

/** Verified user id for the token, or null (no token / invalid / expired). */
export async function getUserIdFromToken(accessToken: string | null | undefined): Promise<string | null> {
  const token = accessToken?.trim()
  if (!token) return null
  const { data, error } = await supabase.auth.getUser(token)
  if (error || !data.user) return null
  return data.user.id
}

export async function requireUser(accessToken: string | null | undefined): Promise<string> {
  const userId = await getUserIdFromToken(accessToken)
  if (!userId) throw new ActionAuthError('unauthorized')
  return userId
}

export async function requireAdmin(accessToken: string | null | undefined): Promise<string> {
  const userId = await requireUser(accessToken)
  const profile = await getProfileByUserId(userId)
  if (profile?.role !== 'admin') throw new ActionAuthError('forbidden')
  return userId
}
