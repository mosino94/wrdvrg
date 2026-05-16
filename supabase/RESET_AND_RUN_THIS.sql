-- =================================================================
-- WRDVRG - COMPLETE DATABASE RESET
-- Run this ONCE in Supabase SQL Editor to wipe and rebuild from scratch
-- After running this, the app will work correctly
-- =================================================================

-- Step 1: Drop all existing tables (reverse dependency order)
drop table if exists match_logs cascade;
drop table if exists queue_cooldowns cascade;
drop table if exists recovery_attempts cascade;
drop table if exists moderation_logs cascade;
drop table if exists reports cascade;
drop table if exists blocks cascade;
drop table if exists call_history cascade;
drop table if exists callback_requests cascade;
drop table if exists friend_requests cascade;
drop table if exists friends cascade;
drop table if exists rooms cascade;
drop table if exists queue cascade;
drop table if exists presence cascade;
drop table if exists sessions cascade;
drop table if exists trusted_devices cascade;
drop table if exists recovery_codes cascade;
drop table if exists profiles cascade;

-- Step 2: Recreate all tables with correct schema

-- PROFILES
create table profiles (
  id uuid primary key default gen_random_uuid(),
  alias text unique not null,
  gender text check (gender in ('male', 'female')),
  country_code char(2),
  device_fingerprint text,
  is_guest boolean default true,
  username text unique,
  secret_hash text,
  recovery_type text check (recovery_type in ('birthday', 'custom')),
  recovery_hash text,
  recovery_question text,
  accept_callbacks boolean default true,
  reputation int default 100 check (reputation between 0 and 100),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index idx_profiles_alias on profiles(alias);
create index idx_profiles_username on profiles(username) where username is not null;

-- RECOVERY CODES
create table recovery_codes (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid references profiles(id) on delete cascade,
  code_hash text not null,
  used boolean default false,
  created_at timestamptz default now()
);
create index idx_recovery_codes_profile on recovery_codes(profile_id);

-- TRUSTED DEVICES
create table trusted_devices (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid references profiles(id) on delete cascade,
  device_fingerprint text not null,
  device_label text,
  refresh_token_hash text not null,
  last_seen timestamptz default now(),
  created_at timestamptz default now()
);
create index idx_trusted_devices_profile on trusted_devices(profile_id);

-- SESSIONS
create table sessions (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid references profiles(id) on delete cascade,
  token_hash text not null,
  expires_at timestamptz not null,
  created_at timestamptz default now()
);
create index idx_sessions_profile on sessions(profile_id);
create index idx_sessions_expiry on sessions(expires_at);

-- PRESENCE
create table presence (
  profile_id uuid primary key references profiles(id) on delete cascade,
  status text default 'online' check (status in ('online', 'searching', 'in_call', 'offline')),
  last_heartbeat timestamptz default now()
);

-- MATCHMAKING QUEUE (with all required columns)
create table queue (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid references profiles(id) on delete cascade,
  gender_filter text default 'all' check (gender_filter in ('all', 'male', 'female')),
  prefer_countries char(2)[],
  avoid_countries char(2)[],
  last_peer_id uuid references profiles(id),
  last_5_peers uuid[] default '{}',
  skip_count int default 0,
  matched_peer_id uuid references profiles(id),
  status text default 'waiting' check (status in ('waiting', 'matched', 'cancelled')),
  room_url text,
  room_token text,
  joined_at timestamptz default now(),
  matched_at timestamptz,
  last_heartbeat timestamptz default now()
);
create index idx_queue_status on queue(status, joined_at);
create index idx_queue_profile on queue(profile_id);

-- VOICE ROOMS
create table rooms (
  id uuid primary key default gen_random_uuid(),
  daily_room_name text unique not null,
  daily_room_url text not null,
  participant_1 uuid references profiles(id),
  participant_2 uuid references profiles(id),
  match_score int,
  match_reason text,
  started_at timestamptz default now(),
  ended_at timestamptz
);
create index idx_rooms_active on rooms(ended_at) where ended_at is null;

-- FRIENDS
create table friends (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references profiles(id) on delete cascade,
  friend_id uuid references profiles(id) on delete cascade,
  nickname text,
  created_at timestamptz default now(),
  unique(owner_id, friend_id)
);
create index idx_friends_owner on friends(owner_id);

-- FRIEND REQUESTS
create table friend_requests (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid references profiles(id) on delete cascade,
  receiver_id uuid references profiles(id) on delete cascade,
  status text default 'pending' check (status in ('pending', 'accepted', 'rejected')),
  created_at timestamptz default now(),
  unique(sender_id, receiver_id)
);

-- CALLBACK REQUESTS
create table callback_requests (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid references profiles(id) on delete cascade,
  target_id uuid references profiles(id) on delete cascade,
  status text default 'pending' check (status in ('pending', 'accepted', 'declined', 'blocked')),
  created_at timestamptz default now(),
  responded_at timestamptz
);
create index idx_callback_target on callback_requests(target_id, status);

-- CALL HISTORY
create table call_history (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references profiles(id) on delete cascade,
  peer_id uuid references profiles(id),
  peer_alias text not null,
  peer_country char(2),
  peer_gender text,
  duration_seconds int default 0,
  called_at timestamptz default now()
);
create index idx_history_owner on call_history(owner_id, called_at desc);

-- BLOCKS
create table blocks (
  blocker_id uuid references profiles(id) on delete cascade,
  blocked_id uuid references profiles(id) on delete cascade,
  reason text,
  created_at timestamptz default now(),
  primary key(blocker_id, blocked_id)
);
create index idx_blocks_blocker on blocks(blocker_id);
create index idx_blocks_blocked on blocks(blocked_id);

-- REPORTS
create table reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid references profiles(id),
  reported_id uuid references profiles(id),
  room_id uuid references rooms(id),
  reason text not null,
  details text,
  status text default 'pending' check (status in ('pending', 'reviewed', 'actioned')),
  created_at timestamptz default now()
);
create index idx_reports_reported on reports(reported_id, created_at desc);

-- MODERATION LOGS
create table moderation_logs (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid references profiles(id),
  event_type text not null,
  metadata jsonb default '{}',
  ip_address text,
  created_at timestamptz default now()
);
create index idx_modlogs_profile on moderation_logs(profile_id, created_at desc);
create index idx_modlogs_event on moderation_logs(event_type, created_at desc);

-- RECOVERY ATTEMPTS
create table recovery_attempts (
  id uuid primary key default gen_random_uuid(),
  username text not null,
  ip_address text,
  success boolean default false,
  attempted_at timestamptz default now()
);
create index idx_recovery_attempts on recovery_attempts(username, attempted_at desc);

-- QUEUE COOLDOWNS
create table queue_cooldowns (
  profile_id uuid primary key references profiles(id) on delete cascade,
  reason text not null,
  cooldown_until timestamptz not null
);

-- MATCH LOGS
create table match_logs (
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

-- Step 3: Enable RLS on all tables
alter table profiles enable row level security;
alter table recovery_codes enable row level security;
alter table trusted_devices enable row level security;
alter table sessions enable row level security;
alter table presence enable row level security;
alter table queue enable row level security;
alter table rooms enable row level security;
alter table friends enable row level security;
alter table friend_requests enable row level security;
alter table callback_requests enable row level security;
alter table call_history enable row level security;
alter table blocks enable row level security;
alter table reports enable row level security;
alter table moderation_logs enable row level security;
alter table recovery_attempts enable row level security;
alter table queue_cooldowns enable row level security;
alter table match_logs enable row level security;

-- Step 4: RLS Policies
-- PROFILES: Anyone can read (needed to fetch peer info after match)
create policy "Anyone can read profiles" on profiles for select using (true);
-- Insert/update only via service_role (backend API)
create policy "Service role insert profiles" on profiles for insert with check (false);
create policy "Service role update profiles" on profiles for update using (false);

-- PRESENCE: Anyone can read (show online users)
create policy "Anyone read presence" on presence for select using (true);
create policy "Service role manage presence" on presence for all with check (false);

-- QUEUE: Anyone can SELECT (needed for Realtime subscriptions - guests have no auth.uid())
create policy "Anyone can read queue" on queue for select using (true);
-- Only service_role can write (backend API uses service_role key)
create policy "Service role insert queue" on queue for insert with check (false);
create policy "Service role update queue" on queue for update using (false);
create policy "Service role delete queue" on queue for delete using (false);

-- ROOMS: Anyone can read (to check active call)
create policy "Anyone read rooms" on rooms for select using (true);
create policy "Service role manage rooms" on rooms for all with check (false);

-- FRIENDS
create policy "Users read own friends" on friends for all using (owner_id = auth.uid());

-- FRIEND REQUESTS
create policy "Users read own friend requests" on friend_requests for select using (sender_id = auth.uid() or receiver_id = auth.uid());

-- CALL HISTORY: Only own records
create policy "Users read own history" on call_history for select using (owner_id = auth.uid());
create policy "Service role manage history" on call_history for all with check (false);

-- BLOCKS
create policy "Users read own blocks" on blocks for all using (blocker_id = auth.uid());

-- REPORTS
create policy "Users read own reports" on reports for select using (reporter_id = auth.uid());
create policy "Service role manage reports" on reports for all with check (false);

-- Admin-only tables (service_role bypasses RLS)
create policy "No direct access" on moderation_logs for all using (false);
create policy "No direct access" on recovery_attempts for all using (false);
create policy "No direct access" on match_logs for all using (false);
create policy "No direct access" on queue_cooldowns for all using (false);
create policy "No direct access" on recovery_codes for all using (false);
create policy "No direct access" on trusted_devices for all using (false);
create policy "No direct access" on sessions for all using (false);
create policy "No direct access" on callback_requests for all using (false);
create policy "No direct access" on friend_requests for all using (false);

-- Step 5: Enable Realtime
alter publication supabase_realtime add table queue;
alter publication supabase_realtime add table presence;
alter publication supabase_realtime add table profiles;

-- Done! Schema is ready for wrdvrg.
