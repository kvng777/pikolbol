-- Reschedule feature: track when a booking has been rescheduled
-- Stores the original date/time_slot before the most recent reschedule.
-- rescheduled_at is non-null when the booking has been rescheduled at least once.

ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS rescheduled_from_date TEXT,
  ADD COLUMN IF NOT EXISTS rescheduled_from_time_slot TEXT,
  ADD COLUMN IF NOT EXISTS rescheduled_at TIMESTAMPTZ;
