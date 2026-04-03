// Booking-related constants
// These are separated from bookingService to allow client-side usage

// Number of hours before a booking that cancellation is no longer allowed
export const CANCELLATION_HOURS_BEFORE = 24

// Cancellation fee per slot (in PHP) when cancelling within 24 hours
// Free cancellation if > 24 hours before booking
export const CANCELLATION_FEE_PER_SLOT = 100
