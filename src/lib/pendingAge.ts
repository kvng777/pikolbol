const HOUR_MS = 60 * 60 * 1000

/** "Waiting 2h" / "Waiting 1d+" for submissions older than 60 minutes; null otherwise. */
export function pendingAgeLabel(createdAt: string | null | undefined, now: Date): string | null {
  if (!createdAt) return null
  const t = new Date(createdAt).getTime()
  if (!Number.isFinite(t)) return null
  const age = now.getTime() - t
  if (age <= HOUR_MS) return null
  const hours = Math.floor(age / HOUR_MS)
  return hours >= 24 ? 'Waiting 1d+' : `Waiting ${hours}h`
}
