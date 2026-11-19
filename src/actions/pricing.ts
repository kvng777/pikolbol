'use server'

import { revalidatePath } from 'next/cache'
import { requireAdmin } from '@/lib/actionAuth'
import {
  getPricingVersions,
  getPricingForDate,
  createPricingVersion,
  cancelPricingVersion,
} from '@/lib/pricingService'
import { createPriceQuote } from '@/lib/priceQuote'
import { createPricingVersionSchema, quoteInputSchema } from '@/lib/pricingSchema'
import type { PricingRules, PricingVersion, PriceQuote, QuoteInput } from '@/types/pricing'

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

/**
 * Add a price version (admin only). effectiveFrom = today applies immediately.
 */
export async function createPricingVersionAction(
  accessToken: string,
  input: { effectiveFrom: string; rules: PricingRules }
): Promise<{ success: boolean; error?: string; version?: PricingVersion }> {
  const adminId = await requireAdmin(accessToken)

  const parsed = createPricingVersionSchema.safeParse(input)
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? 'Invalid prices' }
  }

  const result = await createPricingVersion({
    effectiveFrom: parsed.data.effectiveFrom,
    rules: parsed.data.rules,
    createdBy: adminId,
  })

  if (result.success) {
    revalidatePath('/')
    revalidatePath('/admin')
  }
  return result
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
