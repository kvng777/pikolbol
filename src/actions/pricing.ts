'use server'

import { revalidatePath } from 'next/cache'
import { requireAdmin } from '@/lib/actionAuth'
import {
  getPricingVersions,
  getPricingForDate,
  createPricingVersion,
  cancelPricingVersion,
} from '@/lib/pricingService'
import { addDaysIso } from '@/lib/pricing'
import { createPriceQuote } from '@/lib/priceQuote'
import { createPricingInputSchema, quoteInputSchema } from '@/lib/pricingSchema'
import { maxPricingEffectiveFrom } from '@/lib/pricing'
import { manilaNow } from '@/lib/agent/dates'
import type { CreatePricingInput, PricingVersion, PriceQuote, QuoteInput } from '@/types/pricing'

const UNAVAILABLE = 'Prices are unavailable right now. Please try again in a moment.'

export type PricingVersionsResult =
  | { success: true; versions: PricingVersion[] }
  | { success: false; error: string }

/**
 * Active price versions (public: drives every price shown in the app).
 */
export async function getPricingVersionsAction(): Promise<PricingVersionsResult> {
  try {
    const versions = await getPricingVersions()
    return { success: true, versions: versions.map((v) => ({ ...v, created_by: null })) }
  } catch (error) {
    console.error('Failed to load pricing versions:', error)
    return { success: false, error: UNAVAILABLE }
  }
}

export type PriceQuoteResult = { success: true; quote: PriceQuote } | { success: false; error: string }

/**
 * Signed quote for the payment screen (public).
 */
export async function getPriceQuoteAction(input: QuoteInput): Promise<PriceQuoteResult> {
  const parsed = quoteInputSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: 'Invalid booking details.' }

  try {
    const version = await getPricingForDate(parsed.data.date)
    return { success: true, quote: createPriceQuote(parsed.data, version.rules, version.id) }
  } catch (error) {
    console.error('Failed to create price quote:', error)
    return { success: false, error: UNAVAILABLE }
  }
}

export type CreatePricingVersionResult =
  | { success: true; version: PricingVersion; appliedNow: boolean }
  | { success: false; error: string }

/**
 * Add a price version (admin only). The server decides "today" (Manila): "now" starts today,
 * "scheduled" must start tomorrow or later (2 years at most). appliedNow tells the caller
 * whether the new prices are already in effect.
 */
export async function createPricingVersionAction(
  accessToken: string,
  input: CreatePricingInput
): Promise<CreatePricingVersionResult> {
  const adminId = await requireAdmin(accessToken)

  const parsed = createPricingInputSchema.safeParse(input)
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? 'Invalid prices' }
  }

  const today = manilaNow().date
  let effectiveFrom = today
  if (parsed.data.mode === 'scheduled') {
    effectiveFrom = parsed.data.effectiveFrom
    if (effectiveFrom < addDaysIso(today, 1)) {
      return { success: false, error: 'Pick tomorrow or a later date (use "Apply now" for today).' }
    }
    if (effectiveFrom > maxPricingEffectiveFrom(today)) {
      return { success: false, error: 'The start date is too far ahead (2 years at most).' }
    }
  }

  const result = await createPricingVersion({ effectiveFrom, rules: parsed.data.rules, createdBy: adminId })
  if (!result.success) return result

  revalidatePath('/')
  revalidatePath('/admin')
  return { success: true, version: result.version, appliedNow: result.version.effective_from === today }
}

/**
 * Cancel an upcoming price version (admin only).
 */
export async function cancelPricingVersionAction(
  accessToken: string,
  id: string
): Promise<{ success: boolean; error?: string }> {
  await requireAdmin(accessToken)
  const result = await cancelPricingVersion(id)

  if (result.success) {
    revalidatePath('/')
    revalidatePath('/admin')
  }
  return result
}
