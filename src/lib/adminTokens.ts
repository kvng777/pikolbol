import { createHmac, timingSafeEqual } from 'crypto'

export type TokenPurpose = 'confirm-payment' | 'reschedule-approve' | 'reschedule-reject'

/**
 * Reschedule links emailed before this moment carry the legacy token (HMAC of
 * the bare request id). They are still accepted for requests created before
 * this cutoff. Once those requests are all resolved, this constant and the
 * legacy path can be removed.
 */
export const LEGACY_TOKEN_CUTOFF = '2026-11-21T00:00:00+08:00'

function hmacHex(message: string): string | null {
  const secret = process.env.ADMIN_ACTION_SECRET || ''
  if (!secret) return null
  return createHmac('sha256', secret).update(message).digest('hex')
}

function safeEqualHex(expected: string, token: string): boolean {
  // sha256 hex = 64 chars; reject anything else before comparing
  if (typeof token !== 'string' || token.length !== expected.length) return false
  if (!/^[0-9a-f]+$/i.test(token)) return false
  return timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(token, 'hex'))
}

/** Purpose-scoped token: HMAC-SHA256(secret, `${purpose}:${id}`). Empty string if the secret is missing. */
export function generateAdminToken(purpose: TokenPurpose, id: string): string {
  return hmacHex(`${purpose}:${id}`) ?? ''
}

/** Legacy token (HMAC of the bare id). Only used to verify old emails. */
export function generateLegacyToken(id: string): string {
  return hmacHex(id) ?? ''
}

export function verifyAdminToken(
  purpose: TokenPurpose,
  id: string,
  token: string,
  opts: { allowLegacy?: boolean } = {}
): boolean {
  const expected = hmacHex(`${purpose}:${id}`)
  if (!expected) return false // secret missing: fail closed
  if (safeEqualHex(expected, token)) return true
  if (opts.allowLegacy) {
    const legacy = hmacHex(id)
    if (legacy && safeEqualHex(legacy, token)) return true
  }
  return false
}

/** True if a request created at `createdAt` predates the legacy cutoff. */
export function isBeforeLegacyCutoff(createdAt: string | null | undefined): boolean {
  if (!createdAt) return false
  const t = new Date(createdAt).getTime()
  return Number.isFinite(t) && t < new Date(LEGACY_TOKEN_CUTOFF).getTime()
}
