import { requireAdmin } from '@/lib/agent/auth'
import { getThreadOwner, loadThreadMessages } from '@/lib/agent/history'

export async function GET(req: Request) {
  const auth = await requireAdmin(req)
  if (auth instanceof Response) return auth

  const threadId = new URL(req.url).searchParams.get('id')
  if (!threadId) return new Response('Missing id', { status: 400 })

  const owner = await getThreadOwner(threadId)
  if (owner === null) return Response.json({ messages: [] }) // new thread, nothing yet
  if (owner !== auth.userId) return new Response('Forbidden', { status: 403 })

  return Response.json({ messages: await loadThreadMessages(threadId) })
}
