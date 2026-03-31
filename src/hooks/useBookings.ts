import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Booking, DisabledSlot, ClosedDate } from '@/types/booking'
import { 
  getBookingsByDateAction,
  getActiveBookingsByDateAction,
  getAllBookingsAction,
  getConfirmedBookingsAction,
  getDisabledSlotsByDateAction,
  addDisabledSlotAction,
  removeDisabledSlotAction,
  getAllDisabledSlotsAction,
  getClosedDatesAction,
  addClosedDateAction,
  removeClosedDateAction,
  deleteBookingAction,
  getBookingsByUserIdAction,
  cancelBookingAction,
  cancelBookingGroupAction,
} from '@/actions/bookings'

const CACHE_TIME = 5 * 60 * 1000 // 5 minutes

/**
 * Get ALL bookings by date (regardless of payment status)
 */
export function useBookingsByDate(date: string) {
  return useQuery<Booking[]>({
    queryKey: ['bookings', date],
    queryFn: () => getBookingsByDateAction(date),
    enabled: !!date,
    staleTime: CACHE_TIME,
    gcTime: CACHE_TIME,
  })
}

/**
 * Get ACTIVE bookings by date - only bookings that occupy slots
 * Use this for slot availability checking
 */
export function useActiveBookingsByDate(date: string) {
  return useQuery<Booking[]>({
    queryKey: ['activeBookings', date],
    queryFn: () => getActiveBookingsByDateAction(date),
    enabled: !!date,
    staleTime: 30 * 1000, // 30 seconds - shorter cache for availability
    gcTime: 30 * 1000,
  })
}

/**
 * Get ALL bookings (for admin view)
 */
export function useAllBookings() {
  return useQuery<Booking[]>({
    queryKey: ['allBookings'],
    queryFn: getAllBookingsAction,
    staleTime: CACHE_TIME,
    gcTime: CACHE_TIME,
  })
}

/**
 * Get only CONFIRMED bookings (for admin booking list)
 */
export function useConfirmedBookings() {
  return useQuery<Booking[]>({
    queryKey: ['confirmedBookings'],
    queryFn: getConfirmedBookingsAction,
    staleTime: CACHE_TIME,
    gcTime: CACHE_TIME,
  })
}

export function useDisabledSlotsByDate(date: string) {
  return useQuery<DisabledSlot[]>({
    queryKey: ['disabledSlots', date],
    queryFn: () => getDisabledSlotsByDateAction(date),
    enabled: !!date,
    staleTime: CACHE_TIME,
    gcTime: CACHE_TIME,
  })
}

export function useAllDisabledSlots() {
  return useQuery<DisabledSlot[]>({
    queryKey: ['allDisabledSlots'],
    queryFn: getAllDisabledSlotsAction,
    staleTime: CACHE_TIME,
    gcTime: CACHE_TIME,
  })
}

export function useAddDisabledSlot() {
  const queryClient = useQueryClient()
  
  return useMutation({
    mutationFn: ({ date, timeSlot }: { date: string; timeSlot: string }) => 
      addDisabledSlotAction(date, timeSlot),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['disabledSlots'] })
      queryClient.invalidateQueries({ queryKey: ['allDisabledSlots'] })
      queryClient.invalidateQueries({ queryKey: ['bookings'] })
    },
  })
}

export function useRemoveDisabledSlot() {
  const queryClient = useQueryClient()
  
  return useMutation({
    mutationFn: (id: string) => removeDisabledSlotAction(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['disabledSlots'] })
      queryClient.invalidateQueries({ queryKey: ['allDisabledSlots'] })
      queryClient.invalidateQueries({ queryKey: ['bookings'] })
    },
  })
}

export function useClosedDates() {
  return useQuery<ClosedDate[]>({
    queryKey: ['closedDates'],
    queryFn: getClosedDatesAction,
    staleTime: CACHE_TIME,
    gcTime: CACHE_TIME,
  })
}

export function useAddClosedDate() {
  const queryClient = useQueryClient()
  
  return useMutation({
    mutationFn: ({ startDate, endDate, reason }: { startDate: string; endDate: string; reason: string }) => 
      addClosedDateAction(startDate, endDate, reason),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['closedDates'] })
      queryClient.invalidateQueries({ queryKey: ['bookings'] })
    },
  })
}

export function useRemoveClosedDate() {
  const queryClient = useQueryClient()
  
  return useMutation({
    mutationFn: (id: string) => removeClosedDateAction(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['closedDates'] })
      queryClient.invalidateQueries({ queryKey: ['bookings'] })
    },
  })
}

export function useDeleteBooking() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (id: string) => deleteBookingAction(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['allBookings'] })
      queryClient.invalidateQueries({ queryKey: ['bookings'] })
    },
  })
}

/**
 * Hook to fetch bookings for a specific user
 */
export function useUserBookings(userId: string | undefined) {
  return useQuery<Booking[]>({
    queryKey: ['userBookings', userId],
    queryFn: () => getBookingsByUserIdAction(userId!),
    enabled: !!userId,
    staleTime: CACHE_TIME,
    gcTime: CACHE_TIME,
  })
}

/**
 * Hook to cancel a user's booking (24-hour policy applies)
 * @deprecated Use useCancelBookingGroup instead for proper grouped booking cancellation
 */
export function useCancelBooking() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ bookingId, userId }: { bookingId: string; userId: string }) => 
      cancelBookingAction(bookingId, userId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['userBookings'] })
      queryClient.invalidateQueries({ queryKey: ['allBookings'] })
      queryClient.invalidateQueries({ queryKey: ['bookings'] })
    },
  })
}

/**
 * Hook to cancel a booking group (all slots in the same order)
 * Calculates cancellation fee based on timing:
 * - Free cancellation: > 24 hours before booking
 * - P100/slot fee: <= 24 hours before booking
 */
export function useCancelBookingGroup() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ 
      bookingGroupId, 
      legacyBookingId, 
      userId 
    }: { 
      bookingGroupId: string | null
      legacyBookingId: string | null
      userId: string 
    }) => cancelBookingGroupAction(bookingGroupId, legacyBookingId, userId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['userBookings'] })
      queryClient.invalidateQueries({ queryKey: ['allBookings'] })
      queryClient.invalidateQueries({ queryKey: ['bookings'] })
      queryClient.invalidateQueries({ queryKey: ['activeBookings'] })
      queryClient.invalidateQueries({ queryKey: ['pendingRefunds'] })
    },
  })
}
