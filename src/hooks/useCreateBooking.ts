'use client'

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Booking, BookingFormData, CreateBookingResult } from '@/types/booking'
import { createBookingAction } from '@/actions/bookings'

export function useCreateBooking() {
  const queryClient = useQueryClient()

  return useMutation<CreateBookingResult, Error, BookingFormData>({
    mutationFn: async (data: BookingFormData) => {
      return createBookingAction(data)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bookings'] })
      queryClient.invalidateQueries({ queryKey: ['allBookings'] })
    },
  })
}

export function useCreateBookings() {
  const queryClient = useQueryClient()

  return useMutation<
    { success: boolean; bookings?: Booking[]; error?: string },
    Error,
    {
      name: string
      phone: string
      email: string
      date: string
      timeSlots: string[]
      courtNumber: number
      players?: number
    }
  >({
    mutationFn: async (data: {
      name: string
      phone: string
      email: string
      date: string
      timeSlots: string[]
      courtNumber: number
      players?: number
    }) => {
      return (await import('@/actions/bookings')).createBookingsAction(data)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bookings'] })
      queryClient.invalidateQueries({ queryKey: ['allBookings'] })
    },
  })
}
