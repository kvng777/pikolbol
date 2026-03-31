import { format } from 'date-fns'
import { Booking, TimeSlot, DisabledSlot } from '@/types/booking'

const OPERATING_HOURS = { start: 6, end: 21 }
const SLOT_DURATION = 1
const BOOKING_BUFFER_MINUTES = 30 // Slots must start at least this many minutes from now

export function generateTimeSlots(): string[] {
  const slots: string[] = []
  for (let hour = OPERATING_HOURS.start; hour < OPERATING_HOURS.end; hour++) {
    const start = hour.toString().padStart(2, '0') + ':00'
    const end = (hour + SLOT_DURATION).toString().padStart(2, '0') + ':00'
    slots.push(`${start}-${end}`)
  }
  return slots
}

export function getAvailableSlotsForCourt(
  bookings: Booking[],
  date: string,
  courtNumber: number,
  disabledSlots: DisabledSlot[] = []
): TimeSlot[] {
  const allSlots = generateTimeSlots()
  const bookedSlots = bookings
    .filter(b => b.date === date && b.court_number === courtNumber)
    .map(b => b.time_slot)
  
  const disabledTimeSlots = disabledSlots
    .filter(s => s.date === date)
    .map(s => s.time_slot)

  // Check if the date is today to disable past/imminent slots
  const now = new Date()
  const isToday = date === format(now, 'yyyy-MM-dd')
  
  // Calculate cutoff time (current time + buffer)
  // Slots starting before this cutoff should be disabled
  const cutoffMinutes = now.getHours() * 60 + now.getMinutes() + BOOKING_BUFFER_MINUTES

  return allSlots.map(slot => {
    // Parse the slot start hour (e.g., "06:00-07:00" -> 6 * 60 = 360 minutes)
    const slotStartHour = parseInt(slot.split(':')[0], 10)
    const slotStartMinutes = slotStartHour * 60
    
    // Slot is past/too soon if it's today and starts before the cutoff
    const isPastOrTooSoon = isToday && slotStartMinutes < cutoffMinutes

    return {
      time: slot,
      available: !bookedSlots.includes(slot) && 
                 !disabledTimeSlots.includes(slot) && 
                 !isPastOrTooSoon
    }
  })
}

export function getAllCourts(): number[] {
  return [1]
}
