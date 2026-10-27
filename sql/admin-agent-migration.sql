-- =============================================
-- Admin AI Assistant: chat threads & messages
-- Run in Supabase SQL Editor
-- =============================================

create table if not exists agent_threads (
  id text primary key,                                   -- client-generated UUID
  admin_user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_agent_threads_admin
  on agent_threads(admin_user_id, updated_at desc);

create table if not exists agent_messages (
  thread_id text not null references agent_threads(id) on delete cascade,
  id text not null,                                      -- AI SDK UIMessage id
  seq integer not null,                                  -- position in thread
  role text not null check (role in ('user', 'assistant')),
  parts jsonb not null,                                  -- UIMessage.parts
  created_at timestamptz not null default now(),
  -- Composite key: a client-chosen message id can never overwrite another thread's row.
  primary key (thread_id, id)
);

create index if not exists idx_agent_messages_thread_seq
  on agent_messages(thread_id, seq);

-- RLS on with NO policies: only the service-role server client can read/write.
alter table agent_threads enable row level security;
alter table agent_messages enable row level security;
