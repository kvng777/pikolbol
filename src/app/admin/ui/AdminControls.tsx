'use client'

import React from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import type { TableUI } from '@/app/admin/hooks/useAdminTable'

export default function AdminControls({ table }: { table: TableUI }) {
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
      </div>

      <div className=" ">
        <span>Filter view: </span>
        <div className='inline-flex rounded-md bg-gray-100 p-1'>
          <button
            onClick={() => { table.setFilterMode('all'); table.setPage(1) }}
            className={`px-3 py-1 text-sm rounded-md ${table.filterMode === 'all' ? 'bg-white shadow-sm' : 'text-gray-600'}`}
          >
            All
          </button>
          <button
            onClick={() => { table.setFilterMode('incoming'); table.setPage(1) }}
            className={`px-3 py-1 text-sm rounded-md ${table.filterMode === 'incoming' ? 'bg-white shadow-sm' : 'text-gray-600'}`}
          >
            Incoming
          </button>
          <button
            onClick={() => { table.setFilterMode('passed'); table.setPage(1) }}
            className={`px-3 py-1 text-sm rounded-md ${table.filterMode === 'passed' ? 'bg-white shadow-sm' : 'text-gray-600'}`}
          >
            Passed
          </button>
        </div>
      </div>
    </div>
  )
}
