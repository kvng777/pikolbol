-- =============================================
-- Pikolbol Site Notice / Announcement Migration
-- Run this in your Supabase SQL Editor
-- =============================================

-- 1. Create site_notice table (single-row config, like payment_settings)
CREATE TABLE IF NOT EXISTS site_notice (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL DEFAULT '',           -- Notice headline
  message TEXT NOT NULL DEFAULT '',         -- Notice body / description
  is_enabled BOOLEAN NOT NULL DEFAULT true, -- Master on/off toggle
  start_date DATE,                          -- Optional: show from this date (PH). NULL = no lower bound
  end_date DATE,                            -- Optional: show until this date (PH). NULL = no upper bound
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 2. Enable RLS
ALTER TABLE site_notice ENABLE ROW LEVEL SECURITY;

-- 3. Policies: public read (to show the notice), authenticated (admin) write
CREATE POLICY "Anyone can view site notice" ON site_notice
  FOR SELECT USING (true);

CREATE POLICY "Authenticated users can update site notice" ON site_notice
  FOR UPDATE USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can insert site notice" ON site_notice
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');

-- 4. Auto-update updated_at on change
CREATE OR REPLACE FUNCTION update_site_notice_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_site_notice_updated_at ON site_notice;
CREATE TRIGGER update_site_notice_updated_at
  BEFORE UPDATE ON site_notice
  FOR EACH ROW
  EXECUTE FUNCTION update_site_notice_updated_at();

-- 5. Seed default notice (only if table is empty), enabled and pre-filled
INSERT INTO site_notice (title, message, is_enabled)
SELECT
  'Promo Ending Soon: Free Paddles & Balls 🏓',
  E'Please be informed that our promo offering FREE use of paddles and balls will officially end on May 31, 2026.\n\nStarting June 1, 2026, the following rental fees will apply:\n\n• Paddle – P50 / paddle / booking\n• Balls – P25 / booking (for 4 balls)\n\nThank you for your continued support, and we look forward to seeing you at the court! 🏓',
  true
WHERE NOT EXISTS (SELECT 1 FROM site_notice);
