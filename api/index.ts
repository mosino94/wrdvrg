import express from 'express';
import { createClient } from '@supabase/supabase-js';

function createServiceClient() {
  const url = process.env.VITE_SUPABASE_URL || '';
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || '';
  return createClient(url, key);
}

const app = express();
app.use(express.json());

async function createMeetingToken(roomName: string, userName: string) {
  const res = await fetch('https://api.daily.co/v1/meeting-tokens', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.DAILY_API_KEY || ''}`,
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
  return (await res.json()).token;
}

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

    const staleThreshold = new Date(Date.now() - 30_000).toISOString();
    const { data: staleEntries } = await supabase
      .from('queue')
      .select('id, profile_id')
      .eq('status', 'waiting')
      .lt('last_heartbeat', staleThreshold);
    if (staleEntries?.length) {
      await supabase.from('queue').update({ status: 'cancelled' }).in('id', staleEntries.map(e => e.id));
      await supabase.from('presence').update({ status: 'online' }).in('profile_id', staleEntries.map(e => e.profile_id));
    }

    const { data: waitingUsers } = await supabase
      .from('queue')
      .select(`id, profile_id, gender_filter, prefer_countries, avoid_countries,
        last_peer_id, last_5_peers, skip_count, joined_at,
        profiles!inner (id, gender, country_code, reputation)`)
      .eq('status', 'waiting')
      .gte('last_heartbeat', new Date(Date.now() - 30_000).toISOString())
      .order('joined_at', { ascending: true });

    if (!waitingUsers || waitingUsers.length < 2) return;

    const allProfileIds = waitingUsers.map(u => u.profile_id);
    const { data: allBlocks } = await supabase
      .from('blocks')
      .select('blocker_id, blocked_id')
      .or(`blocker_id.in.(${allProfileIds.join(',')}),blocked_id.in.(${allProfileIds.join(',')})`);

    const blockSet = new Set<string>();
    allBlocks?.forEach(b => { blockSet.add(`${b.blocker_id}|${b.blocked_id}`); blockSet.add(`${b.blocked_id}|${b.blocker_id}`); });
    const isBlocked = (a: string, b: string) => blockSet.has(`${a}|${b}`);

    const scoredPairs: ScoredPair[] = [];
    const now = Date.now();

    for (let i = 0; i < waitingUsers.length; i++) {
      for (let j = i + 1; j < waitingUsers.length; j++) {
        const A = waitingUsers[i] as any;
        const B = waitingUsers[j] as any;
        const pA = Array.isArray(A.profiles) ? A.profiles[0] : A.profiles;
        const pB = Array.isArray(B.profiles) ? B.profiles[0] : B.profiles;
        const breakdown: Record<string, number> = {};
        let reason = 'base';

        if (A.profile_id === B.profile_id) continue;
        if (isBlocked(A.profile_id, B.profile_id)) continue;
        if (A.last_peer_id === B.profile_id || B.last_peer_id === A.profile_id) continue;
        if (A.last_5_peers?.includes(B.profile_id) || B.last_5_peers?.includes(A.profile_id)) continue;
        if (A.gender_filter !== 'all' && pB.gender !== A.gender_filter) continue;
        if (B.gender_filter !== 'all' && pA.gender !== B.gender_filter) continue;
        if (A.avoid_countries?.length && A.avoid_countries.includes(pB.country_code)) continue;
        if (B.avoid_countries?.length && B.avoid_countries.includes(pA.country_code)) continue;
        if (pA.reputation < 20 && pB.reputation > 60) continue;
        if (pB.reputation < 20 && pA.reputation > 60) continue;

        let score = 100;
        if (A.prefer_countries?.length && A.prefer_countries.includes(pB.country_code)) { score += 50; breakdown['a_prefers_b'] = 50; reason = 'country_preferred'; }
        if (B.prefer_countries?.length && B.prefer_countries.includes(pA.country_code)) { score += 50; breakdown['b_prefers_a'] = 50; reason = 'country_preferred'; }
        if (pA.country_code === pB.country_code) { score += 30; breakdown['same_country'] = 30; if (reason === 'base') reason = 'same_country'; }
        if (breakdown['a_prefers_b'] && breakdown['b_prefers_a']) { score += 40; breakdown['mutual'] = 40; reason = 'mutual_country'; }
        if (B.gender_filter !== 'all' && pA.gender === B.gender_filter) { score += 15; breakdown['a_matches_b'] = 15; }
        if (A.gender_filter !== 'all' && pB.gender === A.gender_filter) { score += 15; breakdown['b_matches_a'] = 15; }

        const repDiff = Math.abs(pA.reputation - pB.reputation);
        if (repDiff < 10) { score += 25; breakdown['rep'] = 25; }
        else if (repDiff < 20) { score += 15; breakdown['rep'] = 15; }
        else if (repDiff < 35) { score += 5; breakdown['rep'] = 5; }

        const waitA = Math.floor((now - new Date(A.joined_at).getTime()) / 1000);
        const waitB = Math.floor((now - new Date(B.joined_at).getTime()) / 1000);
        if (waitA > 10 && waitB > 10) { score += 20; breakdown['wait'] = 20; }
        if (waitA > 20 || waitB > 20) { score += 15; breakdown['urgent'] = 15; }
        if (waitA > 30 || waitB > 30) { score += 30; breakdown['critical'] = 30; reason = 'urgent_timeout'; }
        if (A.skip_count > 5 || B.skip_count > 5) { score -= 10; breakdown['skip_pen'] = -10; }
        if (pA.reputation < 40) { const p = -Math.floor((40 - pA.reputation) / 2); score += p; breakdown['a_rep_pen'] = p; }
        if (pB.reputation < 40) { const p = -Math.floor((40 - pB.reputation) / 2); score += p; breakdown['b_rep_pen'] = p; }
        const noFiltersA = A.gender_filter === 'all' && !A.prefer_countries?.length && !A.avoid_countries?.length;
        const noFiltersB = B.gender_filter === 'all' && !B.prefer_countries?.length && !B.avoid_countries?.length;
        if (noFiltersA && noFiltersB) { score += 10; breakdown['no_filters'] = 10; }
        score += Math.floor(Math.random() * 8);
        score = Math.max(score, 1);
        scoredPairs.push({ userA: A, userB: B, score, breakdown, reason });
      }
    }

    scoredPairs.sort((a, b) => b.score - a.score);
    const matched = new Set<string>();
    const finalMatches: ScoredPair[] = [];
    for (const pair of scoredPairs) {
      if (matched.has(pair.userA.profile_id) || matched.has(pair.userB.profile_id)) continue;
      finalMatches.push(pair);
      matched.add(pair.userA.profile_id);
      matched.add(pair.userB.profile_id);
      if (finalMatches.length >= 50 || Date.now() - startTime > 1500) break;
    }

    for (const match of finalMatches) {
      try {
        const roomRes = await fetch('https://api.daily.co/v1/rooms', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.DAILY_API_KEY || ''}` },
          body: JSON.stringify({
            privacy: 'private',
            properties: { max_participants: 2, exp: Math.floor(Date.now() / 1000) + 3600, enable_chat: false, enable_screenshare: false, audio_only: true, enable_recording: false },
          }),
        });
        if (!roomRes.ok) throw new Error(await roomRes.text());
        const room = await roomRes.json();

        const pA = Array.isArray(match.userA.profiles) ? match.userA.profiles[0] : match.userA.profiles;
        const pB = Array.isArray(match.userB.profiles) ? match.userB.profiles[0] : match.userB.profiles;
        const tokenA = await createMeetingToken(room.name, pA.alias || 'Guest');
        const tokenB = await createMeetingToken(room.name, pB.alias || 'Guest');

        await supabase.from('rooms').insert({
          daily_room_name: room.name, daily_room_url: room.url,
          participant_1: match.userA.profile_id, participant_2: match.userB.profile_id,
          match_score: match.score, match_reason: match.reason,
        });

        await supabase.from('queue').update({ status: 'matched', room_url: room.url, room_token: tokenA, matched_at: new Date().toISOString(), matched_peer_id: match.userB.profile_id }).eq('id', match.userA.id);
        await supabase.from('queue').update({ status: 'matched', room_url: room.url, room_token: tokenB, matched_at: new Date().toISOString(), matched_peer_id: match.userA.profile_id }).eq('id', match.userB.id);
        await supabase.from('presence').update({ status: 'in_call' }).in('profile_id', [match.userA.profile_id, match.userB.profile_id]);

        const waitA = Math.floor((Date.now() - new Date(match.userA.joined_at).getTime()) / 1000);
        const waitB = Math.floor((Date.now() - new Date(match.userB.joined_at).getTime()) / 1000);
        await supabase.from('match_logs').insert({
          user_a: match.userA.profile_id, user_b: match.userB.profile_id,
          score: match.score, score_breakdown: match.breakdown,
          wait_time_a_seconds: waitA, wait_time_b_seconds: waitB,
          filters_a: { gender: match.userA.gender_filter, prefer: match.userA.prefer_countries, avoid: match.userA.avoid_countries },
          filters_b: { gender: match.userB.gender_filter, prefer: match.userB.prefer_countries, avoid: match.userB.avoid_countries },
        });
      } catch (err: any) {
        console.error('Match room creation failed:', err);
        await supabase.from('queue').update({ status: 'waiting' }).in('id', [match.userA.id, match.userB.id]);
      }
    }
  } catch (err) {
    console.error('matchWorker error:', err);
  } finally {
    isMatchWorkerRunning = false;
  }
}

async function cleanupStale() {
  try {
    const supabase = createServiceClient();
    const now = new Date();
    await supabase.from('queue').update({ status: 'cancelled' }).eq('status', 'waiting').lt('last_heartbeat', new Date(now.getTime() - 30_000).toISOString());
    await supabase.from('queue').update({ status: 'cancelled' }).eq('status', 'matched').lt('matched_at', new Date(now.getTime() - 15_000).toISOString());
    await supabase.from('rooms').update({ ended_at: now.toISOString() }).is('ended_at', null).lt('started_at', new Date(now.getTime() - 3600_000).toISOString());
    await supabase.from('presence').update({ status: 'offline' }).neq('status', 'offline').lt('last_heartbeat', new Date(now.getTime() - 60_000).toISOString());
    await supabase.from('queue_cooldowns').delete().lt('cooldown_until', now.toISOString());
  } catch (err) {
    console.error('cleanupStale error:', err);
  }
}

app.post('/api/sync-profile', async (req, res) => {
  try {
    const { alias, countryCode, gender } = req.body;
    if (!alias) return res.status(400).json({ error: 'Alias is required' });
    const supabase = createServiceClient();
    let { data: profile } = await supabase.from('profiles').select('*').eq('alias', alias).maybeSingle();
    if (!profile) {
      const { data: newProfile, error } = await supabase.from('profiles').insert({ alias, country_code: countryCode || null, gender: gender || null, is_guest: true }).select().single();
      if (error) throw error;
      profile = newProfile;
    } else {
      const updates: any = {};
      if (countryCode && profile.country_code !== countryCode) updates.country_code = countryCode;
      if (gender !== undefined && profile.gender !== gender) updates.gender = gender;
      if (Object.keys(updates).length) {
        const { data: updated } = await supabase.from('profiles').update(updates).eq('id', profile.id).select().single();
        if (updated) profile = updated;
      }
    }
    return res.json(profile);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/enqueue', async (req, res) => {
  try {
    const { profileId, genderFilter = 'all', preferCountries = [], avoidCountries = [] } = req.body;
    const supabase = createServiceClient();

    const { data: cooldown } = await supabase.from('queue_cooldowns').select('cooldown_until, reason').eq('profile_id', profileId).gt('cooldown_until', new Date().toISOString()).single();
    if (cooldown) {
      const remainingSeconds = Math.ceil((new Date(cooldown.cooldown_until).getTime() - Date.now()) / 1000);
      return res.status(429).json({ error: 'cooldown_active', reason: cooldown.reason, remainingSeconds });
    }

    const { data: existing } = await supabase.from('queue').select('id').eq('profile_id', profileId).eq('status', 'waiting').single();
    if (existing) return res.status(409).json({ error: 'already_in_queue' });

    const { data: activeRoom } = await supabase.from('rooms').select('id').or(`participant_1.eq.${profileId},participant_2.eq.${profileId}`).is('ended_at', null).single();
    if (activeRoom) return res.status(409).json({ error: 'already_in_call' });

    const { data: lastCalls } = await supabase.from('call_history').select('peer_id').eq('owner_id', profileId).order('called_at', { ascending: false }).limit(5);
    const last5Peers = lastCalls?.map(c => c.peer_id).filter(Boolean) || [];

    const oneHourAgo = new Date(Date.now() - 3600000).toISOString();
    const { count: recentSearches } = await supabase.from('queue').select('id', { count: 'exact', head: true }).eq('profile_id', profileId).gte('joined_at', oneHourAgo);
    if ((recentSearches || 0) >= 30) {
      await supabase.from('queue_cooldowns').upsert({ profile_id: profileId, reason: 'search_spam', cooldown_until: new Date(Date.now() + 5 * 60000).toISOString() });
      return res.status(429).json({ error: 'rate_limited', remainingSeconds: 300 });
    }

    const { data: queueEntry, error } = await supabase.from('queue').insert({
      profile_id: profileId, gender_filter: genderFilter,
      prefer_countries: preferCountries, avoid_countries: avoidCountries,
      last_peer_id: last5Peers[0] || null, last_5_peers: last5Peers.slice(0, 5),
    }).select().single();
    if (error) throw error;

    await supabase.from('presence').upsert({ profile_id: profileId, status: 'searching', last_heartbeat: new Date().toISOString() });

    // Trigger matching immediately (on-demand, works on Vercel serverless)
    matchWorker().catch(console.error);

    return res.json({ queueId: queueEntry.id, status: 'waiting' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/heartbeat', async (req, res) => {
  try {
    const { profileId, queueId } = req.body;
    const supabase = createServiceClient();
    const now = new Date().toISOString();
    await supabase.from('presence').upsert({ profile_id: profileId, last_heartbeat: now });
    if (queueId) await supabase.from('queue').update({ last_heartbeat: now }).eq('id', queueId).eq('status', 'waiting');
    return res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/dequeue', async (req, res) => {
  try {
    const { profileId, queueId } = req.body;
    const supabase = createServiceClient();
    await supabase.from('queue').update({ status: 'cancelled' }).eq('id', queueId).eq('profile_id', profileId).eq('status', 'waiting');
    await supabase.from('presence').update({ status: 'online', last_heartbeat: new Date().toISOString() }).eq('profile_id', profileId);
    return res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Vercel cron job endpoint - runs every minute as fallback
app.get('/api/cron/match', async (req, res) => {
  await Promise.all([matchWorker(), cleanupStale()]);
  res.json({ ok: true, ts: new Date().toISOString() });
});

export default app;
