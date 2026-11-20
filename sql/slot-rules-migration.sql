-- =============================================
-- Pikolbol Slot Rules Migration
-- Run this in your Supabase SQL Editor
-- (Reusable time-slot blocks: a slot on date D is blocked when
--  start_date <= D, end_date IS NULL OR D <= end_date,
--  ISO weekday(D) is in weekdays, and the slot is in time_slots.)
-- =============================================

CREATE TABLE IF NOT EXISTS slot_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  label TEXT CHECK (label IS NULL OR char_length(label) BETWEEN 1 AND 30),  -- NULL → customers see "Blocked"
  start_date DATE NOT NULL,                                                -- First play date (Asia/Manila)
  end_date DATE CHECK (end_date IS NULL OR end_date >= start_date),        -- Inclusive; NULL = no end
  weekdays SMALLINT[] NOT NULL
    CHECK (cardinality(weekdays) >= 1 AND weekdays <@ ARRAY[1,2,3,4,5,6,7]::SMALLINT[]),  -- 1 = Mon … 7 = Sun
  time_slots TEXT[] NOT NULL CHECK (cardinality(time_slots) >= 1),         -- e.g. {'07:00-08:00'}
  created_by UUID,                                                         -- Admin user id
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS slot_rules_dates_idx ON slot_rules (start_date, end_date);

-- RLS on, no policies: only the service role (server) can read/write
ALTER TABLE slot_rules ENABLE ROW LEVEL SECURITY;

-- Verify:
-- SELECT count(*) FROM slot_rules;   → 0
