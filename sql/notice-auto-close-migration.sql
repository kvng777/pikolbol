-- =============================================
-- Pikolbol Site Notice - Auto-close Timer Migration
-- Run this in your Supabase SQL Editor
-- (Adds a configurable auto-close duration to the notice toast)
-- =============================================

ALTER TABLE site_notice
  ADD COLUMN IF NOT EXISTS auto_close_seconds INTEGER NOT NULL DEFAULT 10;
-- How long (in seconds) the notice stays visible before auto-closing
