'use client'

import { Volleyball, ShoppingBasket, Package } from 'lucide-react'
import { EquipmentBreakdown, formatCurrency } from '@/lib/financeUtils'

interface FinanceEquipmentProps {
  equipment: EquipmentBreakdown
  isLoading?: boolean
}

interface RowProps {
  icon: React.ReactNode
  iconBg: string
  label: string
  count: string
  revenue: number
  chargeableNote?: string
}

function EquipmentRow({ icon, iconBg, label, count, revenue, chargeableNote }: RowProps) {
  return (
    <div className="flex items-center justify-between gap-3 p-4 rounded-lg bg-gray-50">
      <div className="flex items-center gap-3 min-w-0">
        <div className={`p-2 rounded-lg shrink-0 ${iconBg}`}>{icon}</div>
        <div className="min-w-0">
          <p className="text-sm font-medium text-gray-900 truncate">{label}</p>
          <p className="text-xs text-gray-500">{count}</p>
        </div>
      </div>
      <div className="text-right shrink-0">
        <p className="text-base font-semibold text-gray-900 tabular-nums">
          {formatCurrency(revenue)}
        </p>
        {chargeableNote && (
          <p className="text-[11px] text-gray-400">{chargeableNote}</p>
        )}
      </div>
    </div>
  )
}

export function FinanceEquipment({ equipment, isLoading }: FinanceEquipmentProps) {
  if (isLoading) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <div className="h-6 bg-gray-200 rounded w-40 mb-6 animate-pulse" />
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-20 bg-gray-100 rounded-lg animate-pulse" />
          ))}
        </div>
      </div>
    )
  }

  const {
    paddlesRented,
    ballSetRentals,
    trainingBallsRentals,
    bookingsWithEquipment,
    paddleRevenue,
    ballSetRevenue,
    trainingBallsRevenue,
    totalEquipmentRevenue,
  } = equipment

  const anyRevenue = totalEquipmentRevenue > 0

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h3 className="text-lg font-semibold text-gray-900">Equipment Rentals</h3>
          <p className="text-xs text-gray-500 mt-0.5">
            {bookingsWithEquipment} booking{bookingsWithEquipment === 1 ? '' : 's'} with equipment
          </p>
        </div>
        <div className="text-right">
          <p className="text-xs text-gray-500">Equipment revenue</p>
          <p className="text-xl font-bold text-emerald-600 tabular-nums">
            {formatCurrency(totalEquipmentRevenue)}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <EquipmentRow
          icon={<Package className="w-5 h-5 text-indigo-600" />}
          iconBg="bg-indigo-100"
          label="Paddles"
          count={`${paddlesRented} paddle${paddlesRented === 1 ? '' : 's'} rented`}
          revenue={paddleRevenue}
        />
        <EquipmentRow
          icon={<Volleyball className="w-5 h-5 text-emerald-600" />}
          iconBg="bg-emerald-100"
          label="Balls (set of 4)"
          count={`${ballSetRentals} rental${ballSetRentals === 1 ? '' : 's'}`}
          revenue={ballSetRevenue}
        />
        <EquipmentRow
          icon={<ShoppingBasket className="w-5 h-5 text-amber-600" />}
          iconBg="bg-amber-100"
          label="Training Balls (50)"
          count={`${trainingBallsRentals} rental${trainingBallsRentals === 1 ? '' : 's'}`}
          revenue={trainingBallsRevenue}
        />
      </div>

      {!anyRevenue && bookingsWithEquipment > 0 && (
        <p className="mt-4 text-xs text-gray-500">
          Equipment is free during the promo period — counts are shown but revenue is ₱0 until the promo ends.
        </p>
      )}
    </div>
  )
}
