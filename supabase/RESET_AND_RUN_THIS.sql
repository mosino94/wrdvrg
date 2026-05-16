-- ============================================================
-- WRDVRG — FULL SCHEMA RESET
-- Run this in Supabase SQL Editor to set up / reset the DB
-- ============================================================

-- Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Drop tables in dependency order
DROP TABLE IF EXISTS friend_requests CASCADE;
DROP TABLE IF EXISTS friends CASCADE;
DROP TABLE IF EXISTS call_history CASCADE;
DROP TABLE IF EXISTS match_logs CASCADE;
DROP TABLE IF EXISTS queue_cooldowns CASCADE;
DROP TABLE IF EXISTS blocks CASCADE;
DROP TABLE IF EXISTS queue CASCADE;
DROP TABLE IF EXISTS presence CASCADE;
DROP TABLE IF EXISTS rooms CASCADE;
DROP TABLE IF EXISTS profiles CASCADE;

-- Profiles
CREATE TABLE profiles (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  alias TEXT UNIQUE NOT NULL,
  gender TEXT CHECK (gender IN ('male', 'female')) DEFAULT NULL,
  country_code CHAR(2) DEFAULT NULL,
  reputation INTEGER DEFAULT 50,
  is_guest BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE profiles REPLICA IDENTITY FULL;

-- Rooms
CREATE TABLE rooms (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  room_name TEXT NOT NULL,
  room_url TEXT NOT NULL DEFAULT '',
  participant_1 UUID REFERENCES profiles(id) ON DELETE SET NULL,
  participant_2 UUID REFERENCES profiles(id) ON DELETE SET NULL,
  match_score INTEGER DEFAULT 0,
  match_reason TEXT DEFAULT 'base',
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'reconnecting', 'ended')),
  p1_connected BOOLEAN DEFAULT FALSE,
  p2_connected BOOLEAN DEFAULT FALSE,
  p1_last_heartbeat TIMESTAMPTZ,
  p2_last_heartbeat TIMESTAMPTZ,
  p1_disconnect_at TIMESTAMPTZ,
  p2_disconnect_at TIMESTAMPTZ,
  end_reason TEXT,
  started_at TIMESTAMPTZ DEFAULT NOW(),
  ended_at TIMESTAMPTZ DEFAULT NULL
);

-- Queue
CREATE TABLE queue (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  status TEXT DEFAULT 'waiting' CHECK (status IN ('waiting', 'matched', 'cancelled')),
  gender_filter TEXT DEFAULT 'all',
  prefer_countries TEXT[] DEFAULT '{}',
  avoid_countries TEXT[] DEFAULT '{}',
  last_peer_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  last_5_peers UUID[] DEFAULT '{}',
  matched_peer_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  skip_count INTEGER DEFAULT 0,
  joined_at TIMESTAMPTZ DEFAULT NOW(),
  last_heartbeat TIMESTAMPTZ DEFAULT NOW(),
  matched_at TIMESTAMPTZ DEFAULT NULL,
  room_url TEXT DEFAULT NULL,
  room_token TEXT DEFAULT NULL,
  room_id UUID REFERENCES rooms(id) ON DELETE SET NULL
);
ALTER TABLE queue REPLICA IDENTITY FULL;

-- Match logs
CREATE TABLE match_logs (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_a UUID REFERENCES profiles(id) ON DELETE SET NULL,
  user_b UUID REFERENCES profiles(id) ON DELETE SET NULL,
  score INTEGER,
  score_breakdown JSONB,
  wait_time_a_seconds INTEGER,
  wait_time_b_seconds INTEGER,
  filters_a JSONB,
  filters_b JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Presence
CREATE TABLE presence (
  profile_id UUID PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
  status TEXT DEFAULT 'online',
  last_heartbeat TIMESTAMPTZ DEFAULT NOW()
);

-- Queue cooldowns
CREATE TABLE queue_cooldowns (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  profile_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  reason TEXT,
  cooldown_until TIMESTAMPTZ
);

-- Blocks
CREATE TABLE blocks (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  blocker_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  blocked_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(blocker_id, blocked_id)
);

-- Call history
CREATE TABLE call_history (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  owner_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  peer_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  called_at TIMESTAMPTZ DEFAULT NOW(),
  duration_seconds INTEGER DEFAULT 0
);

-- Friends (bidirectional — 2 rows per friendship)
CREATE TABLE friends (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  profile_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  friend_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(profile_id, friend_id)
);

-- Friend requests
CREATE TABLE friend_requests (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  sender_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  receiver_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  sender_alias TEXT,
  sender_country CHAR(2),
  sender_gender TEXT,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'declined', 'cancelled')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE friend_requests REPLICA IDENTITY FULL;

-- ============================================================
-- RLS — allow anon reads on tables needed for Realtime
-- ============================================================

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anon_read" ON profiles FOR SELECT TO anon USING (true);

ALTER TABLE queue ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anon_read" ON queue FOR SELECT TO anon USING (true);

ALTER TABLE friend_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anon_read" ON friend_requests FOR SELECT TO anon USING (true);

-- ============================================================
-- Realtime publication
-- ============================================================
BEGIN;
  DROP PUBLICATION IF EXISTS supabase_realtime;
  CREATE PUBLICATION supabase_realtime FOR TABLE queue, friend_requests, profiles;
COMMIT;
