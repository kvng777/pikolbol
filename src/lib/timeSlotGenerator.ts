import { format } from 'date-fns'
import { Booking, TimeSlot, DisabledSlot } from '@/types/booking'

const OPERATING_HOURS = { start: 5, end: 24 }
const SLOT_DURATION = 1
const BOOKING_BUFFER_MINUTES = 30 // Slots must start at least this many minutes from now

export function generateTimeSlots(): string[] {
  const slots: string[] = []
  for (let hour = OPERATING_HOURS.start; hour < OPERATING_HOURS.end; hour++) {
    const endHour = (hour + SLOT_DURATION) % 24
    const start = hour.toString().padStart(2, '0') + ':00'
    const end = endHour.toString().padStart(2, '0') + ':00'
    slots.push(`${start}-${end}`)
  }
  return slots
}

export interface SlotAvailabilityOptions {
  /** Skip ALL time checks — past slots + buffer (admin manual bookings). */
  ignorePast?: boolean
  /** Override the 30-min booking buffer. 0 = no buffer. Default: 30. */
  bufferMinutes?: number
  /** Additional slots held by pending reschedule requests (shown as "booked"). */
  heldSlots?: string[]
}

export function getAvailableSlotsForCourt(
  bookings: Booking[],
  date: string,
  courtNumber: number,
  disabledSlots: DisabledSlot[] = [],
  /**
   * Accepts a boolean (legacy) or an options object (new).
   * - `true`  → { ignorePast: true, bufferMinutes: 0 }   (admin manual bookings)
   * - `false` → default behavior                          (normal bookings)
   * - object  → fine-grained control                      (reschedule, etc.)
   */
  optionsOrIgnoreTimeBuffer: boolean | SlotAvailabilityOptions = false
): TimeSlot[] {
  // Normalise legacy boolean into options object
  const opts: SlotAvailabilityOptions =
    typeof optionsOrIgnoreTimeBuffer === 'boolean'
      ? { ignorePast: optionsOrIgnoreTimeBuffer, bufferMinutes: optionsOrIgnoreTimeBuffer ? 0 : BOOKING_BUFFER_MINUTES }
      : optionsOrIgnoreTimeBuffer

  const ignorePast = opts.ignorePast ?? false
  const bufferMinutes = opts.bufferMinutes ?? BOOKING_BUFFER_MINUTES
  const heldSlots = opts.heldSlots ?? []

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
  const cutoffMinutes = now.getHours() * 60 + now.getMinutes() + bufferMinutes

  return allSlots.map(slot => {
    const slotStartHour = parseInt(slot.split(':')[0], 10)
    const slotStartMinutes = slotStartHour * 60

    // Slot is past/too soon if it's today and starts before the cutoff
    const isPastOrTooSoon = !ignorePast && isToday && slotStartMinutes < cutoffMinutes

    let reason: TimeSlot['reason']
    if (isPastOrTooSoon) reason = 'past'
    else if (bookedSlots.includes(slot) || heldSlots.includes(slot)) reason = 'booked'
    else if (disabledTimeSlots.includes(slot)) reason = 'disabled'

    return {
      time: slot,
      available: !reason,
      reason,
    }
  })
}

export function getAllCourts(): number[] {
  return [1]
}
