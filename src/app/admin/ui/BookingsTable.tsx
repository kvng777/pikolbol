'use client'

import React, { useState } from 'react'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Trash2, Copy, Check } from 'lucide-react'
import { format } from 'date-fns'
import { Button } from '@/components/ui/button'
import { BookingStatusBadge } from '@/components/ui/BookingStatusBadge'
import { PaymentStatus } from '@/types/payment'
import { calculatePaymentAmount } from '@/lib/paymentConfig'
import type { TableUI } from '@/app/admin/hooks/useAdminTable'

// Type for grouped bookings used by this UI
interface BookingGroup {
  key: string
  date: string
  timeSlots: string[]
  name?: string
  players?: number | null
  phone?: string | number
  email?: string
  bookingIds: string[]
  payment_status: PaymentStatus | null
  payment_amount?: number
  short_id?: string | null
}

export default function BookingsTable({ table }: { table: TableUI }) {
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  // Track which booking ID was recently copied
  const [copiedId, setCopiedId] = useState<string | null>(null)

  const handleCopyId = async (shortId: string) => {
    try {
      await navigator.clipboard.writeText(shortId)
      setCopiedId(shortId)
      setTimeout(() => setCopiedId(null), 2000)
    } catch (err) {
      console.error('Failed to copy:', err)
    }
  }
  
  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow className="border-gray-100 hover:bg-gray-50">
            <TableHead className="text-gray-500">Booking ID</TableHead>
            <TableHead className="text-gray-500">Status</TableHead>
            <TableHead className="cursor-pointer text-gray-500 hover:text-gray-900" onClick={() => table.handleSort('date')}>
              <div className="flex items-center gap-2">Date</div>
            </TableHead>
            <TableHead className="cursor-pointer text-gray-500 hover:text-gray-900" onClick={() => table.handleSort('time_slot')}>
              <div className="flex items-center gap-2">Time</div>
            </TableHead>
            <TableHead className="cursor-pointer text-gray-500 hover:text-gray-900" onClick={() => table.handleSort('name')}>
              <div className="flex items-center gap-2">Name</div>
            </TableHead>
            <TableHead className="text-gray-500">Contact</TableHead>
            <TableHead className="text-gray-500">Total ₱</TableHead>
            <TableHead className="text-gray-500">Actions</TableHead>
          </TableRow>
        </TableHeader>

        <TableBody>
          {table.filteredBookings.length === 0 ? (
            <TableRow className="border-gray-100">
              <TableCell colSpan={8} className="text-center py-12 text-gray-500">No bookings found</TableCell>
            </TableRow>
          ) : (
            table.pagedBookings.map((group: BookingGroup) => {
              const groupDate = new Date(group.date + 'T00:00:00')
              const isPast = groupDate < today
              const isInactive = ['rejected', 'cancelled'].includes(group.payment_status || '')
              
              return (
                <TableRow 
                  key={group.key} 
                  className={`border-gray-100 hover:bg-gray-50 ${isPast || isInactive ? 'opacity-60' : ''}`}
                >
                  {/* Booking ID */}
                  <TableCell>
                    {group.short_id ? (
                      <button
                        onClick={() => handleCopyId(group.short_id!)}
                        className="font-mono text-sm font-medium text-gray-900 hover:text-emerald-600 flex items-center gap-1.5 transition-colors"
                        title="Click to copy"
                      >
                        {group.short_id}
                        {copiedId === group.short_id ? (
                          <Check className="w-3.5 h-3.5 text-emerald-500" />
                        ) : (
                          <Copy className="w-3.5 h-3.5 text-gray-400" />
                        )}
                      </button>
                    ) : (
                      <span className="text-gray-400 text-sm">—</span>
                    )}
                  </TableCell>

                  {/* Status */}
                  <TableCell>
                    <BookingStatusBadge 
                      paymentStatus={group.payment_status} 
                      bookingDate={group.date} 
                    />
                  </TableCell>

                  {/* Date */}
                  <TableCell className="text-gray-900">
                    <div className="flex flex-col">
                      <span>{format(new Date(group.date + 'T00:00:00'), 'MMM d, yyyy')}</span>
                      <span className="text-xs text-gray-400">
                        {format(new Date(group.date + 'T00:00:00'), 'EEEE')}
                      </span>
                    </div>
                  </TableCell>

                  {/* Time Slots */}
                  <TableCell>
                    <div className="flex flex-wrap gap-1 max-w-[150px]">
                      {group.timeSlots.map((slot: string) => (
                        <span 
                          key={slot} 
                          className="px-2 py-0.5 bg-emerald-100 text-emerald-700 rounded-full text-xs font-medium"
                        >
                          {slot}
                        </span>
                      ))}
                    </div>
                  </TableCell>

                  {/* Name */}
                  <TableCell className="text-gray-900 font-medium">{group.name}</TableCell>
                  
                  {/* Removed Players cell */}

                  {/* Contact (Phone + Email) */}
                  <TableCell>
                    <div className="flex flex-col text-sm">
                      <span className="text-gray-700">{group.phone}</span>
                      <span className="text-gray-400 text-xs truncate max-w-[150px]" title={group.email}>
                        {group.email}
                      </span>
                    </div>
                  </TableCell>

                  {/* Total */}
                  <TableCell className="text-gray-900 font-medium">
                    {group.payment_amount 
                      ? `₱${group.payment_amount.toLocaleString()}`
                      : (() => {
                          const players = typeof group.players === 'number' ? group.players : 4
                          const total = calculatePaymentAmount(group.timeSlots, players)
                          return `₱${total.toLocaleString()}`
                        })()
                    }
                    {group.timeSlots.length > 1 && (
                      <span className="text-xs text-gray-400 block">
                        {group.timeSlots.length} slots
                      </span>
                    )}
                  </TableCell>

                  {/* Actions */}
                  <TableCell>
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      onClick={() => table.handleDeleteGroupedBooking(group.bookingIds)} 
                      className="text-gray-400 hover:text-red-600 hover:bg-red-50"
                      title="Delete booking"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              )
            })
          )}
        </TableBody>
      </Table>

      {table.filteredBookings.length > table.pageSize && (
        <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100 bg-white">
          <div className="text-sm text-gray-600">Showing {table.filteredBookings.length === 0 ? 0 : table.startIdx + 1} - {Math.min(table.startIdx + table.pageSize, table.filteredBookings.length)} of {table.filteredBookings.length}</div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => table.setPage((p: number) => Math.max(1, p - 1))} disabled={table.currentPage === 1} className="px-3">Previous</Button>
            <div className="text-sm text-gray-600">Page {table.currentPage} / {table.totalPages}</div>
            <Button variant="outline" size="sm" onClick={() => table.setPage((p: number) => Math.min(table.totalPages, p + 1))} disabled={table.currentPage === table.totalPages} className="px-3">Next</Button>
          </div>
        </div>
      )}
    </div>
  )
}
