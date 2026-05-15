-- Fix 1: Add missing columns to queue table
alter table queue
  add column if not exists last_5_peers uuid[] default '{}',
  add column if not exists skip_count int default 0,
  add column if not exists matched_peer_id uuid references profiles(id);

-- Fix 2: Add match metadata to rooms
alter table rooms
  add column if not exists match_score int,
  add column if not exists match_reason text;

-- Fix 3: Create match_logs table (was missing)
create table if not exists match_logs (
  id uuid primary key default gen_random_uuid(),
  user_a uuid references profiles(id),
  user_b uuid references profiles(id),
  score int,
  score_breakdown jsonb default '{}',
  wait_time_a_seconds int,
  wait_time_b_seconds int,
  filters_a jsonb default '{}',
  filters_b jsonb default '{}',
  created_at timestamptz default now()
);
alter table match_logs enable row level security;
create policy "service_role only" on match_logs for all using (false);

-- Fix 4: Fix RLS on queue to allow anon SELECT (needed for Realtime subscriptions)
-- Guest users are not Supabase Auth users, so auth.uid() returns null and blocks them
drop policy if exists "Users read own queue" on queue;

-- Allow anon/service_role to read queue rows (server handles writes)
create policy "Anyone can read queue" on queue for select using (true);

-- Only service_role can insert/update/delete (done via backend API)
create policy "Service role insert queue" on queue for insert with check (false);
create policy "Service role update queue" on queue for update using (false);
create policy "Service role delete queue" on queue for delete using (false);

-- Fix 5: Enable Realtime on queue table
alter publication supabase_realtime add table queue;
alter publication supabase_realtime add table presence;
