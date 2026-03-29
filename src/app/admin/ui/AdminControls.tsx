'use client'

import React from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { BOOKING_FILTER_OPTIONS, TIME_FILTER_OPTIONS, BookingFilterValue, TimeFilterValue } from '@/lib/bookingStatus'
import type { TableUI } from '@/app/admin/hooks/useAdminTable'

export default function AdminControls({ table }: { table: TableUI }) {
  const handleExportCSV = () => {
    const rows = table.filteredBookings.map((g) => ({
      Status: g.payment_status || 'unknown',
      Name: g.name,
      Email: g.email,
      Phone: g.phone,
      Date: g.date,
      TimeSlots: (g.timeSlots || []).join('; '),
      Players: g.players ?? '',
      Amount: g.payment_amount ?? '',
      BookingIDs: (g.bookingIds || []).join('; '),
      CreatedAt: g.created_at,
    }))

    const headers = ['Status', 'Name', 'Email', 'Phone', 'Date', 'TimeSlots', 'Players', 'Amount', 'BookingIDs', 'CreatedAt']

    const escape = (val: any) => `"${String(val ?? '').replace(/"/g, '""')}"`

    const csv = [headers.map(escape).join(',')]
      .concat(rows.map(r => headers.map(h => escape((r as any)[h])).join(',')))
      .join('\n')

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    const date = new Date().toISOString().slice(0,10)
    a.href = url
    a.download = `bookings-${date}.csv`
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
  }

  const handleExportXLSX = async () => {
    try {
      const XLSX = await import('xlsx')
      const rows = table.filteredBookings.map((g) => ({
        Status: g.payment_status || 'unknown',
        Name: g.name,
        Email: g.email,
        Phone: g.phone,
        Date: g.date,
        TimeSlots: (g.timeSlots || []).join('; '),
        Players: g.players ?? '',
        Amount: g.payment_amount ?? '',
        BookingIDs: (g.bookingIds || []).join('; '),
        CreatedAt: g.created_at,
      }))

      const ws = XLSX.utils.json_to_sheet(rows)
      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, ws, 'Bookings')
      const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' })
      const blob = new Blob([wbout], { type: 'application/octet-stream' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      const date = new Date().toISOString().slice(0,10)
      a.href = url
      a.download = `bookings-${date}.xlsx`
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
    } catch (err) {
      console.error('XLSX export failed', err)
      alert("XLSX export requires the 'xlsx' package. Install it with 'npm install xlsx' or 'bun add xlsx'.")
    }
  }

  return (
    <div className="flex flex-row justify-between p-6 border-b border-gray-100">
      <div className="flex flex-col sm:flex-row sm:items-center gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-emerald-100">
            <svg className="w-5 h-5 text-emerald-600" viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M3 8h18M3 16h18" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </div>
          <label className="text-sm font-medium text-gray-700">Filter by date</label>
        </div>

        <input
          type="date"
          value={table.filterDate}
          onChange={(e) => table.setFilterDate(e.target.value)}
          className="bg-gray-50 border border-gray-200 rounded-lg px-4 py-2 text-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
        />

        {table.filterDate && (
          <Button variant="ghost" size="sm" onClick={() => table.setFilterDate('')} className="text-gray-500 hover:text-gray-900">
            Clear
          </Button>
        )}
      </div>

      <div className="flex items-center gap-3">
        <Input
          placeholder="Enter a name or mobile"
          value={table.searchQuery}
          onChange={(e) => { table.setSearchQuery(e.target.value); table.setPage(1) }}
          className="w-64"
        />
        {table.searchQuery && (
          <Button variant="ghost" size="sm" onClick={() => { table.setSearchQuery(''); table.setPage(1) }} className="text-gray-500">
            Clear
          </Button>
        )}
        {/* <Button size="sm" onClick={handleExportCSV} className="ml-2">
          Export CSV
        </Button> */}
        <Button size="sm" onClick={handleExportXLSX} className="ml-2">
          Export XLSX
        </Button>
      </div>

      {/* Status Filter */}
      <div className="flex items-center gap-2">
        <span className="text-sm text-gray-600">Status:</span>
        <select
          value={table.statusFilter}
          onChange={(e) => table.setStatusFilter(e.target.value as BookingFilterValue)}
          className="bg-gray-50 border border-gray-200 rounded-lg px-3 py-1.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
        >
          {BOOKING_FILTER_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>
    </div>
  )
}
