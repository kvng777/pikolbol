'use client'

import { useState, useEffect } from 'react'
import { format, addDays } from 'date-fns'
import { useRouter } from 'next/navigation'
import { useAllBookings, useAllDisabledSlots, useAddDisabledSlot, useRemoveDisabledSlot, useClosedDates, useAddClosedDate, useRemoveClosedDate } from '@/hooks/useBookings'
import { deleteBookingAction } from '@/actions/bookings'
import { useAuth } from '@/components/AuthProvider'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Trash2, Calendar, Clock, List, ArrowUpDown, Ban, Plus, X, Lock, LogOut } from 'lucide-react'
import { toast } from 'sonner'
import { generateTimeSlots } from '@/lib/timeSlotGenerator'

type SortField = 'date' | 'time_slot' | 'name' | 'created_at'
type SortOrder = 'asc' | 'desc'

export default function AdminPage() {
  const { user, loading: authLoading, signOut } = useAuth()
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
  
  const [activeTab, setActiveTab] = useState<'bookings' | 'slots' | 'closed'>('bookings')
  const [selectedDateForSlots, setSelectedDateForSlots] = useState<string>(format(new Date(), 'yyyy-MM-dd'))
  const [selectedSlots, setSelectedSlots] = useState<string[]>([])
  const [closeStartDate, setCloseStartDate] = useState<string>(format(new Date(), 'yyyy-MM-dd'))
  const [closeEndDate, setCloseEndDate] = useState<string>(format(addDays(new Date(), 1), 'yyyy-MM-dd'))
  const [closeReason, setCloseReason] = useState<string>('')

  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/admin/login')
    }
  }, [user, authLoading, router])

  const handleSignOut = async () => {
    await signOut()
    router.push('/admin/login')
  }

  const allTimeSlots = generateTimeSlots()

  if (authLoading) {
    return (
      <div className="min-h-screen relative overflow-hidden bg-gradient-to-br from-emerald-50 via-white to-teal-50">
        <div className="relative z-10 min-h-screen py-12 px-4">
          <div className="max-w-6xl mx-auto">
            <div className="h-10 w-48 bg-gray-200 animate-pulse rounded mb-8" />
            <div className="space-y-4">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="h-16 bg-gray-100 animate-pulse rounded-lg" />
              ))}
            </div>
          </div>
        </div>
      </div>
    )
  }

  if (!user) {
    return null
  }

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

  const filteredBookings = bookings.filter((booking) => {
    if (!filterDate) return true
    return booking.date === filterDate
  })

  const sortedBookings = [...filteredBookings].sort((a, b) => {
    let comparison = 0
    switch (sortField) {
      case 'date':
        comparison = a.date.localeCompare(b.date)
        break
      case 'time_slot':
        comparison = a.time_slot.localeCompare(b.time_slot)
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

  const disabledSlotsForDate = allDisabledSlots.filter(s => s.date === selectedDateForSlots)

  return (
    <div className="min-h-screen relative overflow-hidden bg-gradient-to-br from-emerald-50 via-white to-teal-50">
      <div className="relative z-10 min-h-screen py-12 px-4 sm:px-6 lg:px-8">
        <div className="max-w-6xl mx-auto">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-8 gap-4">
            <div>
              <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-3">
                <div className="p-2 rounded-lg bg-emerald-100">
                  <List className="w-6 h-6 text-emerald-600" />
                </div>
                Reservations
              </h1>
              <p className="text-gray-500 mt-1">Manage all court bookings</p>
            </div>
            <div className="flex items-center gap-3">
              <div className="px-4 py-2 rounded-full bg-white border border-gray-200 shadow-sm">
                <span className="text-gray-500">Total:</span>
                <span className="text-gray-900 font-semibold ml-2">{bookings.length} bookings</span>
              </div>
              <Button variant="outline" size="sm" onClick={handleSignOut} className="text-gray-600">
                <LogOut className="w-4 h-4 mr-2" />
                Sign Out
              </Button>
            </div>
          </div>

          <div className="flex gap-2 mb-6">
            <Button
              variant={activeTab === 'bookings' ? 'default' : 'outline'}
              onClick={() => setActiveTab('bookings')}
              className={activeTab === 'bookings' ? 'bg-emerald-500 hover:bg-emerald-600' : ''}
            >
              <Calendar className="w-4 h-4 mr-2" />
              Bookings
            </Button>
            <Button
              variant={activeTab === 'slots' ? 'default' : 'outline'}
              onClick={() => setActiveTab('slots')}
              className={activeTab === 'slots' ? 'bg-emerald-500 hover:bg-emerald-600' : ''}
            >
              <Clock className="w-4 h-4 mr-2" />
              Time Slots
            </Button>
            <Button
              variant={activeTab === 'closed' ? 'default' : 'outline'}
              onClick={() => setActiveTab('closed')}
              className={activeTab === 'closed' ? 'bg-emerald-500 hover:bg-emerald-600' : ''}
            >
              <Lock className="w-4 h-4 mr-2" />
              Closed Dates
            </Button>
          </div>

          {activeTab === 'bookings' && (
            <div className="rounded-2xl border border-gray-200 bg-white shadow-xl overflow-hidden">
              <div className="p-6 border-b border-gray-100">
                <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-emerald-100">
                      <Calendar className="w-5 h-5 text-emerald-600" />
                    </div>
                    <label className="text-sm font-medium text-gray-700">
                      Filter by date
                    </label>
                  </div>
                  <input
                    type="date"
                    value={filterDate}
                    onChange={(e) => setFilterDate(e.target.value)}
                    className="bg-gray-50 border border-gray-200 rounded-lg px-4 py-2 text-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
                  />
                  {filterDate && (
                    <Button variant="ghost" size="sm" onClick={() => setFilterDate('')} className="text-gray-500 hover:text-gray-900">
                      Clear
                    </Button>
                  )}
                </div>
              </div>

              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="border-gray-100 hover:bg-gray-50">
                      <TableHead className="cursor-pointer text-gray-500 hover:text-gray-900" onClick={() => handleSort('date')}>
                        <div className="flex items-center gap-2">Date <ArrowUpDown className="w-3 h-3" /></div>
                      </TableHead>
                      <TableHead className="cursor-pointer text-gray-500 hover:text-gray-900" onClick={() => handleSort('time_slot')}>
                        <div className="flex items-center gap-2">Time <ArrowUpDown className="w-3 h-3" /></div>
                      </TableHead>
                      <TableHead className="cursor-pointer text-gray-500 hover:text-gray-900" onClick={() => handleSort('name')}>
                        <div className="flex items-center gap-2">Name <ArrowUpDown className="w-3 h-3" /></div>
                      </TableHead>
                      <TableHead className="text-gray-500">Phone</TableHead>
                      <TableHead className="text-gray-500">Email</TableHead>
                      <TableHead className="text-gray-500">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sortedBookings.length === 0 ? (
                      <TableRow className="border-gray-100">
                        <TableCell colSpan={6} className="text-center py-12 text-gray-500">No bookings found</TableCell>
                      </TableRow>
                    ) : (
                      sortedBookings.map((booking) => (
                        <TableRow key={booking.id} className="border-gray-100 hover:bg-gray-50">
                          <TableCell className="text-gray-900">{format(new Date(booking.date + 'T00:00:00'), 'MMM d, yyyy')}</TableCell>
                          <TableCell className="text-gray-600">{booking.time_slot}</TableCell>
                          <TableCell className="text-gray-900 font-medium">{booking.name}</TableCell>
                          <TableCell className="text-gray-500">{booking.phone}</TableCell>
                          <TableCell className="text-gray-500">{booking.email}</TableCell>
                          <TableCell>
                            <Button variant="ghost" size="icon" onClick={() => handleDeleteBooking(booking.id)} className="text-gray-400 hover:text-red-600 hover:bg-red-50">
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}

          {activeTab === 'slots' && (
            <div className="grid md:grid-cols-2 gap-6">
              <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-xl">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Disable Time Slots</h3>
                <div className="space-y-4">
                  <div>
                    <label className="text-sm font-medium text-gray-700 mb-2 block">Select Date</label>
                    <input
                      type="date"
                      value={selectedDateForSlots}
                      onChange={(e) => setSelectedDateForSlots(e.target.value)}
                      className="w-full bg-gray-50 border border-gray-200 rounded-lg px-4 py-2 text-gray-900"
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-700 mb-2 block">Select Time Slots</label>
                    <div className="grid grid-cols-3 gap-2 max-h-64 overflow-y-auto">
                      {allTimeSlots.map((slot) => {
                        const isDisabled = disabledSlotsForDate.some(s => s.time_slot === slot)
                        const isSelected = selectedSlots.includes(slot)
                        return (
                          <button
                            key={slot}
                            onClick={() => !isDisabled && toggleSlotSelection(slot)}
                            disabled={isDisabled}
                            className={`p-2 rounded-lg text-sm font-medium transition-colors ${
                              isDisabled 
                                ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                                : isSelected 
                                  ? 'bg-red-100 text-red-700 border border-red-300'
                                  : 'bg-white border border-gray-200 text-gray-700 hover:border-gray-400'
                            }`}
                          >
                            {slot}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                  {selectedSlots.length > 0 && (
                    <div className="p-3 bg-red-50 rounded-lg">
                      <p className="text-sm text-red-700">
                        {selectedSlots.length} slot(s) will be disabled: {selectedSlots.join(', ')}
                      </p>
                    </div>
                  )}
                  <Button 
                    onClick={handleAddDisabledSlots} 
                    disabled={selectedSlots.length === 0 || addDisabledSlot.isPending}
                    className="w-full bg-red-500 hover:bg-red-600"
                  >
                    <Ban className="w-4 h-4 mr-2" />
                    {addDisabledSlot.isPending ? 'Disabling...' : 'Disable Selected Slots'}
                  </Button>
                </div>
              </div>

              <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-xl">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Currently Disabled Slots</h3>
                {allDisabledSlots.length === 0 ? (
                  <p className="text-gray-500 text-center py-8">No disabled slots</p>
                ) : (
                  <div className="space-y-2 max-h-96 overflow-y-auto">
                    {allDisabledSlots.map((slot) => (
                      <div key={slot.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                        <div>
                          <p className="font-medium text-gray-900">{slot.date}</p>
                          <p className="text-sm text-gray-500">{slot.time_slot}</p>
                        </div>
                        <Button variant="ghost" size="sm" onClick={() => handleRemoveDisabledSlot(slot.id)} className="text-emerald-600 hover:bg-emerald-50">
                          <Plus className="w-4 h-4 rotate-45" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {activeTab === 'closed' && (
            <div className="grid md:grid-cols-2 gap-6">
              <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-xl">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Close Court</h3>
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-sm font-medium text-gray-700 mb-2 block">Start Date</label>
                      <input
                        type="date"
                        value={closeStartDate}
                        onChange={(e) => setCloseStartDate(e.target.value)}
                        className="w-full bg-gray-50 border border-gray-200 rounded-lg px-4 py-2 text-gray-900"
                      />
                    </div>
                    <div>
                      <label className="text-sm font-medium text-gray-700 mb-2 block">End Date</label>
                      <input
                        type="date"
                        value={closeEndDate}
                        onChange={(e) => setCloseEndDate(e.target.value)}
                        className="w-full bg-gray-50 border border-gray-200 rounded-lg px-4 py-2 text-gray-900"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-700 mb-2 block">Reason (optional)</label>
                    <Input
                      placeholder="e.g., Maintenance, Private event..."
                      value={closeReason}
                      onChange={(e) => setCloseReason(e.target.value)}
                      className="bg-gray-50 border-gray-200"
                    />
                  </div>
                  <Button 
                    onClick={handleAddClosedDate} 
                    disabled={addClosedDate.isPending}
                    className="w-full bg-red-500 hover:bg-red-600"
                  >
                    <Lock className="w-4 h-4 mr-2" />
                    {addClosedDate.isPending ? 'Closing...' : 'Close Court'}
                  </Button>
                </div>
              </div>

              <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-xl">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Currently Closed Dates</h3>
                {closedDates.length === 0 ? (
                  <p className="text-gray-500 text-center py-8">No closed dates</p>
                ) : (
                  <div className="space-y-2 max-h-96 overflow-y-auto">
                    {closedDates.map((cd) => (
                      <div key={cd.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                        <div>
                          <p className="font-medium text-gray-900">
                            {cd.start_date === cd.end_date 
                              ? format(new Date(cd.start_date + 'T00:00:00'), 'MMM d, yyyy')
                              : `${format(new Date(cd.start_date + 'T00:00:00'), 'MMM d')} - ${format(new Date(cd.end_date + 'T00:00:00'), 'MMM d, yyyy')}`
                            }
                          </p>
                          {cd.reason && <p className="text-sm text-gray-500">{cd.reason}</p>}
                        </div>
                        <Button variant="ghost" size="sm" onClick={() => handleRemoveClosedDate(cd.id)} className="text-emerald-600 hover:bg-emerald-50">
                          <Lock className="w-4 h-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
