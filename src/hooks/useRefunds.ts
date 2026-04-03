import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Booking } from '@/types/booking'
import { 
  getPendingRefundsAction, 
  markRefundCompletedAction 
} from '@/actions/bookings'

/**
 * Hook to fetch all pending refunds (for admin)
 * Auto-refreshes every 10 seconds
 */
export function usePendingRefunds() {
  return useQuery<Booking[]>({
    queryKey: ['pendingRefunds'],
    queryFn: getPendingRefundsAction,
    refetchInterval: 10000, // Auto-refresh every 10 seconds
    staleTime: 5000,
    gcTime: 30000,
  })
}

/**
 * Hook to mark a refund as completed (admin action)
 */
export function useMarkRefundCompleted() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ 
      bookingGroupId, 
      legacyBookingId 
    }: { 
      bookingGroupId: string | null
      legacyBookingId: string | null
    }) => markRefundCompletedAction(bookingGroupId, legacyBookingId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pendingRefunds'] })
      queryClient.invalidateQueries({ queryKey: ['allBookings'] })
    },
  })
}
