'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  getCurrentSlotRulesAction,
  listSlotRulesAction,
  createSlotRuleAction,
  updateSlotRuleAction,
  endSlotRuleAction,
  deleteSlotRuleAction,
  previewSlotRuleOverlapAction,
} from '@/actions/slotRules'
import { getAccessToken } from '@/lib/accessToken'
import type { SlotRule, PublicSlotRule, SlotRuleInput } from '@/types/slotRules'

export const SLOT_RULES_QUERY_KEY = ['slotRules'] as const
const ADMIN_SLOT_RULES_KEY = ['slotRules', 'admin'] as const

/** Active + upcoming rules for customer screens. Throws (isError) when they can't be loaded: callers fail closed. */
export function useSlotRules() {
  return useQuery<PublicSlotRule[]>({
    queryKey: SLOT_RULES_QUERY_KEY,
    queryFn: async () => {
      const result = await getCurrentSlotRulesAction()
      if (!result.success) throw new Error(result.error)
      return result.rules
    },
    staleTime: 60 * 1000,
    refetchInterval: 5 * 60 * 1000,
  })
}

/** Every rule, including ended ones (admin Time Slots tab). */
export function useAdminSlotRules() {
  return useQuery<SlotRule[]>({
    queryKey: ADMIN_SLOT_RULES_KEY,
    queryFn: async () => {
      const result = await listSlotRulesAction(await getAccessToken())
      if (!result.success) throw new Error(result.error)
      return result.rules
    },
    staleTime: 30 * 1000,
  })
}

// Prefix key ['slotRules'] also covers the admin list.
function useInvalidateRules() {
  const queryClient = useQueryClient()
  return () => queryClient.invalidateQueries({ queryKey: SLOT_RULES_QUERY_KEY })
}

export function useCreateSlotRule() {
  const invalidate = useInvalidateRules()
  return useMutation({
    mutationFn: async (input: SlotRuleInput) => createSlotRuleAction(await getAccessToken(), input),
    onSuccess: invalidate,
  })
}

export function useUpdateSlotRule() {
  const invalidate = useInvalidateRules()
  return useMutation({
    mutationFn: async ({ id, input }: { id: string; input: SlotRuleInput }) => updateSlotRuleAction(await getAccessToken(), id, input),
    onSuccess: invalidate,
  })
}

export function useEndSlotRule() {
  const invalidate = useInvalidateRules()
  return useMutation({
    mutationFn: async (id: string) => endSlotRuleAction(await getAccessToken(), id),
    onSuccess: invalidate,
  })
}

export function useDeleteSlotRule() {
  const invalidate = useInvalidateRules()
  return useMutation({
    mutationFn: async (id: string) => deleteSlotRuleAction(await getAccessToken(), id),
    onSuccess: invalidate,
  })
}

/** On-demand overlap check for the save review. */
export function usePreviewSlotRuleOverlap() {
  return useMutation({
    mutationFn: async (input: SlotRuleInput) => previewSlotRuleOverlapAction(await getAccessToken(), input),
  })
}
