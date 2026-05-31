-- =============================================
-- Pikolbol Slot Uniqueness Fix Migration
-- Run this in your Supabase SQL Editor
-- =============================================
--
-- Problem:
--   The original constraint `bookings_date_time_slot_court_number_key`
--   enforced UNIQUE (date, time_slot, court_number) regardless of payment_status.
--   This meant a cancelled or rejected booking still permanently reserved its
--   slot at the database level, so the slot could never be re-booked -- even
--   though the app treats cancelled/rejected as available (pending + confirmed
--   are the only statuses that hold a slot).
--
-- Fix:
--   Replace the status-blind constraint with a PARTIAL unique index that only
--   enforces uniqueness for bookings that actually hold a slot (everything
--   except cancelled/rejected). Cancelled/rejected rows are preserved for
--   finance/refund history but no longer block re-booking. Genuine double-
--   booking of an active slot is still prevented.
--
--   IS DISTINCT FROM is used so that legacy NULL-status rows remain protected.
-- =============================================

ALTER TABLE bookings
  DROP CONSTRAINT IF EXISTS bookings_date_time_slot_court_number_key;

CREATE UNIQUE INDEX IF NOT EXISTS bookings_active_slot_unique
  ON bookings (date, time_slot, court_number)
  WHERE payment_status IS DISTINCT FROM 'cancelled'
    AND payment_status IS DISTINCT FROM 'rejected';
