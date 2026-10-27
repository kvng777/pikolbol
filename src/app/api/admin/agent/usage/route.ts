import { requireAdmin } from '@/lib/agent/auth'
import { getBudgetSummary } from '@/lib/agent/usage'

export async function GET(req: Request) {
  const auth = await requireAdmin(req)
  if (auth instanceof Response) return auth
  return Response.json(await getBudgetSummary())
}
