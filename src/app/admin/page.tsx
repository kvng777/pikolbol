'use client'

import { format, addDays } from 'date-fns'
import { useAdminPage } from '@/hooks/useAdminPage'
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
import { Trash2, Calendar, Clock, List, ArrowUpDown, Ban, Plus, Lock, LogOut } from 'lucide-react'
import { generateTimeSlots } from '@/lib/timeSlotGenerator'

export default function AdminPage() {
  const {
    user,
    authLoading,
    handleSignOut,
    // filters / sorting
    sortField,
    sortOrder,
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
  } = useAdminPage()

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

  if (!user) return null

  return (
    <div className="min-h-screen relative overflow-hidden bg-gradient-to-br from-emerald-50 via-white to-teal-50">
      <div className="relative z-10 min-h-screen py-12 px-4 sm:px-6 lg:px-8">
        <div className="max-w-6xl mx-auto">
          <div className='pb-2 text-2xl'>
            Hi! {user.email}
          </div>

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
                <span className="text-gray-900 font-semibold ml-2">{groupedBookings.length} bookings</span>
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
                      <TableHead className="text-gray-500">Players</TableHead>
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
                      sortedBookings.map((group) => (
                        <TableRow key={group.key} className="border-gray-100 hover:bg-gray-50">
                          <TableCell className="text-gray-900">
                            <div className="flex flex-col">
                              <span className="text-xs text-gray-400">ID: <span title={group.bookingIds[0] ?? ''} className="font-mono">
                                {group.bookingIds[0]
                                  ? (group.bookingIds[0].length > 8 ? `${group.bookingIds[0].slice(0,8)}...` : group.bookingIds[0])
                                  : '—'
                                }
                              </span></span>
                              <span className="mt-1">{format(new Date(group.date + 'T00:00:00'), 'MMM d, yyyy')}</span>
                            </div>
                          </TableCell>

                          <TableCell>
                            <div className="flex flex-wrap gap-1">
                              {group.timeSlots.map((slot) => (
                                <span key={slot} className="px-2 py-0.5 bg-emerald-100 text-emerald-700 rounded-full text-xs font-medium">{slot}</span>
                              ))}
                            </div>
                          </TableCell>

                          <TableCell className="text-gray-900 font-medium">{group.name}</TableCell>
                          <TableCell className="text-gray-900">{group.players ?? '-'}</TableCell>
                          <TableCell className="text-gray-500">{group.phone}</TableCell>
                          <TableCell className="text-gray-500">{group.email}</TableCell>

                          <TableCell>
                            <Button variant="ghost" size="icon" onClick={() => handleDeleteGroupedBooking(group.bookingIds)} className="text-gray-400 hover:text-red-600 hover:bg-red-50">
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
                      <p className="text-sm text-red-700">{selectedSlots.length} slot(s) will be disabled: {selectedSlots.join(', ')}</p>
                    </div>
                  )}

                  <Button onClick={handleAddDisabledSlots} disabled={selectedSlots.length === 0 || addDisabledSlot.isPending} className="w-full bg-red-500 hover:bg-red-600">
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
                      <input type="date" value={closeStartDate} onChange={(e) => setCloseStartDate(e.target.value)} className="w-full bg-gray-50 border border-gray-200 rounded-lg px-4 py-2 text-gray-900" />
                    </div>
                    <div>
                      <label className="text-sm font-medium text-gray-700 mb-2 block">End Date</label>
                      <input type="date" value={closeEndDate} onChange={(e) => setCloseEndDate(e.target.value)} className="w-full bg-gray-50 border border-gray-200 rounded-lg px-4 py-2 text-gray-900" />
                    </div>
                  </div>

                  <div>
                    <label className="text-sm font-medium text-gray-700 mb-2 block">Reason (optional)</label>
                    <Input placeholder="e.g., Maintenance, Private event..." value={closeReason} onChange={(e) => setCloseReason(e.target.value)} className="bg-gray-50 border-gray-200" />
                  </div>

                  <Button onClick={handleAddClosedDate} disabled={addClosedDate.isPending} className="w-full bg-red-500 hover:bg-red-600">
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
