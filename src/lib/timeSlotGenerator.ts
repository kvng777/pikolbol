import { Booking, TimeSlot, DisabledSlot } from '@/types/booking'

const OPERATING_HOURS = { start: 8, end: 22 }
const SLOT_DURATION = 1

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

  return allSlots.map(slot => ({
    time: slot,
    available: !bookedSlots.includes(slot) && !disabledTimeSlots.includes(slot)
  }))
}

export function getAllCourts(): number[] {
  return [1]
}
