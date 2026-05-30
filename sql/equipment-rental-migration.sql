-- =============================================
-- Pikolbol Equipment Rental Migration
-- Run this in your Supabase SQL Editor
-- (Adds paddle/ball rental tracking to bookings.
--  Charges apply to play dates on/after 2026-06-01; free during the promo.)
-- =============================================

ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS paddles_count INTEGER NOT NULL DEFAULT 0;
-- Number of paddles rented for this booking order (P50 each, per booking, from June 1, 2026)

ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS needs_balls BOOLEAN NOT NULL DEFAULT false;
-- Whether a set of balls was rented (P25 per booking, from June 1, 2026)
