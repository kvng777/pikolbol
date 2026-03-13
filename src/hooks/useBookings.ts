import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Booking, DisabledSlot, ClosedDate } from '@/types/booking'
import { 
  getBookingsByDateAction, 
  getAllBookingsAction,
  getDisabledSlotsByDateAction,
  addDisabledSlotAction,
  removeDisabledSlotAction,
  getAllDisabledSlotsAction,
  getClosedDatesAction,
  addClosedDateAction,
  removeClosedDateAction,
  deleteBookingAction,
} from '@/actions/bookings'

const CACHE_TIME = 5 * 60 * 1000 // 5 minutes

export function useBookingsByDate(date: string) {
  return useQuery<Booking[]>({
    queryKey: ['bookings', date],
    queryFn: () => getBookingsByDateAction(date),
    enabled: !!date,
    staleTime: CACHE_TIME,
    gcTime: CACHE_TIME,
  })
}

export function useAllBookings() {
  return useQuery<Booking[]>({
    queryKey: ['allBookings'],
    queryFn: getAllBookingsAction,
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
