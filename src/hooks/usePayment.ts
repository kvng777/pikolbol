'use client'

import { useState, useEffect, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  createBookingsWithPaymentAction,
  markPaymentSubmittedAction,
  getPaymentStatusAction,
  getPaymentInfoAction,
  getPendingPaymentsAction,
  confirmPaymentAction,
  rejectPaymentAction,
} from '@/actions/payment'
import { getPaymentSettingsAction } from '@/actions/paymentSettings'
import { getRemainingSeconds, formatRemainingTime } from '@/lib/paymentConfig'
import { Booking } from '@/types/booking'
import { PaymentInfo, PendingPaymentBooking, PaymentSettings } from '@/types/payment'

const CACHE_TIME = 30 * 1000 // 30 seconds for payment-related data

/**
 * Hook to create bookings with payment
 */
export function useCreateBookingWithPayment() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: createBookingsWithPaymentAction,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bookings'] })
      queryClient.invalidateQueries({ queryKey: ['activeBookings'] })
    },
  })
}

/**
 * Hook to mark payment as submitted
 */
export function useMarkPaymentSubmitted() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: markPaymentSubmittedAction,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['paymentStatus'] })
      queryClient.invalidateQueries({ queryKey: ['paymentInfo'] })
      queryClient.invalidateQueries({ queryKey: ['pendingPayments'] })
    },
  })
}

/**
 * Hook to get payment info for a specific booking
 */
export function usePaymentInfo(bookingId: string | undefined) {
  return useQuery<PaymentInfo | null>({
    queryKey: ['paymentInfo', bookingId],
    queryFn: () => (bookingId ? getPaymentInfoAction(bookingId) : null),
    enabled: !!bookingId,
    staleTime: CACHE_TIME,
    refetchInterval: 10000, // Refetch every 10 seconds to check for status changes
  })
}

/**
 * Hook to get payment status for multiple bookings
 */
export function usePaymentStatus(bookingIds: string[]) {
  return useQuery<Booking[]>({
    queryKey: ['paymentStatus', bookingIds],
    queryFn: () => getPaymentStatusAction(bookingIds),
    enabled: bookingIds.length > 0,
    staleTime: CACHE_TIME,
    refetchInterval: 5000, // Refetch every 5 seconds
  })
}

/**
 * Hook for countdown timer
 * Returns remaining time in seconds and formatted string
 */
export function usePaymentCountdown(deadline: Date | string | undefined) {
  const [remainingSeconds, setRemainingSeconds] = useState(0)

  useEffect(() => {
    if (!deadline) {
      setRemainingSeconds(0)
      return
    }

    // Calculate initial remaining time
    const updateRemaining = () => {
      const seconds = getRemainingSeconds(deadline)
      setRemainingSeconds(seconds)
    }

    updateRemaining()

    // Update every second
    const interval = setInterval(updateRemaining, 1000)

    return () => clearInterval(interval)
  }, [deadline])

  const isExpired = remainingSeconds <= 0
  const formattedTime = formatRemainingTime(remainingSeconds)

  return {
    remainingSeconds,
    formattedTime,
    isExpired,
  }
}

/**
 * Hook for admin to get pending payments
 */
export function usePendingPayments() {
  return useQuery<PendingPaymentBooking[]>({
    queryKey: ['pendingPayments'],
    queryFn: getPendingPaymentsAction,
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
    mutationFn: confirmPaymentAction,
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
    mutationFn: ({ bookingIds, reason }: { bookingIds: string[]; reason?: string }) =>
      rejectPaymentAction(bookingIds, reason),
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
