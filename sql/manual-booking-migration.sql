-- =============================================
-- Pikolbol Manual (Admin) Booking Migration
-- Run this in your Supabase SQL Editor
-- (Flags bookings created manually by an admin on behalf of a player.
--  These are confirmed immediately, send no emails, and are editable anytime.)
-- =============================================

ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS is_manual BOOLEAN NOT NULL DEFAULT false;
-- true = booking was created manually by an admin (walk-in / phone booking)
