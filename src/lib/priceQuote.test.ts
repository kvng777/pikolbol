import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createPriceQuote, verifyPriceQuote, QUOTE_TTL_MS } from './priceQuote'
import { SEED_PRICING_RULES } from './pricing'
import type { QuoteInput } from '@/types/pricing'

const input: QuoteInput = {
  date: '2026-12-01', timeSlots: ['18:00-19:00', '17:00-18:00'], players: 2,
  paddles: 1, needsBalls: true, trainingBalls: false,
}
const NOW = 1_800_000_000_000

describe('price quotes', () => {
  beforeEach(() => vi.stubEnv('PRICE_QUOTE_SECRET', 'a'.repeat(64)))
  afterEach(() => vi.unstubAllEnvs())

  it('quotes the amount from the rules', () => {
    const q = createPriceQuote(input, SEED_PRICING_RULES, 'v1', NOW)
    expect(q.amount).toBe(200 + 250 + 50 + 25)
    expect(q.versionId).toBe('v1')
    expect(q.expiresAt).toBe(NOW + QUOTE_TTL_MS)
  })

  it('verifies an untouched quote, regardless of slot order', () => {
    const q = createPriceQuote(input, SEED_PRICING_RULES, 'v1', NOW)
    expect(verifyPriceQuote(q, { ...input, timeSlots: ['17:00-18:00', '18:00-19:00'] }, NOW + 1000)).toEqual({ ok: true })
  })

  it('rejects a changed amount, version, expiry or booking detail', () => {
    const q = createPriceQuote(input, SEED_PRICING_RULES, 'v1', NOW)
    expect(verifyPriceQuote({ ...q, amount: 1 }, input, NOW)).toEqual({ ok: false, reason: 'invalid' })
    expect(verifyPriceQuote({ ...q, versionId: 'v2' }, input, NOW)).toEqual({ ok: false, reason: 'invalid' })
    expect(verifyPriceQuote({ ...q, expiresAt: q.expiresAt + 1 }, input, NOW)).toEqual({ ok: false, reason: 'invalid' })
    expect(verifyPriceQuote(q, { ...input, timeSlots: ['17:00-18:00'] }, NOW)).toEqual({ ok: false, reason: 'invalid' })
    expect(verifyPriceQuote(q, { ...input, paddles: 0 }, NOW)).toEqual({ ok: false, reason: 'invalid' })
    expect(verifyPriceQuote(q, { ...input, date: '2026-12-02' }, NOW)).toEqual({ ok: false, reason: 'invalid' })
    expect(verifyPriceQuote({ ...q, token: 'zz' }, input, NOW)).toEqual({ ok: false, reason: 'invalid' })
  })

  it('rejects an expired quote', () => {
    const q = createPriceQuote(input, SEED_PRICING_RULES, 'v1', NOW)
    expect(verifyPriceQuote(q, input, NOW + QUOTE_TTL_MS + 1)).toEqual({ ok: false, reason: 'expired' })
  })

  it('rejects a malformed quote object', () => {
    expect(verifyPriceQuote(null as never, input, NOW)).toEqual({ ok: false, reason: 'invalid' })
    expect(verifyPriceQuote({ amount: 1.5, versionId: 'v', expiresAt: NOW, token: 'ab' }, input, NOW))
      .toEqual({ ok: false, reason: 'invalid' })
  })

  it('fails closed without a strong secret', () => {
    vi.stubEnv('PRICE_QUOTE_SECRET', 'short')
    expect(() => createPriceQuote(input, SEED_PRICING_RULES, 'v1', NOW)).toThrow(/PRICE_QUOTE_SECRET/)
  })
})
