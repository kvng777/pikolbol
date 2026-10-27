-- =============================================
-- Admin AI Assistant: per-turn token usage & cost (monthly budget meter)
-- Run in Supabase SQL Editor
-- =============================================

create table if not exists agent_usage (
  id bigint generated always as identity primary key,
  admin_user_id uuid not null references auth.users(id) on delete cascade,
  thread_id text,
  model text not null,
  input_tokens integer not null default 0,        -- uncached input
  cache_read_tokens integer not null default 0,
  cache_write_tokens integer not null default 0,
  output_tokens integer not null default 0,
  cost_usd numeric(12, 6) not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_agent_usage_created_at on agent_usage(created_at);

-- RLS on with NO policies: service role only.
alter table agent_usage enable row level security;
