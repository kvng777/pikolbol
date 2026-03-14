import { useState } from 'react'
import { useAdminPage } from '@/hooks/useAdminPage'

export function useAdminTable() {
  const admin = useAdminPage()
  const {
    user,
    authLoading,
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

  const today = new Date()
  today.setHours(0, 0, 0, 0)

  // UI state
  const [filterMode, setFilterMode] = useState<'all' | 'incoming' | 'passed'>('all')
  const [searchQuery, setSearchQuery] = useState<string>('')
  const [page, setPage] = useState<number>(1)
  const pageSize = 10

  // Apply filter mode (incoming/past) on sortedBookings
  const filteredBookings = sortedBookings.filter((group) => {
    const groupDate = new Date(group.date + 'T00:00:00')
    const isPast = groupDate < today
    if (filterMode === 'all') return true
    if (filterMode === 'incoming') return !isPast
    if (filterMode === 'passed') return isPast
    return true
  })

  // apply search filter (name or phone) if provided
  const normalizedQuery = searchQuery.trim().toLowerCase()
  const searchedBookings = normalizedQuery
    ? filteredBookings.filter((g) => {
        const name = (g.name || '').toLowerCase()
        const phone = (g.phone || '').toString().toLowerCase()
        return name.includes(normalizedQuery) || phone.includes(normalizedQuery)
      })
    : filteredBookings

  const totalPages = Math.max(1, Math.ceil(searchedBookings.length / pageSize))
  const currentPage = Math.min(page, totalPages)
  const startIdx = (currentPage - 1) * pageSize
  const pagedBookings = searchedBookings.slice(startIdx, startIdx + pageSize)

  // Helpers (update state and reset page when needed)
  const setFilterModeAndReset = (mode: 'all' | 'incoming' | 'passed') => {
    setFilterMode(mode)
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

    // UI state
    filterMode,
    setFilterMode: setFilterModeAndReset,
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
