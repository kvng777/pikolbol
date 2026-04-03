-- =============================================
-- Cancellation & Refund Tracking Migration
-- Adds fields to track cancellation fees and refunds
-- Run this in your Supabase SQL Editor
-- =============================================

-- Add cancelled_at timestamp (when the booking was cancelled)
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ;

-- Add cancellation_fee (amount charged for cancellation, in PHP)
-- P100/slot if cancelled within 24 hours, 0 if cancelled earlier
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS cancellation_fee INTEGER DEFAULT 0;

-- Add refund_amount (amount to be refunded to customer, in PHP)
-- = payment_amount - cancellation_fee
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS refund_amount INTEGER DEFAULT 0;

-- Add refund_status to track refund processing
-- NULL = not cancelled or no refund needed
-- 'pending' = needs refund processing by admin
-- 'completed' = admin has processed the refund via GCash
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS refund_status TEXT DEFAULT NULL;

-- Create index for faster refund queries
CREATE INDEX IF NOT EXISTS idx_bookings_refund_status ON bookings(refund_status);
CREATE INDEX IF NOT EXISTS idx_bookings_cancelled_at ON bookings(cancelled_at);

-- =============================================
-- NOTES:
-- =============================================
-- 1. Cancellation Policy:
--    - Free cancellation: > 24 hours before booking (full refund)
--    - P100/slot fee: <= 24 hours before booking (partial refund)
--
-- 2. Refund Flow:
--    a. User cancels booking -> refund_status = 'pending' (if refund > 0)
--    b. Admin sees pending refund in dashboard
--    c. Admin processes refund via GCash manually
--    d. Admin clicks "Mark as Refunded" -> refund_status = 'completed'
--
-- 3. For grouped bookings (multiple slots), all rows in the group
--    share the same cancellation_fee and refund_amount values
--    (stored on the first booking, others may be 0 or duplicated)
-- =============================================
