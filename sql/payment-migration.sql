-- =============================================
-- Pikolbol Payment System Migration
-- Run this in your Supabase SQL Editor
-- =============================================

-- 1. Add payment fields to bookings table
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS payment_status TEXT DEFAULT 'pending';
-- Values: 'pending' (waiting for payment), 'awaiting_confirmation' (user says they paid), 
--         'confirmed' (admin verified), 'expired' (timeout), 'rejected' (admin rejected)

ALTER TABLE bookings ADD COLUMN IF NOT EXISTS payment_deadline TIMESTAMPTZ;
-- When payment must be completed by (created_at + timeout_minutes)

ALTER TABLE bookings ADD COLUMN IF NOT EXISTS payment_confirmed_at TIMESTAMPTZ;
-- When admin confirmed the payment

ALTER TABLE bookings ADD COLUMN IF NOT EXISTS payment_amount INTEGER;
-- Amount in PHP (e.g., 200 for Php200)

-- 2. Create payment_settings table for admin configuration
CREATE TABLE IF NOT EXISTS payment_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  gcash_qr_url TEXT,                              -- URL to QR image in Supabase Storage
  gcash_name TEXT,                                -- Account holder name to display
  gcash_number TEXT,                              -- GCash number for reference
  payment_timeout_minutes INTEGER DEFAULT 15,    -- How long users have to pay
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 3. Enable RLS on payment_settings
ALTER TABLE payment_settings ENABLE ROW LEVEL SECURITY;

-- 4. Payment settings policies (admin only for write, public for read)
-- Everyone can read payment settings (to show QR on payment screen)
CREATE POLICY "Anyone can view payment settings" ON payment_settings
  FOR SELECT USING (true);

-- Only authenticated users (admin) can update
-- Note: You may want to add role-based access later
CREATE POLICY "Authenticated users can update payment settings" ON payment_settings
  FOR UPDATE USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can insert payment settings" ON payment_settings
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');

-- 5. Insert default settings row (only if table is empty)
INSERT INTO payment_settings (payment_timeout_minutes)
SELECT 15
WHERE NOT EXISTS (SELECT 1 FROM payment_settings);

-- 6. Create index for faster payment status queries
CREATE INDEX IF NOT EXISTS idx_bookings_payment_status ON bookings(payment_status);
CREATE INDEX IF NOT EXISTS idx_bookings_payment_deadline ON bookings(payment_deadline);

-- 7. Function to automatically update updated_at on payment_settings
CREATE OR REPLACE FUNCTION update_payment_settings_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 8. Trigger for payment_settings updated_at
DROP TRIGGER IF EXISTS update_payment_settings_updated_at ON payment_settings;
CREATE TRIGGER update_payment_settings_updated_at
  BEFORE UPDATE ON payment_settings
  FOR EACH ROW
  EXECUTE FUNCTION update_payment_settings_updated_at();

-- =============================================
-- Supabase Storage Setup (run separately or via dashboard)
-- =============================================
-- 1. Create a bucket called 'payment-assets' in Supabase Storage
-- 2. Make it public (so QR images can be displayed)
-- 3. Or run this SQL:

-- INSERT INTO storage.buckets (id, name, public) 
-- VALUES ('payment-assets', 'payment-assets', true)
-- ON CONFLICT (id) DO NOTHING;

-- =============================================
-- IMPORTANT: After running this migration
-- =============================================
-- 1. Go to Storage in Supabase dashboard
-- 2. Create a bucket named "payment-assets"
-- 3. Set it to PUBLIC (so QR code images can be viewed)
-- =============================================
