import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Booking, DisabledSlot, ClosedDate, AdminBookingPayload, RescheduleRequest } from '@/types/booking'
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
  createAdminBookingAction,
  updateAdminBookingAction,
  createRescheduleRequestAction,
  approveRescheduleRequestAction,
  rejectRescheduleRequestAction,
  getPendingRescheduleRequestsAction,
  getHeldRescheduleSlotsByDateAction,
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
 * Hook to create a manual booking (admin only)
 */
export function useCreateAdminBooking() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (payload: AdminBookingPayload) => createAdminBookingAction(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['allBookings'] })
      queryClient.invalidateQueries({ queryKey: ['activeBookings'] })
      queryClient.invalidateQueries({ queryKey: ['bookings'] })
    },
  })
}

/**
 * Hook to update a manual booking group (admin only)
 */
export function useUpdateAdminBooking() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ bookingGroupId, payload }: { bookingGroupId: string; payload: AdminBookingPayload }) =>
      updateAdminBookingAction(bookingGroupId, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['allBookings'] })
      queryClient.invalidateQueries({ queryKey: ['activeBookings'] })
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

/**
 * Hook to create a reschedule request (user action).
 * Does NOT move the booking — admin must approve or reject.
 */
export function useCreateRescheduleRequest() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({
      bookingGroupId,
      legacyBookingId,
      userId,
      newDate,
      newTimeSlots,
    }: {
      bookingGroupId: string | null
      legacyBookingId: string | null
      userId: string
      newDate: string
      newTimeSlots: string[]
    }) => createRescheduleRequestAction(bookingGroupId, legacyBookingId, userId, newDate, newTimeSlots),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['userBookings'] })
      queryClient.invalidateQueries({ queryKey: ['pendingRescheduleRequests'] })
      queryClient.invalidateQueries({ queryKey: ['heldRescheduleSlots'] })
    },
  })
}

/**
 * Hook to approve a pending reschedule request (admin action).
 */
export function useApproveRescheduleRequest() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (requestId: string) => approveRescheduleRequestAction(requestId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pendingRescheduleRequests'] })
      queryClient.invalidateQueries({ queryKey: ['allBookings'] })
      queryClient.invalidateQueries({ queryKey: ['bookings'] })
      queryClient.invalidateQueries({ queryKey: ['activeBookings'] })
      queryClient.invalidateQueries({ queryKey: ['userBookings'] })
      queryClient.invalidateQueries({ queryKey: ['heldRescheduleSlots'] })
    },
  })
}

/**
 * Hook to reject a pending reschedule request (admin action).
 */
export function useRejectRescheduleRequest() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (requestId: string) => rejectRescheduleRequestAction(requestId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pendingRescheduleRequests'] })
      queryClient.invalidateQueries({ queryKey: ['heldRescheduleSlots'] })
    },
  })
}

/**
 * Hook to fetch pending reschedule requests (for admin view).
 */
export function usePendingRescheduleRequests() {
  return useQuery<RescheduleRequest[]>({
    queryKey: ['pendingRescheduleRequests'],
    queryFn: getPendingRescheduleRequestsAction,
    staleTime: 30 * 1000,
    gcTime: 30 * 1000,
    refetchInterval: 10000,
  })
}

/**
 * Hook to fetch time slots held by pending reschedule requests for a given date.
 */
export function useHeldRescheduleSlotsByDate(date: string) {
  return useQuery<string[]>({
    queryKey: ['heldRescheduleSlots', date],
    queryFn: () => getHeldRescheduleSlotsByDateAction(date),
    enabled: !!date,
    staleTime: 30 * 1000,
    gcTime: 30 * 1000,
  })
}
