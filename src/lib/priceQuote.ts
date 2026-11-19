/**
 * Signed price quotes (server only).
 * The payment screen shows quote.amount; on submit the server verifies the
 * signature against the same booking details and saves exactly that amount,
 * so a price change while the customer is paying never changes what they owe.
 */
import { createHmac, timingSafeEqual } from 'crypto'
import { calculatePaymentAmount, QUOTE_TTL_MS } from './pricing'
import type { PricingRules, PriceQuote, QuoteInput } from '@/types/pricing'

export { QUOTE_TTL_MS }

function secret(): string {
  const s = process.env.PRICE_QUOTE_SECRET ?? ''
  if (s.length < 32) throw new Error('PRICE_QUOTE_SECRET is missing or shorter than 32 characters')
  return s
}

function normalize(input: QuoteInput): QuoteInput {
  return {
    date: input.date,
    timeSlots: [...input.timeSlots].sort(),
    players: input.players,
    paddles: Math.max(0, Math.trunc(input.paddles || 0)),
    needsBalls: !!input.needsBalls,
    trainingBalls: !!input.trainingBalls,
  }
}

function canonical(input: QuoteInput, amount: number, versionId: string, expiresAt: number): string {
  const n = normalize(input)
  return JSON.stringify(['v1', n.date, n.timeSlots, n.players, n.paddles, n.needsBalls, n.trainingBalls, amount, versionId, expiresAt])
}

function sign(payload: string): string {
  return createHmac('sha256', secret()).update(payload).digest('hex')
}

export function createPriceQuote(
  input: QuoteInput,
  rules: PricingRules,
  versionId: string,
  now: number = Date.now()
): PriceQuote {
  const n = normalize(input)
  const amount = calculatePaymentAmount(rules, n.timeSlots, n.players, {
    date: n.date,
    paddles: n.paddles,
    needsBalls: n.needsBalls,
    trainingBalls: n.trainingBalls,
  })
  const expiresAt = now + QUOTE_TTL_MS
  return { amount, versionId, expiresAt, token: sign(canonical(n, amount, versionId, expiresAt)) }
}

export type QuoteCheck = { ok: true } | { ok: false; reason: 'invalid' | 'expired' }

export function verifyPriceQuote(quote: PriceQuote, input: QuoteInput, now: number = Date.now()): QuoteCheck {
  if (
    !quote ||
    typeof quote.token !== 'string' ||
    typeof quote.versionId !== 'string' ||
    !Number.isInteger(quote.amount) ||
    quote.amount < 0 ||
    !Number.isFinite(quote.expiresAt)
  ) {
    return { ok: false, reason: 'invalid' }
  }

  const expected = Buffer.from(sign(canonical(input, quote.amount, quote.versionId, quote.expiresAt)), 'hex')
  const given = Buffer.from(quote.token, 'hex')
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) {
    return { ok: false, reason: 'invalid' }
  }
  if (now > quote.expiresAt) return { ok: false, reason: 'expired' }
  return { ok: true }
}
