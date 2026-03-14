'use client'

import { TimeSlot } from '@/types/booking'
import { Button } from '@/components/ui/button'

interface TimeSlotPickerProps {
  slots: TimeSlot[]
  selectedSlots: string[]
  onSelectSlots: (slots: string[]) => void
  isLoading?: boolean
}

export function TimeSlotPicker({ slots, selectedSlots = [], onSelectSlots, isLoading = false }: TimeSlotPickerProps) {
  const toggleSlot = (slot: string) => {
    const current = selectedSlots
    if (current.includes(slot)) {
      onSelectSlots(current.filter(s => s !== slot))
    } else {
      onSelectSlots([...current, slot])
    }
  }

  if (isLoading) {
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-2 mb-4">
          <div className="w-20 h-4 bg-gray-200 animate-pulse rounded" />
          <div className="w-16 h-4 bg-gray-200 animate-pulse rounded" />
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {[...Array(14)].map((_, i) => (
            <div
              key={i}
              className="h-11 bg-gray-100 animate-pulse rounded-lg"
              style={{ animationDelay: `${i * 50}ms` }}
            />
          ))}
        </div>
      </div>
    )
  }

  const availableCount = slots.filter(s => s.available).length

  return (
    <div>
      {availableCount === 0 ? (
        <div className="text-center py-8">
          <p className="text-gray-500">No available slots for this date</p>
          <p className="text-sm text-gray-400 mt-1">Please select a different date</p>
        </div>
      ) : (
        <>
          <p className="text-sm text-gray-500 mb-3">Select one or more time slots</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {slots.map((slot) => {
              const isSelected = selectedSlots.includes(slot.time)
              return (
                <Button
                  key={slot.time}
                  type="button"
                  disabled={!slot.available}
                  onClick={() => toggleSlot(slot.time)}
                  className={`
                    h-11 text-sm font-medium transition-all duration-200
                    ${!slot.available
                      ? 'bg-gray-100 text-gray-400 cursor-not-allowed border border-gray-200'
                      : isSelected
                        ? 'bg-gradient-to-r from-emerald-500 to-teal-600 text-white border-0 shadow-lg shadow-emerald-500/25'
                        : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50 hover:border-gray-400'
                    }
                  `}
                >
                  {slot.time}
                </Button>
              )
            })}
          </div>
          {selectedSlots.length > 0 && (
            <p className="text-sm text-emerald-600 mt-3 font-medium">
              {selectedSlots.length} slot(s) selected: {selectedSlots.join(', ')}
            </p>
          )}
        </>
      )}
    </div>
  )
}
