'use client'

import { useMemo } from 'react'
import { format } from 'date-fns'
import { useAdminTable } from './hooks/useAdminTable'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Calendar, Clock, Plus, Ban, Lock, CreditCard, Settings, Banknote } from 'lucide-react'
import AdminHeader from './ui/AdminHeader'
import AdminControls from './ui/AdminControls'
import BookingsTable from './ui/BookingsTable'
import NavBar from '@/components/NavBar'
import { PendingPayments } from '@/components/admin/PendingPayments'
import { PendingRefunds } from '@/components/admin/PendingRefunds'
import { PaymentSettings } from '@/components/admin/PaymentSettings'
import { usePendingPayments } from '@/hooks/usePayment'
import { usePendingRefunds } from '@/hooks/useRefunds'
import { useProfile } from '@/hooks/useProfile'

export default function AdminPage() {
  const table = useAdminTable()
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const pendingQuery = usePendingPayments()
  const pendingCount = useMemo(() => {
    const bookings = pendingQuery.data
    if (!bookings || bookings.length === 0) return 0
    const keys = new Set<string>()
    bookings.forEach((b: any) => {
      const key = b.booking_group_id || `legacy-${b.name}-${b.email}-${b.date}-${b.created_at}`
      keys.add(key)
    })
    return keys.size
  }, [pendingQuery.data])

  const refundsQuery = usePendingRefunds()
  const refundsCount = useMemo(() => {
    const bookings = refundsQuery.data
    if (!bookings || bookings.length === 0) return 0
    const keys = new Set<string>()
    bookings.forEach((b: any) => {
      const key = b.booking_group_id || `legacy-${b.id}`
      keys.add(key)
    })
    return keys.size
  }, [refundsQuery.data])

  const { data: profile } = useProfile()
  const displayName = profile?.name ?? table.user?.user_metadata?.full_name ?? table.user?.email ?? 'User'

  if (table.authLoading) {
    return (
      <div className="min-h-screen relative overflow-hidden bg-linear-to-br from-emerald-50 via-white to-teal-50">
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

  // Don't render if not authenticated or not admin (will redirect via useAdminPage hook)
  if (!table.user || !table.isAdmin) return null

  return (
    <div className="min-h-screen relative overflow-hidden bg-linear-to-br from-emerald-50 via-white to-teal-50">
      <NavBar />
      <div className="relative z-10 min-h-screen py-12 px-4 sm:px-6 lg:px-8">
        <div className="max-w-6xl mx-auto">
          <div className='pb-2 text-2xl'>
            Hi! {displayName}
          </div>

          <AdminHeader table={table} />

          <div className="flex flex-wrap gap-2 mb-6">
            <Button
              variant={table.activeTab === 'bookings' ? 'default' : 'outline'}
              onClick={() => table.setActiveTab('bookings')}
              className={table.activeTab === 'bookings' ? 'bg-emerald-500 hover:bg-emerald-600' : ''}
            >
              <Calendar className="w-4 h-4 mr-2" />
              Bookings
            </Button>

            <div className="relative inline-block">
              <Button
                variant={table.activeTab === 'payments' ? 'default' : 'outline'}
                onClick={() => table.setActiveTab('payments')}
                className={table.activeTab === 'payments' ? 'bg-amber-500 hover:bg-amber-600' : ''}
              >
                <CreditCard className="w-4 h-4 mr-2" />
                Pending Payments
              </Button>

              {pendingCount > 0 && (
                <span className="absolute -top-2 -right-1 inline-flex items-center justify-center p-1 h-5 w-5 text-[12px] font-semibold leading-none text-white bg-red-600 rounded-full">
                  {pendingCount > 99 ? '99+' : pendingCount}
                </span>
              )}
            </div>

            <div className="relative inline-block">
              <Button
                variant={table.activeTab === 'refunds' ? 'default' : 'outline'}
                onClick={() => table.setActiveTab('refunds')}
                className={table.activeTab === 'refunds' ? 'bg-blue-500 hover:bg-blue-600' : ''}
              >
                <Banknote className="w-4 h-4 mr-2" />
                Pending Refunds
              </Button>

              {refundsCount > 0 && (
                <span className="absolute -top-2 -right-1 inline-flex items-center justify-center p-1 h-5 w-5 text-[12px] font-semibold leading-none text-white bg-red-600 rounded-full">
                  {refundsCount > 99 ? '99+' : refundsCount}
                </span>
              )}
            </div>

            <Button
              variant={table.activeTab === 'slots' ? 'default' : 'outline'}
              onClick={() => table.setActiveTab('slots')}
              className={table.activeTab === 'slots' ? 'bg-emerald-500 hover:bg-emerald-600' : ''}
            >
              <Clock className="w-4 h-4 mr-2" />
              Time Slots
            </Button>
            <Button
              variant={table.activeTab === 'closed' ? 'default' : 'outline'}
              onClick={() => table.setActiveTab('closed')}
              className={table.activeTab === 'closed' ? 'bg-emerald-500 hover:bg-emerald-600' : ''}
            >
              <Lock className="w-4 h-4 mr-2" />
              Closed Dates
            </Button>
            <Button
              variant={table.activeTab === 'settings' ? 'default' : 'outline'}
              onClick={() => table.setActiveTab('settings')}
              className={table.activeTab === 'settings' ? 'bg-emerald-500 hover:bg-emerald-600' : ''}
            >
              <Settings className="w-4 h-4 mr-2" />
              Payment Settings
            </Button>
          </div>

          {table.activeTab === 'bookings' && (
            <div className="rounded-2xl border border-gray-200 bg-white shadow-xl overflow-hidden">
              <AdminControls table={table} />
              <BookingsTable table={table} />
            </div>
          )}

          {table.activeTab === 'payments' && (
            <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-xl">
              <PendingPayments />
            </div>
          )}

          {table.activeTab === 'refunds' && (
            <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-xl">
              <PendingRefunds />
            </div>
          )}

          {table.activeTab === 'settings' && (
            <div className="space-y-6">
              <PaymentSettings />
            </div>
          )}

          {table.activeTab === 'slots' && (
            <div className="grid md:grid-cols-2 gap-6">
              <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-xl">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Disable Time Slots</h3>
                <div className="space-y-4">
                  <div>
                    <label className="text-sm font-medium text-gray-700 mb-2 block">Select Date</label>
                    <input
                      type="date"
                      value={table.selectedDateForSlots}
                      onChange={(e) => table.setSelectedDateForSlots(e.target.value)}
                      className="w-full bg-gray-50 border border-gray-200 rounded-lg px-4 py-2 text-gray-900"
                    />
                  </div>

                  <div>
                    <label className="text-sm font-medium text-gray-700 mb-2 block">Select Time Slots</label>
                    <div className="grid grid-cols-3 gap-2 max-h-64 overflow-y-auto">
                      {table.allTimeSlots.map((slot) => {
                        const isDisabled = table.disabledSlotsForDate.some(s => s.time_slot === slot)
                        const isSelected = table.selectedSlots.includes(slot)
                        return (
                          <button
                            key={slot}
                            onClick={() => !isDisabled && table.toggleSlotSelection(slot)}
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

                  {table.selectedSlots.length > 0 && (
                    <div className="p-3 bg-red-50 rounded-lg">
                      <p className="text-sm text-red-700">{table.selectedSlots.length} slot(s) will be disabled: {table.selectedSlots.join(', ')}</p>
                    </div>
                  )}

                  <Button onClick={table.handleAddDisabledSlots} disabled={table.selectedSlots.length === 0 || table.addDisabledSlot.isPending} className="w-full bg-red-500 hover:bg-red-600">
                    <Ban className="w-4 h-4 mr-2" />
                    {table.addDisabledSlot.isPending ? 'Disabling...' : 'Disable Selected Slots'}
                  </Button>
                </div>
              </div>

              <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-xl">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Currently Disabled Slots</h3>
                {table.allDisabledSlots.length === 0 ? (
                  <p className="text-gray-500 text-center py-8">No disabled slots</p>
                ) : (
                  <div className="space-y-2 max-h-96 overflow-y-auto">
                    {table.allDisabledSlots.map((slot) => (
                      <div key={slot.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                        <div>
                          <p className="font-medium text-gray-900">{slot.date}</p>
                          <p className="text-sm text-gray-500">{slot.time_slot}</p>
                        </div>
                        <Button variant="ghost" size="sm" onClick={() => table.handleRemoveDisabledSlot(slot.id)} className="text-emerald-600 hover:bg-emerald-50">
                          <Plus className="w-4 h-4 rotate-45" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {table.activeTab === 'closed' && (
            <div className="grid md:grid-cols-2 gap-6">
              <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-xl">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Close Court</h3>
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-sm font-medium text-gray-700 mb-2 block">Start Date</label>
                      <input type="date" value={table.closeStartDate} onChange={(e) => table.setCloseStartDate(e.target.value)} className="w-full bg-gray-50 border border-gray-200 rounded-lg px-4 py-2 text-gray-900" />
                    </div>
                    <div>
                      <label className="text-sm font-medium text-gray-700 mb-2 block">End Date</label>
                      <input type="date" value={table.closeEndDate} onChange={(e) => table.setCloseEndDate(e.target.value)} className="w-full bg-gray-50 border border-gray-200 rounded-lg px-4 py-2 text-gray-900" />
                    </div>
                  </div>

                  <div>
                    <label className="text-sm font-medium text-gray-700 mb-2 block">Reason (optional)</label>
                    <Input placeholder="e.g., Maintenance, Private event..." value={table.closeReason} onChange={(e) => table.setCloseReason(e.target.value)} className="bg-gray-50 border-gray-200" />
                  </div>

                  <Button onClick={table.handleAddClosedDate} disabled={table.addClosedDate.isPending} className="w-full bg-red-500 hover:bg-red-600">
                    <Lock className="w-4 h-4 mr-2" />
                    {table.addClosedDate.isPending ? 'Closing...' : 'Close Court'}
                  </Button>
                </div>
              </div>

              <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-xl">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Currently Closed Dates</h3>
                {table.closedDates.length === 0 ? (
                  <p className="text-gray-500 text-center py-8">No closed dates</p>
                ) : (
                  <div className="space-y-2 max-h-96 overflow-y-auto">
                    {table.closedDates.map((cd) => (
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
                        <Button variant="ghost" size="sm" onClick={() => table.handleRemoveClosedDate(cd.id)} className="text-emerald-600 hover:bg-emerald-50">
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
