/**
 * Manila (UTC+8) time helpers. Client-safe: no server-only imports, so the
 * browser preview and the server compute identical instants.
 */

/**
 * Parse booking date and time_slot into a Date object in Philippines timezone (UTC+8)
 * Handles both formats:
 *   - 24-hour: "17:00-18:00" or "17:00 - 18:00"
 *   - 12-hour: "6:00 AM - 7:00 AM" or "6:00 PM - 7:00 PM"
 */
export function parseBookingDateTime(date: string, timeSlot: string): Date {
  // Extract the start time from the time_slot (split on '-' with optional spaces)
  const startTime = timeSlot.split('-')[0].trim()
  
  let hours = 0
  let minutes = 0
  
  // Try to parse 24-hour format first (e.g., "17:00")
  const match24h = startTime.match(/^(\d{1,2}):(\d{2})$/)
  if (match24h) {
    hours = parseInt(match24h[1], 10)
    minutes = parseInt(match24h[2], 10)
  } else {
    // Try to parse 12-hour format (e.g., "6:00 PM")
    const match12h = startTime.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i)
    if (match12h) {
      hours = parseInt(match12h[1], 10)
      minutes = parseInt(match12h[2], 10)
      const period = match12h[3].toUpperCase()
      
      if (period === 'PM' && hours !== 12) {
        hours += 12
      } else if (period === 'AM' && hours === 12) {
        hours = 0
      }
    } else {
      // Fallback: return start of the booking date in PH timezone (midnight)
      // Parse as Philippines time by constructing explicit ISO string
      return new Date(`${date}T00:00:00+08:00`)
    }
  }

  // Construct the datetime explicitly in Philippines timezone (UTC+8)
  // Format: YYYY-MM-DDTHH:MM:SS+08:00
  const paddedHours = hours.toString().padStart(2, '0')
  const paddedMinutes = minutes.toString().padStart(2, '0')
  const isoString = `${date}T${paddedHours}:${paddedMinutes}:00+08:00`
  
  return new Date(isoString)
}
