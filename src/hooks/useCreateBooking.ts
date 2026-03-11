'use client'

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { BookingFormData, CreateBookingResult } from '@/types/booking'
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
