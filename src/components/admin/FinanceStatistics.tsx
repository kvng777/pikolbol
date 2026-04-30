'use client'

import { 
  Users, 
  Calendar, 
  Clock, 
  TrendingUp, 
  XCircle,
  BarChart3,
} from 'lucide-react'
import { BookingStatistics, formatCurrency, formatPercentage } from '@/lib/financeUtils'

interface FinanceStatisticsProps {
  statistics: BookingStatistics
  isLoading?: boolean
}

interface StatCardProps {
  title: string
  value: string
  subtitle?: string
  icon: React.ReactNode
  iconBg: string
}

function StatCard({ title, value, subtitle, icon, iconBg }: StatCardProps) {
  return (
    <div className="flex items-start gap-3 p-4 rounded-lg bg-gray-50">
      <div className={`p-2 rounded-lg ${iconBg}`}>
        {icon}
      </div>
      <div>
        <p className="text-sm text-gray-500">{title}</p>
        <p className="text-lg font-semibold text-gray-900">{value}</p>
        {subtitle && <p className="text-xs text-gray-400">{subtitle}</p>}
      </div>
    </div>
  )
}

export function FinanceStatistics({ statistics, isLoading }: FinanceStatisticsProps) {
  if (isLoading) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <div className="h-6 bg-gray-200 rounded w-40 mb-6 animate-pulse" />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="h-24 bg-gray-100 rounded-lg animate-pulse" />
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
      <h3 className="text-lg font-semibold text-gray-900 mb-6">Booking Statistics</h3>
      
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <StatCard
          title="Total Bookings"
          value={statistics.totalBookings.toString()}
          subtitle="Confirmed bookings"
          icon={<Calendar className="w-5 h-5 text-emerald-600" />}
          iconBg="bg-emerald-100"
        />
        
        <StatCard
          title="Cancellation Rate"
          value={formatPercentage(statistics.cancellationRate)}
          subtitle={`${statistics.cancelledBookings} cancelled`}
          icon={<XCircle className="w-5 h-5 text-red-600" />}
          iconBg="bg-red-100"
        />
        
        <StatCard
          title="Avg Booking Value"
          value={formatCurrency(statistics.averageBookingValue)}
          icon={<TrendingUp className="w-5 h-5 text-blue-600" />}
          iconBg="bg-blue-100"
        />
        
        <StatCard
          title="Avg Players/Booking"
          value={statistics.averagePlayersPerBooking.toFixed(1)}
          icon={<Users className="w-5 h-5 text-purple-600" />}
          iconBg="bg-purple-100"
        />
        
        <StatCard
          title="Busiest Day"
          value={statistics.busiestDay.day}
          subtitle={`${statistics.busiestDay.count} bookings`}
          icon={<BarChart3 className="w-5 h-5 text-orange-600" />}
          iconBg="bg-orange-100"
        />
        
        <StatCard
          title="Court Utilization"
          value={formatPercentage(statistics.utilizationRate)}
          subtitle="of available slots"
          icon={<Clock className="w-5 h-5 text-teal-600" />}
          iconBg="bg-teal-100"
        />
      </div>

      {/* Peak Hours Section */}
      {statistics.peakHours.length > 0 && (
        <div className="mt-6 pt-6 border-t border-gray-100">
          <h4 className="text-sm font-semibold text-gray-700 mb-3">Peak Hours</h4>
          <div className="flex flex-wrap gap-2">
            {statistics.peakHours.map((slot, index) => (
              <div 
                key={slot.slot}
                className={`px-3 py-2 rounded-lg text-sm font-medium ${
                  index === 0 
                    ? 'bg-emerald-100 text-emerald-700 border border-emerald-200' 
                    : 'bg-gray-100 text-gray-700'
                }`}
              >
                <span className="font-semibold">{slot.slot}</span>
                <span className="text-gray-500 ml-2">({slot.count} bookings)</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
