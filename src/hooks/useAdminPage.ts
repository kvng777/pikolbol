import { useState, useEffect, useMemo } from 'react'
import { format, addDays } from 'date-fns'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { generateTimeSlots } from '@/lib/timeSlotGenerator'
import { deleteBookingAction } from '@/actions/bookings'
import { useAuth } from '@/components/AuthProvider'
import {
  useAllBookings,
  useAllDisabledSlots,
  useAddDisabledSlot,
  useRemoveDisabledSlot,
  useClosedDates,
  useAddClosedDate,
  useRemoveClosedDate,
} from '@/hooks/useBookings'
import { Booking } from '@/types/booking'
import { PaymentStatus } from '@/types/payment'
import { BookingFilterValue, TimeFilterValue } from '@/lib/bookingStatus'

type SortField = 'date' | 'time_slot' | 'name' | 'created_at' | 'payment_status'
type SortOrder = 'asc' | 'desc'

export interface GroupedBooking {
  key: string
  name: string
  email: string
  phone: string
  date: string
  timeSlots: string[]
  bookingIds: string[]
  created_at: string
  players?: number
  payment_status: PaymentStatus | null
  payment_amount?: number
}

export function useAdminPage() {
  const { user, loading: authLoading, isAdmin, signOut } = useAuth()
  const router = useRouter()
  const { data: bookings = [], isLoading: bookingsLoading, refetch } = useAllBookings()
  const { data: allDisabledSlots = [], refetch: refetchDisabledSlots } = useAllDisabledSlots()
  const { data: closedDates = [], refetch: refetchClosedDates } = useClosedDates()
  const addDisabledSlot = useAddDisabledSlot()
  const removeDisabledSlot = useRemoveDisabledSlot()
  const addClosedDate = useAddClosedDate()
  const removeClosedDate = useRemoveClosedDate()

  const [sortField, setSortField] = useState<SortField>('date')
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc')
  const [filterDate, setFilterDate] = useState<string>('')

  const [activeTab, setActiveTab] = useState<'bookings' | 'slots' | 'closed' | 'payments' | 'settings'>('bookings')
  const [selectedDateForSlots, setSelectedDateForSlots] = useState<string>(format(new Date(), 'yyyy-MM-dd'))
  const [selectedSlots, setSelectedSlots] = useState<string[]>([])
  const [closeStartDate, setCloseStartDate] = useState<string>(format(new Date(), 'yyyy-MM-dd'))
  const [closeEndDate, setCloseEndDate] = useState<string>(format(addDays(new Date(), 1), 'yyyy-MM-dd'))
  const [closeReason, setCloseReason] = useState<string>('')

  useEffect(() => {
    if (!authLoading) {
      if (!user) {
        // Not logged in - redirect to login
        router.push('/admin/login')
      } else if (!isAdmin) {
        // Logged in but not admin - redirect to home
        toast.error('Access denied. Admin privileges required.')
        router.push('/')
      }
    }
  }, [user, authLoading, isAdmin, router])

  const handleSignOut = async () => {
    await signOut()
    router.push('/admin/login')
  }

  const allTimeSlots = generateTimeSlots()

  const groupedBookings = useMemo(() => {
    const filtered = bookings.filter((booking) => {
      if (!filterDate) return true
      return booking.date === filterDate
    })

    const groups = new Map<string, GroupedBooking>()

    filtered.forEach((booking: Booking) => {
      // Group by user + date + payment_status (same user may have multiple bookings with different statuses)
      const key = `${booking.name}-${booking.email}-${booking.phone}-${booking.date}-${booking.payment_status}`
      
      if (groups.has(key)) {
        const group = groups.get(key)!
        group.timeSlots.push(booking.time_slot)
        group.bookingIds.push(booking.id)
      } else {
        groups.set(key, {
          key,
          name: booking.name,
          email: booking.email,
          phone: booking.phone,
          date: booking.date,
          timeSlots: [booking.time_slot],
          bookingIds: [booking.id],
          created_at: booking.created_at,
          players: booking.players,
          payment_status: booking.payment_status || null,
          payment_amount: booking.payment_amount ?? undefined,
        })
      }
    })

    groups.forEach((group) => {
      group.timeSlots.sort()
    })

    return Array.from(groups.values())
  }, [bookings, filterDate])

  const sortedBookings = useMemo(() => {
    return [...groupedBookings].sort((a, b) => {
      let comparison = 0
      switch (sortField) {
        case 'date':
          comparison = a.date.localeCompare(b.date)
          break
        case 'time_slot':
          comparison = (a.timeSlots[0] || '').localeCompare(b.timeSlots[0] || '')
          break
        case 'name':
          comparison = a.name.localeCompare(b.name)
          break
        case 'created_at':
          comparison = new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
          break
      }
      return sortOrder === 'asc' ? comparison : -comparison
    })
  }, [groupedBookings, sortField, sortOrder])

  const disabledSlotsForDate = useMemo(() => {
    return allDisabledSlots.filter(s => s.date === selectedDateForSlots)
  }, [allDisabledSlots, selectedDateForSlots])

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')
    } else {
      setSortField(field)
      setSortOrder('asc')
    }
  }

  const handleDeleteBooking = async (id: string) => {
    if (!confirm('Are you sure you want to delete this booking?')) return
    const result = await deleteBookingAction(id)
    if (result.success) {
      toast.success('Booking deleted')
      refetch()
    } else {
      toast.error(result.error || 'Failed to delete')
    }
  }

  const handleDeleteGroupedBooking = async (bookingIds: string[]) => {
    const slotCount = bookingIds.length
    const message = slotCount === 1 
      ? 'Are you sure you want to delete this booking?' 
      : `Are you sure you want to delete all ${slotCount} time slots for this booking?`

    if (!confirm(message)) return

    let successCount = 0
    for (const id of bookingIds) {
      const result = await deleteBookingAction(id)
      if (result.success) successCount++
    }

    if (successCount === slotCount) {
      toast.success(slotCount === 1 ? 'Booking deleted' : `All ${slotCount} bookings deleted`)
      refetch()
    } else if (successCount > 0) {
      toast.success(`${successCount} of ${slotCount} bookings deleted`)
      refetch()
    } else {
      toast.error('Failed to delete bookings')
    }
  }

  const handleAddDisabledSlots = async () => {
    if (!selectedDateForSlots || selectedSlots.length === 0) {
      toast.error('Please select a date and at least one time slot')
      return
    }

    for (const slot of selectedSlots) {
      await addDisabledSlot.mutateAsync({ date: selectedDateForSlots, timeSlot: slot })
    }
    toast.success('Time slots disabled')
    setSelectedSlots([])
    refetchDisabledSlots()
  }

  const handleRemoveDisabledSlot = async (id: string) => {
    const result = await removeDisabledSlot.mutateAsync(id)
    if (result.success) {
      toast.success('Time slot enabled')
      refetchDisabledSlots()
    } else {
      toast.error(result.error || 'Failed to enable slot')
    }
  }

  const handleAddClosedDate = async () => {
    if (!closeStartDate || !closeEndDate) {
      toast.error('Please select start and end dates')
      return
    }

    const result = await addClosedDate.mutateAsync({ 
      startDate: closeStartDate, 
      endDate: closeEndDate, 
      reason: closeReason 
    })
    if (result.success) {
      toast.success('Date range closed')
      refetchClosedDates()
      setCloseReason('')
    } else {
      toast.error(result.error || 'Failed to close dates')
    }
  }

  const handleRemoveClosedDate = async (id: string) => {
    const result = await removeClosedDate.mutateAsync(id)
    if (result.success) {
      toast.success('Date range opened')
      refetchClosedDates()
    } else {
      toast.error(result.error || 'Failed to open dates')
    }
  }

  const toggleSlotSelection = (slot: string) => {
    setSelectedSlots(prev => 
      prev.includes(slot) 
        ? prev.filter(s => s !== slot)
        : [...prev, slot]
    )
  }

  return {
    // auth
    user,
    authLoading,
    isAdmin,
    handleSignOut,
    // data
    bookings,
    bookingsLoading,
    refetch,
    allDisabledSlots,
    refetchDisabledSlots,
    closedDates,
    refetchClosedDates,
    // ui state
    sortField,
    sortOrder,
    handleSort,
    filterDate,
    setFilterDate,
    activeTab,
    setActiveTab,
    selectedDateForSlots,
    setSelectedDateForSlots,
    selectedSlots,
    toggleSlotSelection,
    closeStartDate,
    setCloseStartDate,
    closeEndDate,
    setCloseEndDate,
    closeReason,
    setCloseReason,
    // derived
    allTimeSlots,
    groupedBookings,
    sortedBookings,
    disabledSlotsForDate,
    // actions
    handleDeleteBooking,
    handleDeleteGroupedBooking,
    handleAddDisabledSlots,
    handleRemoveDisabledSlot,
    handleAddClosedDate,
    handleRemoveClosedDate,
    addDisabledSlot,
    removeDisabledSlot,
    addClosedDate,
    removeClosedDate,
  }
}
