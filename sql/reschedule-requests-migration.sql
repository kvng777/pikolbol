-- Reschedule approval workflow: stores pending reschedule requests.
-- Admin must approve or reject before the booking is moved.
-- While pending, the requested new slots are "held" (unavailable to others).

CREATE TABLE IF NOT EXISTS reschedule_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_group_id TEXT,
  legacy_booking_id TEXT,
  user_id TEXT NOT NULL,
  short_id TEXT,
  customer_name TEXT NOT NULL,
  customer_email TEXT NOT NULL,
  customer_phone TEXT NOT NULL,
  -- Original schedule (for display)
  original_date TEXT NOT NULL,
  original_time_slots TEXT[] NOT NULL,
  -- Requested new schedule
  new_date TEXT NOT NULL,
  new_time_slots TEXT[] NOT NULL,
  -- Status: pending | approved | rejected | cancelled
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ DEFAULT now(),
  resolved_at TIMESTAMPTZ
);

-- Index for fast lookups of pending requests by date (slot holding)
CREATE INDEX IF NOT EXISTS idx_reschedule_requests_pending_date
  ON reschedule_requests (new_date)
  WHERE status = 'pending';

-- Index for fast lookups of pending requests by booking group
CREATE INDEX IF NOT EXISTS idx_reschedule_requests_pending_group
  ON reschedule_requests (booking_group_id)
  WHERE status = 'pending';
