import { requireAdmin } from '@/lib/agent/auth'
import { listThreads } from '@/lib/agent/history'

/** The signed-in admin's own previous chats (never another admin's). */
export async function GET(req: Request) {
  const auth = await requireAdmin(req)
  if (auth instanceof Response) return auth
  try {
    return Response.json({ threads: await listThreads(auth.userId) })
  } catch (error) {
    console.error('Failed to list agent threads:', error)
    return Response.json({ error: 'threads_unavailable' }, { status: 500 })
  }
}
