-- =============================================
-- Pikolbol Slot Rules: hide-from-customers flag
-- Run this in your Supabase SQL Editor (after slot-rules-migration.sql)
-- When true, slots blocked by the rule are not shown to customers at all
-- (still blocked on the server; admins still see them).
-- =============================================

ALTER TABLE slot_rules
  ADD COLUMN IF NOT EXISTS hide_from_customers BOOLEAN NOT NULL DEFAULT false;

-- Verify:
-- SELECT column_name, data_type, column_default FROM information_schema.columns
--   WHERE table_name = 'slot_rules' AND column_name = 'hide_from_customers';
--   → one row, boolean, false
