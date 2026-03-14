'use client'

import React from 'react'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Trash2 } from 'lucide-react'
import { format } from 'date-fns'
import { Button } from '@/components/ui/button'
import type { TableUI } from '@/app/admin/hooks/useAdminTable'

export default function BookingsTable({ table }: { table: TableUI }) {
  // Lightweight type for grouped bookings used by this UI
  type BookingGroup = {
    key: string
    date: string
    timeSlots: string[]
    name?: string
    players?: number | null
    phone?: string | number
    email?: string
    bookingIds: string[]
  }
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow className="border-gray-100 hover:bg-gray-50">
            <TableHead className="cursor-pointer text-gray-500 hover:text-gray-900" onClick={() => table.handleSort('date')}>
              <div className="flex items-center gap-2">Date</div>
            </TableHead>
            <TableHead className="cursor-pointer text-gray-500 hover:text-gray-900" onClick={() => table.handleSort('time_slot')}>
              <div className="flex items-center gap-2">Time</div>
            </TableHead>
            <TableHead className="cursor-pointer text-gray-500 hover:text-gray-900" onClick={() => table.handleSort('name')}>
              <div className="flex items-center gap-2">Name</div>
            </TableHead>
            <TableHead className="text-gray-500">Players</TableHead>
            <TableHead className="text-gray-500">Phone</TableHead>
            <TableHead className="text-gray-500">Email</TableHead>
            <TableHead className="text-gray-500">Actions</TableHead>
            <TableHead className="text-gray-500">Total ₱</TableHead>
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
              return (
                <TableRow key={group.key} className={`border-gray-100 hover:bg-gray-50 ${isPast ? 'bg-gray-100' : ''}`}>
                  <TableCell className="text-gray-900">
                    <div className="flex flex-col">
                      <span className="mt-1">{format(new Date(group.date + 'T00:00:00'), 'MMM d, yyyy')}</span>
                    </div>
                  </TableCell>

                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {group.timeSlots.map((slot: string) => (
                        <span key={slot} className="px-2 py-0.5 bg-emerald-100 text-emerald-700 rounded-full text-xs font-medium">{slot}</span>
                      ))}
                    </div>
                  </TableCell>

                  <TableCell className="text-gray-900 font-medium">{group.name}</TableCell>
                  <TableCell className="text-gray-900">{group.players ?? '-'}</TableCell>
                  <TableCell className="text-gray-500">{group.phone}</TableCell>
                  <TableCell className="text-gray-500">{group.email}</TableCell>

                  <TableCell>
                    <Button variant="ghost" size="icon" onClick={() => table.handleDeleteGroupedBooking(group.bookingIds)} className="text-gray-400 hover:text-red-600 hover:bg-red-50">
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </TableCell>
                  <TableCell className="text-gray-900 font-medium">
                    {(() => {
                      const players = typeof group.players === 'number' ? group.players : 4
                      const extra = Math.max(0, players - 4)
                      const perSlot = 200 + extra * 50
                      const total = perSlot * group.timeSlots.length
                      return `${total.toLocaleString()}${group.timeSlots.length > 1 ? ` (${group.timeSlots.length} slots)` : ''}`
                    })()}
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
