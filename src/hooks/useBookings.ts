import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Booking, DisabledSlot, ClosedDate, AdminBookingPayload, RescheduleRequest, SlotOccupancy } from '@/types/booking'
import { 
  getActiveBookingsByDateAction,
  getAllBookingsAction,
  getDisabledSlotsByDateAction,
  addDisabledSlotAction,
  removeDisabledSlotAction,
  getAllDisabledSlotsAction,
  getClosedDatesAction,
  addClosedDateAction,
  removeClosedDateAction,
  deleteBookingAction,
  getMyBookingsAction,
  getMyPendingRescheduleRequestsAction,
  cancelBookingGroupAction,
  createAdminBookingAction,
  updateAdminBookingAction,
  createRescheduleRequestAction,
  approveRescheduleRequestAction,
  rejectRescheduleRequestAction,
  getPendingRescheduleRequestsAction,
  getHeldRescheduleSlotsByDateAction,
} from '@/actions/bookings'
import { getAccessToken } from '@/lib/accessToken'

const CACHE_TIME = 5 * 60 * 1000 // 5 minutes

/**
 * Get ACTIVE bookings by date - only bookings that occupy slots
 * Use this for slot availability checking
 */
export function useActiveBookingsByDate(date: string) {
  return useQuery<SlotOccupancy[]>({
    queryKey: ['activeBookings', date],
    queryFn: () => getActiveBookingsByDateAction(date),
    enabled: !!date,
    staleTime: 30 * 1000, // 30 seconds - shorter cache for availability
    gcTime: 30 * 1000,
  })
}

/**
 * Get ALL bookings (for admin view)
 * Refetches on mount and tab focus (no polling: each fetch is the whole table).
 */
export function useAllBookings() {
  return useQuery<Booking[]>({
    queryKey: ['allBookings'],
    queryFn: async () => getAllBookingsAction(await getAccessToken()),
    staleTime: 0,
    gcTime: CACHE_TIME,
    refetchOnWindowFocus: true,
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
    queryFn: async () => getAllDisabledSlotsAction(await getAccessToken()),
    staleTime: CACHE_TIME,
    gcTime: CACHE_TIME,
  })
}

export function useAddDisabledSlot() {
  const queryClient = useQueryClient()
  
  return useMutation({
    mutationFn: async ({ date, timeSlot }: { date: string; timeSlot: string }) =>
      addDisabledSlotAction(await getAccessToken(), date, timeSlot),
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
    mutationFn: async (id: string) => removeDisabledSlotAction(await getAccessToken(), id),
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
    mutationFn: async ({ startDate, endDate, reason }: { startDate: string; endDate: string; reason: string }) =>
      addClosedDateAction(await getAccessToken(), startDate, endDate, reason),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['closedDates'] })
      queryClient.invalidateQueries({ queryKey: ['bookings'] })
    },
  })
}

export function useRemoveClosedDate() {
  const queryClient = useQueryClient()
  
  return useMutation({
    mutationFn: async (id: string) => removeClosedDateAction(await getAccessToken(), id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['closedDates'] })
      queryClient.invalidateQueries({ queryKey: ['bookings'] })
    },
  })
}

export function useDeleteBooking() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (id: string) => deleteBookingAction(await getAccessToken(), id),
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
    mutationFn: async (payload: AdminBookingPayload) => createAdminBookingAction(await getAccessToken(), payload),
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
    mutationFn: async ({ bookingGroupId, payload }: { bookingGroupId: string; payload: AdminBookingPayload }) =>
      updateAdminBookingAction(await getAccessToken(), bookingGroupId, payload),
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
    queryFn: async () => getMyBookingsAction(await getAccessToken()),
    enabled: !!userId,
    staleTime: CACHE_TIME,
    gcTime: CACHE_TIME,
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
    mutationFn: async ({
      bookingGroupId,
      legacyBookingId,
    }: {
      bookingGroupId: string | null
      legacyBookingId: string | null
    }) => cancelBookingGroupAction(await getAccessToken(), bookingGroupId, legacyBookingId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['userBookings'] })
      queryClient.invalidateQueries({ queryKey: ['allBookings'] })
      queryClient.invalidateQueries({ queryKey: ['bookings'] })
      queryClient.invalidateQueries({ queryKey: ['activeBookings'] })
      queryClient.invalidateQueries({ queryKey: ['pendingRefunds'] })
      queryClient.invalidateQueries({ queryKey: ['pendingRescheduleRequests'] })
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
    mutationFn: async ({
      bookingGroupId,
      legacyBookingId,
      newDate,
      newTimeSlots,
    }: {
      bookingGroupId: string | null
      legacyBookingId: string | null
      newDate: string
      newTimeSlots: string[]
    }) => createRescheduleRequestAction(await getAccessToken(), bookingGroupId, legacyBookingId, newDate, newTimeSlots),
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
    mutationFn: async (requestId: string) => approveRescheduleRequestAction(await getAccessToken(), requestId),
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
    mutationFn: async (requestId: string) => rejectRescheduleRequestAction(await getAccessToken(), requestId),
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
    queryFn: async () => getPendingRescheduleRequestsAction(await getAccessToken()),
    staleTime: 30 * 1000,
    gcTime: 30 * 1000,
    refetchInterval: 10000,
  })
}

/**
 * Hook to fetch the signed-in user's pending reschedule requests (profile page).
 */
export function useMyPendingRescheduleRequests(userId: string | undefined) {
  return useQuery<RescheduleRequest[]>({
    queryKey: ['pendingRescheduleRequests', 'mine', userId],
    queryFn: async () => getMyPendingRescheduleRequestsAction(await getAccessToken()),
    enabled: !!userId,
    staleTime: 30 * 1000,
    gcTime: 30 * 1000,
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
