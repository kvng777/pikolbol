/**
 * Booking ID Generator
 * 
 * Generates human-readable short IDs for booking orders.
 * Format: 4 alphanumeric characters (e.g., 'A1B2', 'K9M3')
 */

import { supabase } from './supabase-server'

// Characters: uppercase + digits, excluding confusing ones (0/O, 1/I/L)
const CHARSET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789' // 32 chars
const SHORT_ID_LENGTH = 4
const MAX_RETRIES = 10

/**
 * Generate a random 4-character short ID
 */
export function generateShortId(): string {
  let result = ''
  for (let i = 0; i < SHORT_ID_LENGTH; i++) {
    result += CHARSET.charAt(Math.floor(Math.random() * CHARSET.length))
  }
  return result
}

/**
 * Check if a short ID already exists in the database
 */
async function isShortIdTaken(shortId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('bookings')
    .select('id')
    .eq('short_id', shortId)
    .limit(1)

  if (error) {
    console.error('Error checking short_id uniqueness:', error)
    return false // Assume not taken on error (low collision probability)
  }

  return data !== null && data.length > 0
}

/**
 * Generate a unique short ID (checks database for collisions)
 * Retries up to MAX_RETRIES times if collision detected
 */
export async function generateUniqueShortId(): Promise<string> {
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const shortId = generateShortId()

    const isTaken = await isShortIdTaken(shortId)
    if (!isTaken) {
      return shortId
    }

    console.log(`Short ID collision: ${shortId}, retrying (attempt ${attempt + 1}/${MAX_RETRIES})`)
  }

  // Fallback: append timestamp suffix (extremely unlikely to reach here)
  // With 1M+ combinations and typical booking volumes, collisions are rare
  const fallbackId = generateShortId() + Date.now().toString(36).slice(-2).toUpperCase()
  console.warn(`Max retries reached, using fallback ID: ${fallbackId}`)
  return fallbackId
}

/**
 * Generate a booking group ID (UUID)
 * Links all time slots from the same booking order
 */
export function generateBookingGroupId(): string {
  return crypto.randomUUID()
}
