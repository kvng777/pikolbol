'use server'

import { revalidatePath } from 'next/cache'
import { requireAdmin } from '@/lib/actionAuth'
import {
  listSlotRules,
  listCurrentSlotRules,
  createSlotRule,
  updateSlotRule,
  endSlotRule,
  deleteSlotRule,
  findBookingsOverlappingRule,
  AVAILABILITY_UNAVAILABLE,
  type SlotRuleResult,
  type EndSlotRuleResult,
} from '@/lib/slotRulesService'
import { slotRuleInputSchema } from '@/lib/slotRulesSchema'
import { manilaNow } from '@/lib/agent/dates'
import type { SlotRule, PublicSlotRule, RuleOverlapResult } from '@/types/slotRules'

export type PublicSlotRulesResult = { success: true; rules: PublicSlotRule[] } | { success: false; error: string }
export type SlotRulesListResult = { success: true; rules: SlotRule[] } | { success: false; error: string }
export type SlotRuleOverlapResult = ({ success: true } & RuleOverlapResult) | { success: false; error: string }

function refresh() {
  revalidatePath('/')
  revalidatePath('/admin')
}

/** Active and upcoming rules (public: drives slot availability on customer screens). No audit fields. */
export async function getCurrentSlotRulesAction(): Promise<PublicSlotRulesResult> {
  try {
    return { success: true, rules: await listCurrentSlotRules(manilaNow().date) }
  } catch (error) {
    console.error('Failed to load slot rules:', error)
    return { success: false, error: AVAILABILITY_UNAVAILABLE }
  }
}

/** Every rule, including ended ones (admin). */
export async function listSlotRulesAction(accessToken: string): Promise<SlotRulesListResult> {
  await requireAdmin(accessToken)
  try {
    return { success: true, rules: await listSlotRules() }
  } catch {
    return { success: false, error: AVAILABILITY_UNAVAILABLE }
  }
}

export async function createSlotRuleAction(accessToken: string, input: unknown): Promise<SlotRuleResult> {
  const adminId = await requireAdmin(accessToken)
  const result = await createSlotRule(input, adminId)
  if (result.success) refresh()
  return result
}

export async function updateSlotRuleAction(accessToken: string, id: string, input: unknown): Promise<SlotRuleResult> {
  await requireAdmin(accessToken)
  const result = await updateSlotRule(id, input)
  if (result.success) refresh()
  return result
}

export async function endSlotRuleAction(accessToken: string, id: string): Promise<EndSlotRuleResult> {
  await requireAdmin(accessToken)
  const result = await endSlotRule(id)
  if (result.success) refresh()
  return result
}

export async function deleteSlotRuleAction(accessToken: string, id: string): Promise<{ success: boolean; error?: string }> {
  await requireAdmin(accessToken)
  const result = await deleteSlotRule(id)
  if (result.success) refresh()
  return result
}

/** Existing bookings a rule would cover (shown before saving). `truncated` means the list may be incomplete. */
export async function previewSlotRuleOverlapAction(accessToken: string, input: unknown): Promise<SlotRuleOverlapResult> {
  await requireAdmin(accessToken)
  const parsed = slotRuleInputSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? 'Invalid rule' }
  try {
    const { bookings, truncated } = await findBookingsOverlappingRule(parsed.data)
    return { success: true, bookings, truncated }
  } catch (error) {
    console.error('Failed to check rule overlap:', error)
    return { success: false, error: AVAILABILITY_UNAVAILABLE }
  }
}
