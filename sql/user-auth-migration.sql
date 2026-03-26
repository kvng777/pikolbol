-- =============================================
-- Pikolbol User Authentication Migration
-- Run this in your Supabase SQL Editor
-- =============================================

-- 1. Create profiles table to store user details
create table if not exists profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null unique,
  name text,
  phone text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- 2. Enable Row Level Security on profiles
alter table profiles enable row level security;

-- 3. Profile policies - users can only access their own profile
create policy "Users can view own profile" on profiles
  for select using (auth.uid() = user_id);

create policy "Users can update own profile" on profiles
  for update using (auth.uid() = user_id);

create policy "Users can insert own profile" on profiles
  for insert with check (auth.uid() = user_id);

-- 4. Add user_id column to bookings table (nullable for backwards compatibility)
alter table bookings add column if not exists user_id uuid references auth.users(id);

-- 5. Create index for faster user booking queries
create index if not exists idx_bookings_user_id on bookings(user_id);

-- 6. Booking policies for users
-- Note: You may need to adjust these based on your existing RLS policies

-- Users can view their own bookings
create policy "Users can view own bookings" on bookings
  for select using (auth.uid() = user_id or user_id is null);

-- Users can cancel (delete) their own bookings
create policy "Users can delete own bookings" on bookings
  for delete using (auth.uid() = user_id);

-- 7. Function to automatically update updated_at timestamp
create or replace function update_updated_at_column()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

-- 8. Trigger to auto-update updated_at on profiles
drop trigger if exists update_profiles_updated_at on profiles;
create trigger update_profiles_updated_at
  before update on profiles
  for each row
  execute function update_updated_at_column();

-- =============================================
-- IMPORTANT: After running this migration
-- =============================================
-- 1. Go to Authentication > Settings in Supabase dashboard
-- 2. Make sure "Enable Email Signup" is turned ON
-- 3. Configure email templates if needed (optional)
-- =============================================
