import { supabase } from '@/lib/supabase-server'
import { getProfileByUserId } from '@/lib/profileService'

/**
 * Verify the caller is a signed-in admin.
 * The browser keeps the Supabase session in localStorage (not cookies),
 * so the client must send `Authorization: Bearer <access_token>`.
 * Returns `{ userId }` on success, or a Response to return as-is.
 */
export async function requireAdmin(req: Request): Promise<{ userId: string } | Response> {
  const header = req.headers.get('authorization') ?? ''
  const token = header.startsWith('Bearer ') ? header.slice('Bearer '.length).trim() : ''
  if (!token) return new Response('Unauthorized', { status: 401 })

  const { data, error } = await supabase.auth.getUser(token)
  if (error || !data.user) return new Response('Unauthorized', { status: 401 })

  const profile = await getProfileByUserId(data.user.id)
  if (profile?.role !== 'admin') return new Response('Forbidden', { status: 403 })

  return { userId: data.user.id }
}
