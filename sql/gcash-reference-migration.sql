-- Add gcash_reference column to bookings table
-- This stores the GCash reference number entered by the user during payment

ALTER TABLE bookings ADD COLUMN IF NOT EXISTS gcash_reference TEXT;
