-- =============================================
-- Pikolbol Pricing Schedules Migration
-- Run this in your Supabase SQL Editor
-- (Versioned prices. A booking uses the newest non-cancelled row whose
--  effective_from <= its play date. Rows are never edited; upcoming rows can
--  be cancelled. Also stores the prices used on each booking.)
-- =============================================

-- 1. Versioned price table
CREATE TABLE IF NOT EXISTS pricing_schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  effective_from DATE NOT NULL,            -- Play date (Asia/Manila) this version starts applying
  rules JSONB NOT NULL,                    -- PricingRules (validated by the app with Zod)
  created_by UUID,                         -- Admin user id (auth.users.id)
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  cancelled_at TIMESTAMPTZ                 -- Set when an upcoming version is cancelled
);

CREATE INDEX IF NOT EXISTS pricing_schedules_active_idx
  ON pricing_schedules (effective_from DESC, created_at DESC)
  WHERE cancelled_at IS NULL;

-- 2. RLS on, no policies: only the service role (server) can read/write
ALTER TABLE pricing_schedules ENABLE ROW LEVEL SECURITY;

-- 3. Seed today's prices so behaviour is unchanged on deploy (only if empty)
INSERT INTO pricing_schedules (effective_from, rules)
SELECT
  DATE '2000-01-01',
  '{
    "tier_prices": { "daytime": 200, "offpeak": 250, "latenight": 300 },
    "hour_tiers": [
      "offpeak",
      "daytime", "daytime", "daytime", "daytime", "daytime", "daytime",
      "daytime", "daytime", "daytime", "daytime", "daytime", "daytime",
      "offpeak", "offpeak", "offpeak", "offpeak",
      "latenight", "latenight"
    ],
    "extra_player_charge": 50,
    "base_players_included": 4,
    "paddle_price": 50,
    "ball_set_price": 25,
    "training_balls_price": 100,
    "equipment_charge_start_date": "2026-06-01",
    "cancellation_fee_per_slot": 100,
    "cancellation_window_hours": 24
  }'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM pricing_schedules);

-- 4. Prices used for each booking (NULL on rows created before this migration)
ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS pricing_snapshot JSONB;
-- { "version_id": "<pricing_schedules.id>", "rules": { ...PricingRules } }

-- Verify:
-- SELECT effective_from, jsonb_array_length(rules->'hour_tiers') AS hours FROM pricing_schedules;
--   → one row, 2000-01-01, hours = 19
