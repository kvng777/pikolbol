'use client'

import React from 'react'
import { Button } from '@/components/ui/button'
import { LogOut } from 'lucide-react'
import type { TableUI } from '@/app/admin/hooks/useAdminTable'

export default function AdminHeader({ table }: { table: TableUI }) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-8 gap-4">
      <div>
        <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-3">
          <div className="p-2 rounded-lg bg-emerald-100">
            <svg className="w-6 h-6 text-emerald-600" viewBox="0 0 24 24" fill="none" stroke="currentColor">
              <path d="M3 8h18M3 16h18" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          Reservations
        </h1>
        <p className="text-gray-500 mt-1">Manage all court bookings</p>
      </div>

      <div className="flex items-center gap-3">
        <div className="px-4 py-2 rounded-full bg-white border border-gray-200 shadow-sm">
          <span className="text-gray-500">Total:</span>
          <span className="text-gray-900 font-semibold ml-2">{table.groupedBookings.length} bookings</span>
        </div>
        <Button variant="outline" size="sm" onClick={table.handleSignOut} className="text-gray-600">
          <LogOut className="w-4 h-4 mr-2" />
          Sign Out
        </Button>
      </div>
    </div>
  )
}
