-- Add missing columns to queue table
alter table queue
  add column if not exists last_5_peers uuid[] default '{}',
  add column if not exists skip_count int default 0,
  add column if not exists matched_peer_id uuid references profiles(id);

-- Add match metadata to rooms
alter table rooms
  add column if not exists match_score int,
  add column if not exists match_reason text;

-- Create match_logs table (was missing)
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

-- Fix RLS on queue: drop auth.uid() policy that blocks guest users
drop policy if exists "Users read own queue" on queue;

-- Allow anyone to SELECT queue rows (needed for Realtime subscriptions by guest users)
create policy "Anyone can read queue" on queue for select using (true);

-- Block insert/update/delete from frontend - server uses service_role which bypasses RLS
create policy "Service role insert queue" on queue for insert with check (false);
create policy "Service role update queue" on queue for update using (false);
create policy "Service role delete queue" on queue for delete using (false);

-- Fix RLS on profiles: allow anon to read profiles (needed to look up peer info)
drop policy if exists "Users read own profile" on profiles;
create policy "Anyone can read profiles" on profiles for select using (true);

-- Allow server to insert/update profiles
create policy "Service role manage profiles" on profiles for insert with check (false);
create policy "Service role update profiles" on profiles for update using (false);

-- Enable Realtime on queue and presence
alter publication supabase_realtime add table queue;
alter publication supabase_realtime add table presence;
