import { requireAdmin as requireAdminToken, ActionAuthError } from '@/lib/actionAuth'

/**
 * Verify the caller is a signed-in admin.
 * The browser keeps the Supabase session in localStorage (not cookies),
 * so the client must send `Authorization: Bearer <access_token>`.
 * Returns `{ userId }` on success, or a Response to return as-is.
 */
export async function requireAdmin(req: Request): Promise<{ userId: string } | Response> {
  const header = req.headers.get('authorization') ?? ''
  const match = header.match(/^Bearer\s+(.+)$/i)
  const token = match?.[1].trim() ?? ''

  try {
    return { userId: await requireAdminToken(token) }
  } catch (err) {
    if (err instanceof ActionAuthError) {
      return err.code === 'forbidden'
        ? new Response('Forbidden', { status: 403 })
        : new Response('Unauthorized', { status: 401 })
    }
    throw err
  }
}
