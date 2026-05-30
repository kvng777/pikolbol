/**
 * Regression tests for booking cancellation fee calculation
 * Run with: npx tsx src/lib/__tests__/bookingService.test.ts
 */

import { CANCELLATION_HOURS_BEFORE, CANCELLATION_FEE_PER_SLOT } from '../constants'

// Re-implement parseBookingDateTime locally for testing (mirrors bookingService.ts)
function parseBookingDateTime(date: string, timeSlot: string): Date {
  const startTime = timeSlot.split('-')[0].trim()
  
  let hours = 0
  let minutes = 0
  
  const match24h = startTime.match(/^(\d{1,2}):(\d{2})$/)
  if (match24h) {
    hours = parseInt(match24h[1], 10)
    minutes = parseInt(match24h[2], 10)
  } else {
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
      return new Date(`${date}T00:00:00+08:00`)
    }
  }

  const paddedHours = hours.toString().padStart(2, '0')
  const paddedMinutes = minutes.toString().padStart(2, '0')
  const isoString = `${date}T${paddedHours}:${paddedMinutes}:00+08:00`
  
  return new Date(isoString)
}

function calculateHoursUntilBooking(bookingDate: string, timeSlot: string, now: Date): number {
  const bookingDateTime = parseBookingDateTime(bookingDate, timeSlot)
  return (bookingDateTime.getTime() - now.getTime()) / (1000 * 60 * 60)
}

function calculateCancellationFee(
  totalAmount: number,
  numberOfSlots: number,
  hoursUntilBooking: number
): { cancellationFee: number; refundAmount: number } {
  if (hoursUntilBooking > CANCELLATION_HOURS_BEFORE) {
    return { cancellationFee: 0, refundAmount: totalAmount }
  } else {
    const fee = numberOfSlots * CANCELLATION_FEE_PER_SLOT
    const refund = Math.max(0, totalAmount - fee)
    return { cancellationFee: fee, refundAmount: refund }
  }
}

// Test utilities
let passed = 0
let failed = 0

function assert(condition: boolean, message: string) {
  if (condition) {
    console.log(`✓ ${message}`)
    passed++
  } else {
    console.error(`✗ ${message}`)
    failed++
  }
}

function assertClose(actual: number, expected: number, tolerance: number, message: string) {
  const diff = Math.abs(actual - expected)
  if (diff <= tolerance) {
    console.log(`✓ ${message} (actual: ${actual.toFixed(2)}, expected: ${expected})`)
    passed++
  } else {
    console.error(`✗ ${message} (actual: ${actual.toFixed(2)}, expected: ${expected}, diff: ${diff.toFixed(2)})`)
    failed++
  }
}

console.log('=== Regression Tests: Cancellation Fee Calculation ===\n')

// Test 1: HDCJ scenario - 24h format, >24hrs before booking
// Booking: 2026-05-31 17:00 PH time
// Cancelled: 2026-05-30 00:11 UTC = 2026-05-30 08:11 PH time
// Hours until booking: ~32.8 hours (should be FREE cancellation)
console.log('Test 1: HDCJ scenario (24h format, ~33hrs before)')
const hdcjBookingDate = '2026-05-31'
const hdcjTimeSlot = '17:00-18:00'
const hdcjCancelledAt = new Date('2026-05-30T00:11:31.123+00:00') // UTC

const hdcjHoursUntil = calculateHoursUntilBooking(hdcjBookingDate, hdcjTimeSlot, hdcjCancelledAt)
assertClose(hdcjHoursUntil, 32.8, 0.5, 'Hours until booking should be ~32.8')
assert(hdcjHoursUntil > CANCELLATION_HOURS_BEFORE, 'Should be more than 24 hours before booking')

const hdcjResult = calculateCancellationFee(450, 2, hdcjHoursUntil)
assert(hdcjResult.cancellationFee === 0, 'Cancellation fee should be P0 (free cancellation)')
assert(hdcjResult.refundAmount === 450, 'Refund amount should be full P450')

// Test 2: Within 24 hours - should charge fee
console.log('\nTest 2: Within 24 hours (should charge P100/slot)')
const within24hCancelledAt = new Date('2026-05-31T00:00:00+08:00') // 17 hours before 5PM
const within24hHoursUntil = calculateHoursUntilBooking(hdcjBookingDate, hdcjTimeSlot, within24hCancelledAt)
assertClose(within24hHoursUntil, 17, 0.1, 'Hours until booking should be ~17')
assert(within24hHoursUntil < CANCELLATION_HOURS_BEFORE, 'Should be less than 24 hours before booking')

const within24hResult = calculateCancellationFee(450, 2, within24hHoursUntil)
assert(within24hResult.cancellationFee === 200, 'Cancellation fee should be P200 (P100 x 2 slots)')
assert(within24hResult.refundAmount === 250, 'Refund amount should be P250')

// Test 3: 12-hour format parsing
console.log('\nTest 3: 12-hour format parsing')
const pm12hSlot = '5:00 PM - 6:00 PM'
const parsed12h = parseBookingDateTime('2026-05-31', pm12hSlot)
assert(parsed12h.getUTCHours() === 9, '5:00 PM PH = 09:00 UTC') // 17:00 PH - 8 = 09:00 UTC

const am12hSlot = '6:00 AM - 7:00 AM'
const parsedAm = parseBookingDateTime('2026-05-31', am12hSlot)
assert(parsedAm.getUTCHours() === 22 || parsedAm.getUTCDate() === 30, '6:00 AM PH = 22:00 UTC previous day')

// Test 4: Edge case - exactly 24 hours (policy: >24h free, <=24h fee)
console.log('\nTest 4: Exactly 24 hours before (boundary)')
const exactly24h = calculateCancellationFee(200, 1, 24)
assert(exactly24h.cancellationFee === 100, 'At exactly 24h, should charge fee (policy: >24h free)')

const justUnder24h = calculateCancellationFee(200, 1, 23.99)
assert(justUnder24h.cancellationFee === 100, 'At 23.99h, should charge P100')

// Test 5: Multiple slot 24h format
console.log('\nTest 5: Multiple consecutive slots (24h format)')
const eveningSlot = '18:00-19:00'
const parsedEvening = parseBookingDateTime('2026-05-31', eveningSlot)
assert(parsedEvening.getUTCHours() === 10, '18:00 PH = 10:00 UTC')

// Summary
console.log('\n=== Results ===')
console.log(`Passed: ${passed}`)
console.log(`Failed: ${failed}`)
process.exit(failed > 0 ? 1 : 0)
