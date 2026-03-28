import { useState, useMemo } from 'react'
import { useAdminPage, GroupedBooking } from '@/hooks/useAdminPage'
import { BookingFilterValue, TimeFilterValue, isBookingPast, isBookingToday } from '@/lib/bookingStatus'

export function useAdminTable() {
  const admin = useAdminPage()
  const {
    user,
    authLoading,
    isAdmin,
    handleSignOut,
    // filters / sorting
    handleSort,
    filterDate,
    setFilterDate,
    // tabs / UI state
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
    // data
    allTimeSlots,
    groupedBookings,
    sortedBookings,
    disabledSlotsForDate,
    allDisabledSlots,
    closedDates,
    // actions
    handleDeleteBooking,
    handleDeleteGroupedBooking,
    handleAddDisabledSlots,
    handleRemoveDisabledSlot,
    handleAddClosedDate,
    handleRemoveClosedDate,
    addDisabledSlot,
    addClosedDate,
  } = admin

  // UI state for filters
  const [statusFilter, setStatusFilter] = useState<BookingFilterValue>('all')
  const [timeFilter, setTimeFilter] = useState<TimeFilterValue>('all')
  const [searchQuery, setSearchQuery] = useState<string>('')
  const [page, setPage] = useState<number>(1)
  const pageSize = 10

  // Apply filters
  const filteredBookings = useMemo(() => {
    return sortedBookings.filter((group: GroupedBooking) => {
      // Status filter
      if (statusFilter !== 'all') {
        if (group.payment_status !== statusFilter) return false
      }

      // Time filter
      if (timeFilter !== 'all') {
        const isPast = isBookingPast(group.date)
        const isToday = isBookingToday(group.date)
        
        if (timeFilter === 'upcoming' && (isPast || isToday)) return false
        if (timeFilter === 'today' && !isToday) return false
        if (timeFilter === 'past' && !isPast) return false
      }

      return true
    })
  }, [sortedBookings, statusFilter, timeFilter])

  // Apply search filter
  const normalizedQuery = searchQuery.trim().toLowerCase()
  const searchedBookings = useMemo(() => {
    if (!normalizedQuery) return filteredBookings
    
    return filteredBookings.filter((g: GroupedBooking) => {
      const name = (g.name || '').toLowerCase()
      const phone = (g.phone || '').toString().toLowerCase()
      const email = (g.email || '').toLowerCase()
      return name.includes(normalizedQuery) || 
             phone.includes(normalizedQuery) || 
             email.includes(normalizedQuery)
    })
  }, [filteredBookings, normalizedQuery])

  // Pagination
  const totalPages = Math.max(1, Math.ceil(searchedBookings.length / pageSize))
  const currentPage = Math.min(page, totalPages)
  const startIdx = (currentPage - 1) * pageSize
  const pagedBookings = searchedBookings.slice(startIdx, startIdx + pageSize)

  // Helpers (update state and reset page when needed)
  const setStatusFilterAndReset = (filter: BookingFilterValue) => {
    setStatusFilter(filter)
    setPage(1)
  }

  const setTimeFilterAndReset = (filter: TimeFilterValue) => {
    setTimeFilter(filter)
    setPage(1)
  }

  const setSearchQueryAndReset = (q: string) => {
    setSearchQuery(q)
    setPage(1)
  }

  const setFilterDateAndReset = (d: string) => {
    setFilterDate(d)
    setPage(1)
  }

  return {
    // admin data & actions
    user,
    authLoading,
    isAdmin,
    handleSignOut,
    handleSort,
    filterDate,
    setFilterDate: setFilterDateAndReset,
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
    allTimeSlots,
    groupedBookings,
    sortedBookings,
    disabledSlotsForDate,
    allDisabledSlots,
    closedDates,
    handleDeleteBooking,
    handleDeleteGroupedBooking,
    handleAddDisabledSlots,
    handleRemoveDisabledSlot,
    handleAddClosedDate,
    handleRemoveClosedDate,
    addDisabledSlot,
    addClosedDate,

    // UI state - filters
    statusFilter,
    setStatusFilter: setStatusFilterAndReset,
    timeFilter,
    setTimeFilter: setTimeFilterAndReset,
    searchQuery,
    setSearchQuery: setSearchQueryAndReset,
    page,
    setPage,
    pageSize,

    // computed
    filteredBookings: searchedBookings,
    pagedBookings,
    totalPages,
    currentPage,
    startIdx,
  }
}

export type TableUI = ReturnType<typeof useAdminTable>
