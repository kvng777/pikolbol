import { requireAdmin } from '@/lib/agent/auth'
import { getBudgetSummary } from '@/lib/agent/usage'

export async function GET(req: Request) {
  const auth = await requireAdmin(req)
  if (auth instanceof Response) return auth
  try {
    return Response.json(await getBudgetSummary())
  } catch (error) {
    console.error('Failed to load agent usage:', error)
    return Response.json({ error: 'budget_unavailable' }, { status: 503 })
  }
}
