import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { createClient } from '@supabase/supabase-js';

// Setup Supabase Client
function createServiceClient() {
  const supabaseUrl = process.env.VITE_SUPABASE_URL || 'https://placeholder.supabase.co';
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || 'placeholder';
  return createClient(supabaseUrl, supabaseKey);
}

const app = express();
app.use(express.json());
const PORT = 3000;

// ─── HELPER: Create Daily.co Meeting Token ───
async function createMeetingToken(roomName: string, userName: string) {
  const response = await fetch('https://api.daily.co/v1/meeting-tokens', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${process.env.DAILY_API_KEY || ''}`,
    },
    body: JSON.stringify({
      properties: {
        room_name: roomName,
        user_name: userName,
        exp: Math.floor(Date.now() / 1000) + 3600,
        is_owner: false,
        enable_screenshare: false,
      },
    }),
  });
  const data = await response.json();
  return data.token;
}

app.post('/api/sync-profile', async (req, res) => {
  try {
    const { alias, countryCode, gender } = req.body;
    if (!alias) return res.status(400).json({ error: 'Alias is required' });
    
    const supabase = createServiceClient();
    
    let { data: profile } = await supabase
      .from('profiles')
      .select('*')
      .eq('alias', alias)
      .maybeSingle();

    if (!profile) {
      const { data: newProfile, error } = await supabase
        .from('profiles')
        .insert({
          alias,
          country_code: countryCode || null,
          gender: gender || null,
          is_guest: true
        })
        .select()
        .single();
        
      if (error) throw error;
      profile = newProfile;
    } else {
      const updates: any = {};
      let needsUpdate = false;
      if (countryCode && profile.country_code !== countryCode) { updates.country_code = countryCode; needsUpdate = true; }
      if (gender !== undefined && profile.gender !== gender) { updates.gender = gender; needsUpdate = true; }
      
      if (needsUpdate) {
        const { data: updated, error } = await supabase
          .from('profiles')
          .update(updates)
          .eq('id', profile.id)
          .select()
          .single();
        if (!error && updated) profile = updated;
      }
    }
    
    return res.json(profile);
  } catch (err: any) {
    console.error('Sync profile error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ─── 2. ENQUEUE FUNCTION ───
app.post('/api/enqueue', async (req, res) => {
  try {
    const { profileId, genderFilter = 'all', preferCountries = [], avoidCountries = [] } = req.body;
    const supabase = createServiceClient();
    
    // STEP 1: Check cooldowns
    const { data: cooldown } = await supabase
      .from('queue_cooldowns')
      .select('cooldown_until, reason')
      .eq('profile_id', profileId)
      .gt('cooldown_until', new Date().toISOString())
      .single();

    if (cooldown) {
      const remainingSeconds = Math.ceil((new Date(cooldown.cooldown_until).getTime() - Date.now()) / 1000);
      return res.status(429).json({ error: 'cooldown_active', reason: cooldown.reason, remainingSeconds });
    }

    // STEP 2: Check if already in queue
    const { data: existing } = await supabase
      .from('queue')
      .select('id')
      .eq('profile_id', profileId)
      .eq('status', 'waiting')
      .single();

    if (existing) {
      return res.status(409).json({ error: 'already_in_queue' });
    }

    // STEP 3: Check if already in active call
    const { data: activeRoom } = await supabase
      .from('rooms')
      .select('id')
      .or(`participant_1.eq.${profileId},participant_2.eq.${profileId}`)
      .is('ended_at', null)
      .single();

    if (activeRoom) {
      return res.status(409).json({ error: 'already_in_call' });
    }

    // STEP 4: Get last 5 peers to avoid rematch
    const { data: lastCall } = await supabase
      .from('call_history')
      .select('peer_id')
      .eq('owner_id', profileId)
      .order('called_at', { ascending: false })
      .limit(5);

    const last5Peers = lastCall?.map(c => c.peer_id).filter(Boolean) || [];
    const lastPeerId = last5Peers[0] || null;

    // STEP 5: Rate limit check (max 30 searches per hour)
    const oneHourAgo = new Date(Date.now() - 3600000).toISOString();
    const { count: recentSearches } = await supabase
      .from('queue')
      .select('id', { count: 'exact', head: true })
      .eq('profile_id', profileId)
      .gte('joined_at', oneHourAgo);

    if ((recentSearches || 0) >= 30) {
      await supabase.from('queue_cooldowns').upsert({
        profile_id: profileId,
        reason: 'search_spam',
        cooldown_until: new Date(Date.now() + 5 * 60000).toISOString(),
      });
      return res.status(429).json({ error: 'rate_limited', remainingSeconds: 300 });
    }

    // STEP 6: Insert into queue
    const { data: queueEntry, error } = await supabase
      .from('queue')
      .insert({
        profile_id: profileId,
        gender_filter: genderFilter,
        prefer_countries: preferCountries,
        avoid_countries: avoidCountries,
        last_peer_id: lastPeerId,
        last_5_peers: last5Peers.slice(0, 5),
      })
      .select()
      .single();

    if (error) throw error;

    // STEP 7: Update presence
    await supabase.from('presence').upsert({
      profile_id: profileId,
      status: 'searching',
      last_heartbeat: new Date().toISOString(),
    });

    return res.json({ queueId: queueEntry.id, status: 'waiting' });
  } catch (err: any) {
    console.error('Enqueue error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ─── 3. HEARTBEAT FUNCTION ───
app.post('/api/heartbeat', async (req, res) => {
  try {
    const { profileId, queueId } = req.body;
    const supabase = createServiceClient();
    const now = new Date().toISOString();

    await supabase.from('presence').upsert({
      profile_id: profileId,
      last_heartbeat: now,
    });

    if (queueId) {
      await supabase
        .from('queue')
        .update({ last_heartbeat: now })
        .eq('id', queueId)
        .eq('status', 'waiting');
    }

    return res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── 5. DEQUEUE FUNCTION ───
app.post('/api/dequeue', async (req, res) => {
  try {
    const { profileId, queueId } = req.body;
    const supabase = createServiceClient();

    await supabase
      .from('queue')
      .update({ status: 'cancelled' })
      .eq('id', queueId)
      .eq('profile_id', profileId)
      .eq('status', 'waiting');

    await supabase
      .from('presence')
      .update({ status: 'online', last_heartbeat: new Date().toISOString() })
      .eq('profile_id', profileId);

    return res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── 4. MATCH WORKER ALGORITHM ───
interface ScoredPair {
  userA: any;
  userB: any;
  score: number;
  breakdown: Record<string, number>;
  reason: string;
}

let isMatchWorkerRunning = false;
async function matchWorker() {
  if (isMatchWorkerRunning) return;
  isMatchWorkerRunning = true;
  try {
    const supabase = createServiceClient();
    const startTime = Date.now();

    // STEP 1: CLEANUP STALE ENTRIES
    const staleThreshold = new Date(Date.now() - 30_000).toISOString();
    const { data: staleEntries } = await supabase
      .from('queue')
      .select('id, profile_id')
      .eq('status', 'waiting')
      .lt('last_heartbeat', staleThreshold);

    if (staleEntries?.length) {
      await supabase
        .from('queue')
        .update({ status: 'cancelled' })
        .in('id', staleEntries.map(e => e.id));

      await supabase
        .from('presence')
        .update({ status: 'online' })
        .in('profile_id', staleEntries.map(e => e.profile_id));
    }

    // STEP 2: FETCH ALL WAITING USERS
    const { data: waitingUsers } = await supabase
      .from('queue')
      .select(`
        id, profile_id, gender_filter, prefer_countries, avoid_countries,
        last_peer_id, last_5_peers, skip_count, joined_at,
        profiles!inner (id, gender, country_code, reputation)
      `)
      .eq('status', 'waiting')
      .gte('last_heartbeat', new Date(Date.now() - 30_000).toISOString())
      .order('joined_at', { ascending: true });

    if (!waitingUsers || waitingUsers.length < 2) {
      isMatchWorkerRunning = false;
      return;
    }

    // STEP 3: FETCH ALL BLOCKS
    const allProfileIds = waitingUsers.map(u => u.profile_id);
    const { data: allBlocks } = await supabase
      .from('blocks')
      .select('blocker_id, blocked_id')
      .or(`blocker_id.in.(${allProfileIds.join(',')}),blocked_id.in.(${allProfileIds.join(',')})`);

    const blockSet = new Set<string>();
    allBlocks?.forEach(b => {
      blockSet.add(`${b.blocker_id}|${b.blocked_id}`);
      blockSet.add(`${b.blocked_id}|${b.blocker_id}`);
    });

    const isBlocked = (a: string, b: string) => blockSet.has(`${a}|${b}`);

    // STEP 4: CALCULATE ALL POSSIBLE PAIR SCORES
    const scoredPairs: ScoredPair[] = [];
    const now = Date.now();

    for (let i = 0; i < waitingUsers.length; i++) {
      for (let j = i + 1; j < waitingUsers.length; j++) {
        const A = waitingUsers[i] as any;
        const B = waitingUsers[j] as any;
        const profileA = Array.isArray(A.profiles) ? A.profiles[0] : A.profiles;
        const profileB = Array.isArray(B.profiles) ? B.profiles[0] : B.profiles;
        const breakdown: Record<string, number> = {};
        let reason = '';

        if (A.profile_id === B.profile_id) continue;
        if (isBlocked(A.profile_id, B.profile_id)) continue;
        if (A.last_peer_id === B.profile_id || B.last_peer_id === A.profile_id) continue;
        if (A.last_5_peers?.includes(B.profile_id) || B.last_5_peers?.includes(A.profile_id)) continue;
        
        if (A.gender_filter !== 'all' && profileB.gender !== A.gender_filter) continue;
        if (B.gender_filter !== 'all' && profileA.gender !== B.gender_filter) continue;

        if (A.avoid_countries?.length > 0 && A.avoid_countries.includes(profileB.country_code)) continue;
        if (B.avoid_countries?.length > 0 && B.avoid_countries.includes(profileA.country_code)) continue;

        if (profileA.reputation < 20 && profileB.reputation > 60) continue;
        if (profileB.reputation < 20 && profileA.reputation > 60) continue;

        let score = 100;
        reason = 'base';

        if (A.prefer_countries?.length > 0 && A.prefer_countries.includes(profileB.country_code)) {
          score += 50; breakdown['a_prefers_b_country'] = 50; reason = 'country_preferred';
        }
        if (B.prefer_countries?.length > 0 && B.prefer_countries.includes(profileA.country_code)) {
          score += 50; breakdown['b_prefers_a_country'] = 50; reason = 'country_preferred';
        }

        if (profileA.country_code === profileB.country_code) {
          score += 30; breakdown['same_country'] = 30;
          if (reason === 'base') reason = 'same_country';
        }

        if (breakdown['a_prefers_b_country'] && breakdown['b_prefers_a_country']) {
          score += 40; breakdown['mutual_country_prefer'] = 40; reason = 'mutual_country_preferred';
        }

        if (B.gender_filter !== 'all' && profileA.gender === B.gender_filter) {
          score += 15; breakdown['a_matches_b_filter'] = 15;
        }
        if (A.gender_filter !== 'all' && profileB.gender === A.gender_filter) {
          score += 15; breakdown['b_matches_a_filter'] = 15;
        }

        const repDiff = Math.abs(profileA.reputation - profileB.reputation);
        if (repDiff < 10) { score += 25; breakdown['similar_reputation'] = 25; }
        else if (repDiff < 20) { score += 15; breakdown['similar_reputation'] = 15; }
        else if (repDiff < 35) { score += 5; breakdown['similar_reputation'] = 5; }

        const waitA = Math.floor((now - new Date(A.joined_at).getTime()) / 1000);
        const waitB = Math.floor((now - new Date(B.joined_at).getTime()) / 1000);
        
        if (waitA > 10 && waitB > 10) { score += 20; breakdown['both_waited_long'] = 20; }
        if (waitA > 20 || waitB > 20) { score += 15; breakdown['urgent_wait'] = 15; }
        if (waitA > 30 || waitB > 30) { score += 30; breakdown['critical_wait'] = 30; reason = 'urgent_timeout'; }

        if (A.skip_count > 5 || B.skip_count > 5) { score -= 10; breakdown['skip_spam_penalty'] = -10; }

        if (profileA.reputation < 40) {
          const pen = -Math.floor((40 - profileA.reputation) / 2); score += pen; breakdown['a_low_rep_penalty'] = pen;
        }
        if (profileB.reputation < 40) {
          const pen = -Math.floor((40 - profileB.reputation) / 2); score += pen; breakdown['b_low_rep_penalty'] = pen;
        }

        const aHasNoFilters = A.gender_filter === 'all' && (!A.prefer_countries?.length) && (!A.avoid_countries?.length);
        const bHasNoFilters = B.gender_filter === 'all' && (!B.prefer_countries?.length) && (!B.avoid_countries?.length);
        if (aHasNoFilters && bHasNoFilters) { score += 10; breakdown['both_no_filters'] = 10; }

        const jitter = Math.floor(Math.random() * 8);
        score += jitter; breakdown['jitter'] = jitter;

        score = Math.max(score, 1);
        scoredPairs.push({ userA: A, userB: B, score, breakdown, reason });
      }
    }

    // STEP 5: GREEDY MATCHING
    scoredPairs.sort((a, b) => b.score - a.score);
    const matchedProfileIds = new Set<string>();
    const finalMatches: ScoredPair[] = [];

    for (const pair of scoredPairs) {
      if (matchedProfileIds.has(pair.userA.profile_id)) continue;
      if (matchedProfileIds.has(pair.userB.profile_id)) continue;

      finalMatches.push(pair);
      matchedProfileIds.add(pair.userA.profile_id);
      matchedProfileIds.add(pair.userB.profile_id);

      if (finalMatches.length >= 50) break;
      if (Date.now() - startTime > 1500) break;
    }

    // STEP 6: CREATE ROOMS
    for (const match of finalMatches) {
      try {
        const roomResponse = await fetch('https://api.daily.co/v1/rooms', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${process.env.DAILY_API_KEY || ''}`,
          },
          body: JSON.stringify({
            privacy: 'private',
            properties: {
              max_participants: 2,
              exp: Math.floor(Date.now() / 1000) + 3600,
              enable_chat: false,
              enable_screenshare: false,
              audio_only: true,
              enable_recording: false,
            },
          }),
        });
        
        if (!roomResponse.ok) {
           console.error('Daily API Error', await roomResponse.text());
           throw new Error('Failed to create room in Daily.co');
        }
        
        const room = await roomResponse.json();
        
        const profileA = Array.isArray(match.userA.profiles) ? match.userA.profiles[0] : match.userA.profiles;
        const profileB = Array.isArray(match.userB.profiles) ? match.userB.profiles[0] : match.userB.profiles;
        const aliasA = profileA.alias || 'Guest A';
        const aliasB = profileB.alias || 'Guest B';

        const tokenA = await createMeetingToken(room.name, aliasA);
        const tokenB = await createMeetingToken(room.name, aliasB);

        await supabase.from('rooms').insert({
          daily_room_name: room.name,
          daily_room_url: room.url,
          participant_1: match.userA.profile_id,
          participant_2: match.userB.profile_id,
          match_score: match.score,
          match_reason: match.reason,
        }).select().single();

        // FIX: set matched_peer_id so frontend knows who they matched with
        await supabase
          .from('queue')
          .update({
            status: 'matched',
            room_url: room.url,
            room_token: tokenA,
            matched_at: new Date().toISOString(),
            matched_peer_id: match.userB.profile_id,  // ← FIX
          })
          .eq('id', match.userA.id);

        await supabase
          .from('queue')
          .update({
            status: 'matched',
            room_url: room.url,
            room_token: tokenB,
            matched_at: new Date().toISOString(),
            matched_peer_id: match.userA.profile_id,  // ← FIX
          })
          .eq('id', match.userB.id);

        await supabase
          .from('presence')
          .update({ status: 'in_call' })
          .in('profile_id', [match.userA.profile_id, match.userB.profile_id]);

        const waitA = Math.floor((Date.now() - new Date(match.userA.joined_at).getTime()) / 1000);
        const waitB = Math.floor((Date.now() - new Date(match.userB.joined_at).getTime()) / 1000);

        await supabase.from('match_logs').insert({
          user_a: match.userA.profile_id,
          user_b: match.userB.profile_id,
          score: match.score,
          score_breakdown: match.breakdown,
          wait_time_a_seconds: waitA,
          wait_time_b_seconds: waitB,
          filters_a: { gender: match.userA.gender_filter, prefer: match.userA.prefer_countries, avoid: match.userA.avoid_countries },
          filters_b: { gender: match.userB.gender_filter, prefer: match.userB.prefer_countries, avoid: match.userB.avoid_countries },
        });

      } catch (err: any) {
        console.error('Failed to create room for match:', err);
        await supabase
          .from('queue')
          .update({ status: 'waiting' })
          .in('id', [match.userA.id, match.userB.id]);
      }
    }
  } catch (err) {
    console.error('Match worker error:', err);
  } finally {
    isMatchWorkerRunning = false;
  }
}

// ─── 7. CLEANUP STALE FUNCTION ───
let isCleanupRunning = false;
async function cleanupStale() {
  if (isCleanupRunning) return;
  isCleanupRunning = true;
  try {
    const supabase = createServiceClient();
    const now = new Date();

    const staleQueueThreshold = new Date(now.getTime() - 30_000).toISOString();
    await supabase.from('queue').delete().eq('status', 'waiting').lt('last_heartbeat', staleQueueThreshold);

    const staleMatchThreshold = new Date(now.getTime() - 15_000).toISOString();
    await supabase.from('queue').update({ status: 'cancelled' }).eq('status', 'matched').lt('matched_at', staleMatchThreshold);

    const orphanThreshold = new Date(now.getTime() - 3600_000).toISOString();
    await supabase.from('rooms').update({ ended_at: now.toISOString() }).is('ended_at', null).lt('started_at', orphanThreshold);

    const presenceThreshold = new Date(now.getTime() - 60_000).toISOString();
    await supabase.from('presence').update({ status: 'offline' }).neq('status', 'offline').lt('last_heartbeat', presenceThreshold);

    await supabase.from('queue_cooldowns').delete().lt('cooldown_until', now.toISOString());
  } catch (err) {
    console.error('Cleanup worker error:', err);
  } finally {
    isCleanupRunning = false;
  }
}

setInterval(matchWorker, 2000);
setInterval(cleanupStale, 30000);

async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
