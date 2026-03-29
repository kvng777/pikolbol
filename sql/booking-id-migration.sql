-- =============================================
-- Booking ID Migration
-- Adds human-readable short_id and booking_group_id
-- Run this in your Supabase SQL Editor
-- =============================================

-- Add short_id column (human-readable, e.g., 'A1B2')
-- Multiple rows from the same booking order share the same short_id
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS short_id TEXT;

-- Add booking_group_id column (UUID that links slots from same booking order)
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS booking_group_id UUID;

-- Create indexes for fast lookups
CREATE INDEX IF NOT EXISTS idx_bookings_short_id ON bookings(short_id);
CREATE INDEX IF NOT EXISTS idx_bookings_booking_group_id ON bookings(booking_group_id);

-- =============================================
-- NOTES:
-- =============================================
-- 1. short_id is NOT unique at the row level because multiple rows 
--    (time slots) from the same booking order share the same short_id
--
-- 2. short_id format: 4 alphanumeric characters (e.g., 'A1B2', 'K9M3')
--    - Uses charset: ABCDEFGHJKMNPQRSTUVWXYZ23456789 (32 chars)
--    - Excludes confusing characters: 0, O, 1, I, L
--    - 32^4 = 1,048,576 unique combinations
--
-- 3. booking_group_id is a UUID that groups all time slots 
--    belonging to the same booking order
--
-- 4. No backfill is needed if starting fresh. If you have existing
--    bookings without short_id, they will display as "—" in the admin table
-- =============================================
