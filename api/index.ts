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
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.DAILY_API_KEY || ''}` },
    body: JSON.stringify({ properties: { room_name: roomName, user_name: userName, exp: Math.floor(Date.now() / 1000) + 3600, is_owner: false, enable_screenshare: false } }),
  });
  return (await res.json()).token;
}

interface ScoredPair { userA: any; userB: any; score: number; breakdown: Record<string, number>; reason: string; }

async function matchWorker() {
  try {
    const supabase = createServiceClient();
    const startTime = Date.now();

    // Cleanup stale entries first
    const staleThreshold = new Date(Date.now() - 30_000).toISOString();
    const { data: staleEntries } = await supabase.from('queue').select('id, profile_id').eq('status', 'waiting').lt('last_heartbeat', staleThreshold);
    if (staleEntries?.length) {
      await supabase.from('queue').update({ status: 'cancelled' }).in('id', staleEntries.map((e: any) => e.id));
      await supabase.from('presence').update({ status: 'online' }).in('profile_id', staleEntries.map((e: any) => e.profile_id));
    }

    // Fetch waiting users with their profiles
    const { data: waitingUsers } = await supabase.from('queue')
      .select(`id, profile_id, gender_filter, prefer_countries, avoid_countries, last_peer_id, last_5_peers, skip_count, joined_at, profiles!inner (id, gender, country_code, reputation)`)
      .eq('status', 'waiting')
      .gte('last_heartbeat', new Date(Date.now() - 30_000).toISOString())
      .order('joined_at', { ascending: true });

    console.log('Waiting users:', waitingUsers?.length || 0);
    if (!waitingUsers || waitingUsers.length < 2) return;

    // Fetch blocks
    const allProfileIds = waitingUsers.map((u: any) => u.profile_id);
    const { data: allBlocks } = await supabase.from('blocks').select('blocker_id, blocked_id')
      .or(`blocker_id.in.(${allProfileIds.join(',')}),blocked_id.in.(${allProfileIds.join(',')})`);
    const blockSet = new Set<string>();
    allBlocks?.forEach((b: any) => { blockSet.add(`${b.blocker_id}|${b.blocked_id}`); blockSet.add(`${b.blocked_id}|${b.blocker_id}`); });

    // Score pairs
    const scoredPairs: ScoredPair[] = [];
    const now = Date.now();
    for (let i = 0; i < waitingUsers.length; i++) {
      for (let j = i + 1; j < waitingUsers.length; j++) {
        const A = waitingUsers[i] as any; const B = waitingUsers[j] as any;
        const pA = Array.isArray(A.profiles) ? A.profiles[0] : A.profiles;
        const pB = Array.isArray(B.profiles) ? B.profiles[0] : B.profiles;
        if (!pA || !pB) continue;
        if (A.profile_id === B.profile_id) continue;
        if (blockSet.has(`${A.profile_id}|${B.profile_id}`)) continue;
        if (A.last_peer_id === B.profile_id || B.last_peer_id === A.profile_id) continue;
        if (A.last_5_peers?.includes(B.profile_id) || B.last_5_peers?.includes(A.profile_id)) continue;
        if (A.gender_filter !== 'all' && pB.gender !== A.gender_filter) continue;
        if (B.gender_filter !== 'all' && pA.gender !== B.gender_filter) continue;
        if (A.avoid_countries?.length && A.avoid_countries.includes(pB.country_code)) continue;
        if (B.avoid_countries?.length && B.avoid_countries.includes(pA.country_code)) continue;

        let score = 100; const breakdown: Record<string, number> = {}; let reason = 'base';
        if (pA.country_code === pB.country_code) { score += 30; reason = 'same_country'; }
        const rd = Math.abs((pA.reputation || 50) - (pB.reputation || 50));
        score += rd < 10 ? 25 : rd < 20 ? 15 : rd < 35 ? 5 : 0;
        const wA = Math.floor((now - new Date(A.joined_at).getTime()) / 1000);
        const wB = Math.floor((now - new Date(B.joined_at).getTime()) / 1000);
        if (wA > 10 && wB > 10) score += 20;
        if (wA > 20 || wB > 20) score += 15;
        if (wA > 30 || wB > 30) { score += 30; reason = 'urgent'; }
        score += Math.floor(Math.random() * 8);
        scoredPairs.push({ userA: A, userB: B, score: Math.max(score, 1), breakdown, reason });
      }
    }

    if (!scoredPairs.length) { console.log('No valid pairs found'); return; }

    // Greedy match
    scoredPairs.sort((a, b) => b.score - a.score);
    const matched = new Set<string>(); const finalMatches: ScoredPair[] = [];
    for (const pair of scoredPairs) {
      if (matched.has(pair.userA.profile_id) || matched.has(pair.userB.profile_id)) continue;
      finalMatches.push(pair); matched.add(pair.userA.profile_id); matched.add(pair.userB.profile_id);
      if (finalMatches.length >= 10 || Date.now() - startTime > 2000) break;
    }

    console.log('Creating', finalMatches.length, 'matches');

    // Create rooms
    for (const match of finalMatches) {
      try {
        const roomRes = await fetch('https://api.daily.co/v1/rooms', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.DAILY_API_KEY || ''}` },
          body: JSON.stringify({ privacy: 'private', properties: { max_participants: 2, exp: Math.floor(Date.now() / 1000) + 3600, enable_chat: false, enable_screenshare: false, audio_only: true } }),
        });
        if (!roomRes.ok) {
          const errText = await roomRes.text();
          console.error('Daily.co error:', errText);
          throw new Error(errText);
        }
        const room = await roomRes.json();
        console.log('Room created:', room.name);

        const pA = Array.isArray(match.userA.profiles) ? match.userA.profiles[0] : match.userA.profiles;
        const pB = Array.isArray(match.userB.profiles) ? match.userB.profiles[0] : match.userB.profiles;
        const [tokenA, tokenB] = await Promise.all([
          createMeetingToken(room.name, pA?.alias || 'Guest A'),
          createMeetingToken(room.name, pB?.alias || 'Guest B'),
        ]);

        const supabase2 = createServiceClient();
        await supabase2.from('rooms').insert({ daily_room_name: room.name, daily_room_url: room.url, participant_1: match.userA.profile_id, participant_2: match.userB.profile_id, match_score: match.score, match_reason: match.reason });

        const [resA, resB] = await Promise.all([
          supabase2.from('queue').update({ status: 'matched', room_url: room.url, room_token: tokenA, matched_at: new Date().toISOString(), matched_peer_id: match.userB.profile_id }).eq('id', match.userA.id),
          supabase2.from('queue').update({ status: 'matched', room_url: room.url, room_token: tokenB, matched_at: new Date().toISOString(), matched_peer_id: match.userA.profile_id }).eq('id', match.userB.id),
        ]);

        console.log('Queue updated - A:', resA.error, 'B:', resB.error);

        await supabase2.from('presence').update({ status: 'in_call' }).in('profile_id', [match.userA.profile_id, match.userB.profile_id]);
        console.log('Match complete:', match.userA.profile_id, '<->', match.userB.profile_id);
      } catch (err: any) {
        console.error('Room creation failed:', err.message);
        const s = createServiceClient();
        await s.from('queue').update({ status: 'waiting' }).in('id', [match.userA.id, match.userB.id]);
      }
    }
  } catch (err) { console.error('matchWorker error:', err); }
}

async function cleanupStale() {
  try {
    const supabase = createServiceClient(); const now = new Date();
    await supabase.from('queue').update({ status: 'cancelled' }).eq('status', 'waiting').lt('last_heartbeat', new Date(now.getTime() - 30_000).toISOString());
    await supabase.from('queue').update({ status: 'cancelled' }).eq('status', 'matched').lt('matched_at', new Date(now.getTime() - 15_000).toISOString());
    await supabase.from('rooms').update({ ended_at: now.toISOString() }).is('ended_at', null).lt('started_at', new Date(now.getTime() - 3600_000).toISOString());
    await supabase.from('presence').update({ status: 'offline' }).neq('status', 'offline').lt('last_heartbeat', new Date(now.getTime() - 60_000).toISOString());
    await supabase.from('queue_cooldowns').delete().lt('cooldown_until', now.toISOString());
  } catch (err) { console.error('cleanupStale:', err); }
}

app.get('/api/country', async (_req, res) => {
  try {
    const r = await fetch('https://ipworld.info/api/ip/self_country');
    if (r.ok) { const t = await r.text(); if (t.trim().length === 2) return res.json({ country: t.trim().toUpperCase() }); }
  } catch {}
  try {
    const r2 = await fetch('https://ip2c.org/self');
    const t2 = await r2.text();
    if (t2.startsWith('1;')) return res.json({ country: t2.split(';')[1] });
  } catch {}
  return res.json({ country: 'US' });
});

app.post('/api/sync-profile', async (req, res) => {
  try {
    const { alias, countryCode, gender } = req.body;
    if (!alias) return res.status(400).json({ error: 'Alias required' });
    const supabase = createServiceClient();
    let { data: profile } = await supabase.from('profiles').select('*').eq('alias', alias).maybeSingle();
    if (!profile) {
      const { data: np, error } = await supabase.from('profiles').insert({ alias, country_code: countryCode || null, gender: gender || null, is_guest: true }).select().single();
      if (error) throw error; profile = np;
    } else {
      const u: any = {};
      if (countryCode && profile.country_code !== countryCode) u.country_code = countryCode;
      if (gender !== undefined && profile.gender !== gender) u.gender = gender;
      if (Object.keys(u).length) { const { data: up } = await supabase.from('profiles').update(u).eq('id', profile.id).select().single(); if (up) profile = up; }
    }
    return res.json(profile);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

app.post('/api/enqueue', async (req, res) => {
  try {
    const { profileId, genderFilter = 'all', preferCountries = [], avoidCountries = [] } = req.body;
    const supabase = createServiceClient();

    const { data: cooldown } = await supabase.from('queue_cooldowns').select('cooldown_until').eq('profile_id', profileId).gt('cooldown_until', new Date().toISOString()).maybeSingle();
    if (cooldown) { const r = Math.ceil((new Date(cooldown.cooldown_until).getTime() - Date.now()) / 1000); return res.status(429).json({ error: 'cooldown_active', remainingSeconds: r }); }

    // Already in queue — return existing and try to match
    const { data: existing } = await supabase.from('queue').select('id').eq('profile_id', profileId).eq('status', 'waiting').maybeSingle();
    if (existing) {
      await matchWorker(); // AWAIT — not fire-and-forget
      return res.json({ queueId: existing.id, status: 'waiting' });
    }

    const { data: activeRoom } = await supabase.from('rooms').select('id').or(`participant_1.eq.${profileId},participant_2.eq.${profileId}`).is('ended_at', null).maybeSingle();
    if (activeRoom) return res.status(409).json({ error: 'already_in_call' });

    const { data: lastCalls } = await supabase.from('call_history').select('peer_id').eq('owner_id', profileId).order('called_at', { ascending: false }).limit(5);
    const last5Peers = lastCalls?.map((c: any) => c.peer_id).filter(Boolean) || [];

    const { data: queueEntry, error } = await supabase.from('queue').insert({
      profile_id: profileId, gender_filter: genderFilter,
      prefer_countries: preferCountries, avoid_countries: avoidCountries,
      last_peer_id: last5Peers[0] || null, last_5_peers: last5Peers.slice(0, 5),
    }).select().single();
    if (error) throw error;

    await supabase.from('presence').upsert({ profile_id: profileId, status: 'searching', last_heartbeat: new Date().toISOString() });

    await matchWorker(); // AWAIT — ensures match completes before response

    return res.json({ queueId: queueEntry.id, status: 'waiting' });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

app.post('/api/heartbeat', async (req, res) => {
  try {
    const { profileId, queueId } = req.body; const supabase = createServiceClient(); const now = new Date().toISOString();
    await supabase.from('presence').upsert({ profile_id: profileId, last_heartbeat: now });
    if (queueId) await supabase.from('queue').update({ last_heartbeat: now }).eq('id', queueId).eq('status', 'waiting');
    return res.json({ ok: true });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

app.post('/api/dequeue', async (req, res) => {
  try {
    const { profileId, queueId } = req.body; const supabase = createServiceClient();
    if (queueId) await supabase.from('queue').update({ status: 'cancelled' }).eq('id', queueId).eq('profile_id', profileId);
    else await supabase.from('queue').update({ status: 'cancelled' }).eq('profile_id', profileId).eq('status', 'waiting');
    await supabase.from('presence').update({ status: 'online', last_heartbeat: new Date().toISOString() }).eq('profile_id', profileId);
    return res.json({ ok: true });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

app.get('/api/online-count', async (_req, res) => {
  try {
    const supabase = createServiceClient();
    const { count } = await supabase.from('presence').select('*', { count: 'exact', head: true }).neq('status', 'offline');
    return res.json({ count: count || 0 });
  } catch { res.json({ count: 0 }); }
});

app.get('/api/friends/:profileId', async (req, res) => {
  try {
    const { profileId } = req.params; const supabase = createServiceClient();
    const { data: fl } = await supabase.from('friends').select('friend_id, nickname').eq('owner_id', profileId);
    if (!fl?.length) return res.json([]);
    const ids = fl.map((f: any) => f.friend_id);
    const [{ data: profiles }, { data: presences }] = await Promise.all([
      supabase.from('profiles').select('id, alias, country_code, gender').in('id', ids),
      supabase.from('presence').select('profile_id, status').in('profile_id', ids),
    ]);
    const pm = new Map(profiles?.map((p: any) => [p.id, p]) || []);
    const prm = new Map(presences?.map((p: any) => [p.profile_id, p.status]) || []);
    return res.json(fl.map((f: any) => { const p: any = pm.get(f.friend_id); return { id: f.friend_id, alias: p?.alias || 'Unknown', nickname: f.nickname, country: p?.country_code || null, gender: p?.gender || null, status: prm.get(f.friend_id) || 'offline' }; }));
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

app.post('/api/friends/:profileId/nickname', async (req, res) => {
  try {
    const { profileId } = req.params; const { friendId, nickname } = req.body; const supabase = createServiceClient();
    await supabase.from('friends').update({ nickname: nickname || null }).eq('owner_id', profileId).eq('friend_id', friendId);
    return res.json({ ok: true });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

app.post('/api/friends/:profileId/remove', async (req, res) => {
  try {
    const { profileId } = req.params; const { friendId } = req.body; const supabase = createServiceClient();
    await supabase.from('friends').delete().eq('owner_id', profileId).eq('friend_id', friendId);
    return res.json({ ok: true });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

app.get('/api/cron/match', async (_req, res) => {
  await Promise.all([matchWorker(), cleanupStale()]);
  res.json({ ok: true });
});

export default app;
