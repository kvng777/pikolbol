'use client'

import { Download } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { MonthlyRevenue, formatCurrency, exportToCSV } from '@/lib/financeUtils'

interface FinanceRevenueTableProps {
  data: MonthlyRevenue[]
  isLoading?: boolean
}

export function FinanceRevenueTable({ data, isLoading }: FinanceRevenueTableProps) {
  const handleExport = () => {
    exportToCSV(data, 'pikolbol-finance-report')
  }

  // Calculate totals
  const totals = data.reduce(
    (acc, row) => ({
      grossRevenue: acc.grossRevenue + row.grossRevenue,
      refunds: acc.refunds + row.refunds,
      cancellationFees: acc.cancellationFees + row.cancellationFees,
      netRevenue: acc.netRevenue + row.netRevenue,
      bookingsCount: acc.bookingsCount + row.bookingsCount,
    }),
    { grossRevenue: 0, refunds: 0, cancellationFees: 0, netRevenue: 0, bookingsCount: 0 }
  )

  if (isLoading) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
        <div className="p-4 border-b border-gray-100">
          <div className="h-6 bg-gray-200 rounded w-40 animate-pulse" />
        </div>
        <div className="p-4 space-y-3">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-10 bg-gray-100 rounded animate-pulse" />
          ))}
        </div>
      </div>
    )
  }

  if (data.length === 0) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white shadow-sm p-8 text-center">
        <p className="text-gray-500">No revenue data for the selected period.</p>
      </div>
    )
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
      <div className="flex items-center justify-between p-4 border-b border-gray-100">
        <h3 className="text-lg font-semibold text-gray-900">Monthly Revenue</h3>
        <Button variant="outline" size="sm" onClick={handleExport}>
          <Download className="w-4 h-4 mr-2" />
          Export CSV
        </Button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="bg-gray-50 text-left">
              <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Month</th>
              <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider text-right">Bookings</th>
              <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider text-right">Gross</th>
              <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider text-right">Refunds</th>
              <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider text-right">Fees Retained</th>
              <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider text-right">Net</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {data.map((row) => (
              <tr key={`${row.year}-${row.monthNumber}`} className="hover:bg-gray-50">
                <td className="px-4 py-3 text-sm font-medium text-gray-900">{row.month}</td>
                <td className="px-4 py-3 text-sm text-gray-600 text-right">{row.bookingsCount}</td>
                <td className="px-4 py-3 text-sm text-gray-900 text-right font-medium">{formatCurrency(row.grossRevenue)}</td>
                <td className="px-4 py-3 text-sm text-orange-600 text-right">{row.refunds > 0 ? `-${formatCurrency(row.refunds)}` : '-'}</td>
                <td className="px-4 py-3 text-sm text-emerald-600 text-right">{row.cancellationFees > 0 ? formatCurrency(row.cancellationFees) : '-'}</td>
                <td className="px-4 py-3 text-sm text-emerald-600 text-right font-semibold">{formatCurrency(row.netRevenue)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="bg-gray-50 font-semibold">
              <td className="px-4 py-3 text-sm text-gray-900">Total</td>
              <td className="px-4 py-3 text-sm text-gray-900 text-right">{totals.bookingsCount}</td>
              <td className="px-4 py-3 text-sm text-gray-900 text-right">{formatCurrency(totals.grossRevenue)}</td>
              <td className="px-4 py-3 text-sm text-orange-600 text-right">{totals.refunds > 0 ? `-${formatCurrency(totals.refunds)}` : '-'}</td>
              <td className="px-4 py-3 text-sm text-emerald-600 text-right">{totals.cancellationFees > 0 ? formatCurrency(totals.cancellationFees) : '-'}</td>
              <td className="px-4 py-3 text-sm text-emerald-600 text-right">{formatCurrency(totals.netRevenue)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  )
}
