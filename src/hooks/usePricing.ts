'use client'

import { useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  getPricingVersionsAction,
  getPriceQuoteAction,
  createPricingVersionAction,
  cancelPricingVersionAction,
} from '@/actions/pricing'
import { getAccessToken } from '@/lib/accessToken'
import { pickPricingVersion, QUOTE_REFRESH_MS } from '@/lib/pricing'
import type { PricingRules, PricingVersion, PriceQuote, QuoteInput } from '@/types/pricing'

export const PRICING_QUERY_KEY = ['pricing'] as const
const QUOTE_QUERY_KEY = 'priceQuote'

/** All active price versions. */
export function usePricingVersions() {
  return useQuery<PricingVersion[]>({
    queryKey: PRICING_QUERY_KEY,
    queryFn: async () => {
      const result = await getPricingVersionsAction()
      if (!result.success) throw new Error(result.error)
      return result.versions
    },
    staleTime: 60 * 1000,
  })
}

/** The version (and rules) that price a play date. rules is null while loading or on error. */
export function usePricingForDate(date: string) {
  const query = usePricingVersions()
  const version = useMemo(
    () => (query.data ? pickPricingVersion(query.data, date) : null),
    [query.data, date]
  )
  return {
    version,
    rules: (version?.rules ?? null) as PricingRules | null,
    isLoading: query.isLoading,
    error: query.error,
  }
}

/**
 * Signed quote for the payment screen. Disabled while input is null.
 * Refreshed before it expires (QUOTE_REFRESH_MS) so an open screen never submits an expired quote;
 * a tab that slept past that refetches on focus.
 */
export function usePriceQuote(input: QuoteInput | null) {
  return useQuery<PriceQuote>({
    queryKey: [QUOTE_QUERY_KEY, input],
    queryFn: async () => {
      const result = await getPriceQuoteAction(input as QuoteInput)
      if (!result.success) throw new Error(result.error)
      return result.quote
    },
    enabled: !!input,
    staleTime: QUOTE_REFRESH_MS,
    refetchInterval: QUOTE_REFRESH_MS,
    refetchIntervalInBackground: true,
    refetchOnWindowFocus: true, // only refetches once stale (after QUOTE_REFRESH_MS)
    gcTime: 0,
    retry: 1,
  })
}

/** Admin: add a price version (apply now or schedule). */
export function useCreatePricingVersion() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: { effectiveFrom: string; rules: PricingRules }) =>
      createPricingVersionAction(await getAccessToken(), input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: PRICING_QUERY_KEY })
    },
  })
}

/** Admin: cancel an upcoming price version. */
export function useCancelPricingVersion() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => cancelPricingVersionAction(await getAccessToken(), id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: PRICING_QUERY_KEY })
    },
  })
}
