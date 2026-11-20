import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import {
  generateAdminToken,
  generateLegacyToken,
  verifyAdminToken,
  isBeforeLegacyCutoff,
} from './adminTokens'

const ORIGINAL = process.env.ADMIN_ACTION_SECRET

beforeEach(() => {
  process.env.ADMIN_ACTION_SECRET = 'test-secret'
})
afterEach(() => {
  if (ORIGINAL === undefined) delete process.env.ADMIN_ACTION_SECRET
  else process.env.ADMIN_ACTION_SECRET = ORIGINAL
})

describe('adminTokens', () => {
  it('round trips for each purpose', () => {
    for (const p of ['confirm-payment', 'reschedule-approve', 'reschedule-reject'] as const) {
      expect(verifyAdminToken(p, 'abc', generateAdminToken(p, 'abc'))).toBe(true)
    }
  })

  it('fails for a different purpose', () => {
    const t = generateAdminToken('reschedule-approve', 'abc')
    expect(verifyAdminToken('reschedule-reject', 'abc', t)).toBe(false)
    expect(verifyAdminToken('confirm-payment', 'abc', t)).toBe(false)
  })

  it('fails for a different id', () => {
    const t = generateAdminToken('confirm-payment', 'abc')
    expect(verifyAdminToken('confirm-payment', 'abd', t)).toBe(false)
  })

  it('fails for tampered, wrong-length or non-hex tokens', () => {
    const t = generateAdminToken('confirm-payment', 'abc')
    const flipped = (t[0] === 'a' ? 'b' : 'a') + t.slice(1)
    expect(verifyAdminToken('confirm-payment', 'abc', flipped)).toBe(false)
    expect(verifyAdminToken('confirm-payment', 'abc', t.slice(0, -2))).toBe(false)
    expect(verifyAdminToken('confirm-payment', 'abc', t + '00')).toBe(false)
    expect(verifyAdminToken('confirm-payment', 'abc', 'z'.repeat(t.length))).toBe(false)
    expect(verifyAdminToken('confirm-payment', 'abc', '')).toBe(false)
  })

  it('fails closed when the secret is missing', () => {
    const t = generateAdminToken('confirm-payment', 'abc')
    const legacy = generateLegacyToken('abc')
    delete process.env.ADMIN_ACTION_SECRET
    expect(verifyAdminToken('confirm-payment', 'abc', t)).toBe(false)
    expect(verifyAdminToken('confirm-payment', 'abc', legacy, { allowLegacy: true })).toBe(false)
    expect(verifyAdminToken('confirm-payment', 'abc', '')).toBe(false)
  })

  it('accepts the legacy token only when allowed', () => {
    const legacy = generateLegacyToken('abc')
    expect(verifyAdminToken('reschedule-approve', 'abc', legacy)).toBe(false)
    expect(verifyAdminToken('reschedule-approve', 'abc', legacy, { allowLegacy: false })).toBe(false)
    expect(verifyAdminToken('reschedule-approve', 'abc', legacy, { allowLegacy: true })).toBe(true)
    expect(verifyAdminToken('reschedule-reject', 'abc', legacy, { allowLegacy: true })).toBe(true)
    expect(verifyAdminToken('reschedule-approve', 'other', legacy, { allowLegacy: true })).toBe(false)
  })

  it('isBeforeLegacyCutoff', () => {
    expect(isBeforeLegacyCutoff('2026-11-20T10:00:00Z')).toBe(true)
    expect(isBeforeLegacyCutoff('2026-11-21T10:00:00+08:00')).toBe(false)
    expect(isBeforeLegacyCutoff(null)).toBe(false)
    expect(isBeforeLegacyCutoff('garbage')).toBe(false)
  })
})

