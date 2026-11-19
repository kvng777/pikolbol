'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  submitPaymentAction,
  getPaymentStatusAction,
  getPendingPaymentsAction,
  confirmPaymentAction,
  rejectPaymentAction,
} from '@/actions/payment'
import { getPaymentSettingsAction } from '@/actions/paymentSettings'
import { getAccessToken } from '@/lib/accessToken'
import { PendingPaymentBooking, PaymentSettings, PaymentStatusSummary } from '@/types/payment'
import type { PriceQuote } from '@/types/pricing'

const CACHE_TIME = 30 * 1000 // 30 seconds for payment-related data

/**
 * Hook to submit payment (creates booking with pending status)
 * Called when user clicks "I've Completed Payment"
 */
export function useSubmitPayment() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      payload,
      quote,
    }: {
      payload: Parameters<typeof submitPaymentAction>[1]
      quote: PriceQuote
    }) => submitPaymentAction((await getAccessToken()) || null, payload, quote),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bookings'] })
      queryClient.invalidateQueries({ queryKey: ['activeBookings'] })
      queryClient.invalidateQueries({ queryKey: ['pendingPayments'] })
    },
  })
}

/**
 * Hook to get payment status for multiple bookings
 */
export function usePaymentStatus(bookingIds: string[]) {
  return useQuery<PaymentStatusSummary[]>({
    queryKey: ['paymentStatus', bookingIds],
    queryFn: () => getPaymentStatusAction(bookingIds),
    enabled: bookingIds.length > 0,
    staleTime: CACHE_TIME,
    refetchInterval: 5000, // Refetch every 5 seconds
  })
}

/**
 * Hook for admin to get pending payments
 */
export function usePendingPayments() {
  return useQuery<PendingPaymentBooking[]>({
    queryKey: ['pendingPayments'],
    queryFn: async () => getPendingPaymentsAction(await getAccessToken()),
    staleTime: CACHE_TIME,
    refetchInterval: 10000, // Auto-refresh every 10 seconds
  })
}

/**
 * Hook for admin to confirm payment
 */
export function useConfirmPayment() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (bookingIds: string[]) => confirmPaymentAction(await getAccessToken(), bookingIds),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pendingPayments'] })
      queryClient.invalidateQueries({ queryKey: ['bookings'] })
      queryClient.invalidateQueries({ queryKey: ['allBookings'] })
      queryClient.invalidateQueries({ queryKey: ['userBookings'] })
    },
  })
}

/**
 * Hook for admin to reject payment
 */
export function useRejectPayment() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ bookingIds, reason }: { bookingIds: string[]; reason?: string }) =>
      rejectPaymentAction(await getAccessToken(), bookingIds, reason),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pendingPayments'] })
      queryClient.invalidateQueries({ queryKey: ['bookings'] })
      queryClient.invalidateQueries({ queryKey: ['allBookings'] })
      queryClient.invalidateQueries({ queryKey: ['userBookings'] })
    },
  })
}

/**
 * Hook to get payment settings
 */
export function usePaymentSettings() {
  return useQuery<PaymentSettings | null>({
    queryKey: ['paymentSettings'],
    queryFn: getPaymentSettingsAction,
    staleTime: 5 * 60 * 1000, // 5 minutes
  })
}
