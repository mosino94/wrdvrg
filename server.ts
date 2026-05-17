import express from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { createClient } from '@supabase/supabase-js';
import { randomUUID, createHmac } from 'crypto';

function createServiceClient() {
  const supabaseUrl = process.env.VITE_SUPABASE_URL || 'https://placeholder.supabase.co';
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || 'placeholder';
  return createClient(supabaseUrl, supabaseKey);
}

const app = express();
app.use(express.json());
const PORT = parseInt(process.env.PORT || '3000', 10);

// LiveKit JWT (pure Node.js crypto — no SDK needed)
async function createLiveKitToken(room: string, identity: string): Promise<string> {
  const apiKey = process.env.LIVEKIT_API_KEY || '';
  const apiSecret = process.env.LIVEKIT_API_SECRET || '';
  if (!apiKey || !apiSecret) throw new Error('LIVEKIT_API_KEY or LIVEKIT_API_SECRET not set');
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'HS256', typ: 'JWT' };
  const payload = {
    iss: apiKey, sub: identity, iat: now, exp: now + 3600, nbf: now - 30,
    video: { room, roomJoin: true, canPublish: true, canSubscribe: true },
  };
  const enc = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const input = `${enc(header)}.${enc(payload)}`;
  const sig = createHmac('sha256', apiSecret).update(input).digest('base64url');
  return `${input}.${sig}`;
}

// Online count — queries presence table server-side
app.get('/api/online-count', async (_req, res) => {
  try {
    const supabase = createServiceClient();
    const { count } = await supabase
      .from('presence')
      .select('*', { count: 'exact', head: true })
      .gte('last_heartbeat', new Date(Date.now() - 600_000).toISOString());
    return res.json({ count: count ?? 0 });
  } catch {
    return res.json({ count: 0 });
  }
});

// Country detection using real client IP from x-forwarded-for
app.get('/api/country', async (req, res) => {
  try {
    const forwarded = req.headers['x-forwarded-for'] as string;
    const ip = forwarded ? forwarded.split(',')[0].trim() : req.socket.remoteAddress || '';
    let countryCode = 'US';
    try {
      const r = await fetch(`https://ipapi.co/${ip}/country/`);
      if (r.ok) { const t = await r.text(); if (t?.trim().length === 2) countryCode = t.trim().toUpperCase(); }
    } catch {
      try {
        const r2 = await fetch(`https://ip2c.org/${ip}`);
        const d = await r2.text();
        if (d?.startsWith('1;')) countryCode = d.split(';')[1] || 'US';
      } catch {}
    }
    res.json({ countryCode });
  } catch { res.json({ countryCode: 'US' }); }
});

// Profile sync
app.post('/api/sync-profile', async (req, res) => {
  try {
    const { alias, countryCode, gender } = req.body;
    if (!alias) return res.status(400).json({ error: 'Alias required' });
    const supabase = createServiceClient();
    let { data: profile } = await supabase.from('profiles').select('*').eq('alias', alias).maybeSingle();
    if (!profile) {
      const { data: np, error } = await supabase.from('profiles')
        .insert({ alias, country_code: countryCode || null, gender: gender || null, is_guest: true })
        .select().single();
      if (error) throw error;
      profile = np;
    } else {
      const updates: any = {};
      if (countryCode && profile.country_code !== countryCode) updates.country_code = countryCode;
      if (gender !== undefined && gender !== null && profile.gender !== gender) updates.gender = gender;
      if (Object.keys(updates).length) {
        const { data: up } = await supabase.from('profiles').update(updates).eq('id', profile.id).select().single();
        if (up) profile = up;
      }
    }
    return res.json(profile);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// Enqueue
app.post('/api/enqueue', async (req, res) => {
  try {
    const { profileId, genderFilter = 'all', preferCountries = [], avoidCountries = [] } = req.body;
    const supabase = createServiceClient();

    const { data: cd } = await supabase.from('queue_cooldowns').select('cooldown_until, reason')
      .eq('profile_id', profileId).gt('cooldown_until', new Date().toISOString()).single();
    if (cd) {
      const secs = Math.ceil((new Date(cd.cooldown_until).getTime() - Date.now()) / 1000);
      return res.status(429).json({ error: 'cooldown_active', reason: cd.reason, remainingSeconds: secs });
    }

    const { data: existing } = await supabase.from('queue').select('id')
      .eq('profile_id', profileId).eq('status', 'waiting').single();
    if (existing) return res.status(409).json({ error: 'already_in_queue', queueId: existing.id });

    const { data: lastCall } = await supabase.from('call_history').select('peer_id')
      .eq('owner_id', profileId).order('called_at', { ascending: false }).limit(5);
    const last5Peers = lastCall?.map((c: any) => c.peer_id).filter(Boolean) || [];

    const oneHourAgo = new Date(Date.now() - 3600000).toISOString();
    const { count: recent } = await supabase.from('queue').select('id', { count: 'exact', head: true })
      .eq('profile_id', profileId).gte('joined_at', oneHourAgo);
    if ((recent || 0) >= 30) {
      await supabase.from('queue_cooldowns').upsert({
        profile_id: profileId, reason: 'search_spam',
        cooldown_until: new Date(Date.now() + 5 * 60000).toISOString(),
      });
      return res.status(429).json({ error: 'rate_limited', remainingSeconds: 300 });
    }

    const { data: queueEntry, error } = await supabase.from('queue').insert({
      profile_id: profileId, gender_filter: genderFilter,
      prefer_countries: preferCountries, avoid_countries: avoidCountries,
      last_peer_id: last5Peers[0] || null, last_5_peers: last5Peers.slice(0, 5),
    }).select().single();
    if (error) throw error;

    await supabase.from('presence').upsert({ profile_id: profileId, status: 'searching', last_heartbeat: new Date().toISOString() });

    await matchWorker();

    const { data: updated } = await supabase.from('queue').select('status, room_url, room_token, matched_peer_id, room_id')
      .eq('id', queueEntry.id).single();
    if (updated?.status === 'matched') {
      const { data: peerData } = await supabase.from('profiles').select('id, alias, country_code, gender')
        .eq('id', updated.matched_peer_id).single();
      return res.json({
        queueId: queueEntry.id, status: 'matched',
        room_url: updated.room_url, room_token: updated.room_token,
        matched_peer_id: updated.matched_peer_id, room_id: updated.room_id,
        peer: peerData || null,
      });
    }

    return res.json({ queueId: queueEntry.id, status: 'waiting' });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// Heartbeat — returns match status for polling fallback
app.post('/api/heartbeat', async (req, res) => {
  try {
    const { profileId, queueId } = req.body;
    const supabase = createServiceClient();
    const now = new Date().toISOString();
    await supabase.from('presence').upsert({ profile_id: profileId, last_heartbeat: now });
    if (queueId) {
      const { data: qr } = await supabase.from('queue')
        .select('status, room_url, room_token, matched_peer_id, room_id').eq('id', queueId).single();
      if (qr?.status === 'waiting') {
        await supabase.from('queue').update({ last_heartbeat: now }).eq('id', queueId).eq('status', 'waiting');
      }
      if (qr?.status === 'matched') {
        const { data: peerData } = await supabase.from('profiles').select('id, alias, country_code, gender')
          .eq('id', qr.matched_peer_id).single();
        return res.json({
          ok: true, status: 'matched',
          room_url: qr.room_url, room_token: qr.room_token,
          matched_peer_id: qr.matched_peer_id, room_id: qr.room_id,
          peer: peerData || null,
        });
      }
    }
    return res.json({ ok: true, status: 'waiting' });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// Dequeue
app.post('/api/dequeue', async (req, res) => {
  try {
    const { profileId, queueId } = req.body;
    const supabase = createServiceClient();
    await supabase.from('queue').update({ status: 'cancelled' }).eq('id', queueId).eq('profile_id', profileId).eq('status', 'waiting');
    await supabase.from('presence').update({ status: 'online', last_heartbeat: new Date().toISOString() }).eq('profile_id', profileId);
    return res.json({ ok: true });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// Friend request — send
app.post('/api/friend-request/send', async (req, res) => {
  try {
    const { senderId, receiverId, senderAlias, senderCountry, senderGender } = req.body;
    if (!senderId || !receiverId) return res.status(400).json({ error: 'senderId and receiverId required' });
    const supabase = createServiceClient();
    const { data: existing } = await supabase.from('friends').select('id').eq('profile_id', senderId).eq('friend_id', receiverId).single();
    if (existing) return res.json({ status: 'already_friends' });
    const { data: pending } = await supabase.from('friend_requests').select('id').eq('sender_id', senderId).eq('receiver_id', receiverId).eq('status', 'pending').single();
    if (pending) return res.json({ status: 'already_sent' });
    const { error } = await supabase.from('friend_requests').insert({
      sender_id: senderId, receiver_id: receiverId,
      sender_alias: senderAlias, sender_country: senderCountry, sender_gender: senderGender,
      status: 'pending',
    });
    if (error) throw error;
    return res.json({ ok: true, status: 'sent' });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// Friend request — respond
app.post('/api/friend-request/respond', async (req, res) => {
  try {
    const { requestId, response } = req.body;
    if (!requestId || !response) return res.status(400).json({ error: 'requestId and response required' });
    const supabase = createServiceClient();
    const { data: request } = await supabase.from('friend_requests').select('*').eq('id', requestId).eq('status', 'pending').single();
    if (!request) return res.status(404).json({ error: 'Not found' });
    await supabase.from('friend_requests').update({ status: response }).eq('id', requestId);
    if (response === 'accepted') {
      await supabase.from('friends').upsert([
        { profile_id: request.sender_id, friend_id: request.receiver_id },
        { profile_id: request.receiver_id, friend_id: request.sender_id },
      ]);
    }
    return res.json({ ok: true });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// Match Worker
interface ScoredPair { userA: any; userB: any; score: number; breakdown: Record<string, number>; reason: string; }

let isMatchWorkerRunning = false;
async function matchWorker() {
  if (isMatchWorkerRunning) return;
  isMatchWorkerRunning = true;
  try {
    const supabase = createServiceClient();
    const startTime = Date.now();

    const staleTs = new Date(Date.now() - 30_000).toISOString();
    const { data: stale } = await supabase.from('queue').select('id, profile_id').eq('status', 'waiting').lt('last_heartbeat', staleTs);
    if (stale?.length) {
      await supabase.from('queue').update({ status: 'cancelled' }).in('id', stale.map((e: any) => e.id));
      await supabase.from('presence').update({ status: 'online' }).in('profile_id', stale.map((e: any) => e.profile_id));
    }

    // Two separate queries to avoid ambiguous FK join (queue has 3 FKs to profiles)
    const { data: waitingQueue } = await supabase.from('queue')
      .select('id, profile_id, gender_filter, prefer_countries, avoid_countries, last_peer_id, last_5_peers, skip_count, joined_at')
      .eq('status', 'waiting')
      .gte('last_heartbeat', new Date(Date.now() - 30_000).toISOString())
      .order('joined_at', { ascending: true });

    if (!waitingQueue || waitingQueue.length < 2) { isMatchWorkerRunning = false; return; }

    const profileIds = waitingQueue.map((q: any) => q.profile_id);
    const { data: profiles } = await supabase.from('profiles').select('id, gender, country_code, reputation, alias').in('id', profileIds);
    const profileMap = new Map(profiles?.map((p: any) => [p.id, p]) || []);
    const waitingUsers = waitingQueue
      .map((q: any) => ({ ...q, profile: profileMap.get(q.profile_id) }))
      .filter((u: any) => u.profile);

    if (waitingUsers.length < 2) { isMatchWorkerRunning = false; return; }

    const { data: allBlocks } = await supabase.from('blocks').select('blocker_id, blocked_id')
      .or(`blocker_id.in.(${profileIds.join(',')}),blocked_id.in.(${profileIds.join(',')})`);
    const blockSet = new Set<string>();
    allBlocks?.forEach((b: any) => { blockSet.add(`${b.blocker_id}|${b.blocked_id}`); blockSet.add(`${b.blocked_id}|${b.blocker_id}`); });
    const isBlocked = (a: string, b: string) => blockSet.has(`${a}|${b}`);

    const scoredPairs: ScoredPair[] = [];
    const now = Date.now();

    for (let i = 0; i < waitingUsers.length; i++) {
      for (let j = i + 1; j < waitingUsers.length; j++) {
        const A = waitingUsers[i] as any, B = waitingUsers[j] as any;
        const pA = A.profile, pB = B.profile;
        const bd: Record<string, number> = {};
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
        if (A.prefer_countries?.length && A.prefer_countries.includes(pB.country_code)) { score += 50; bd.a_pref = 50; reason = 'country_preferred'; }
        if (B.prefer_countries?.length && B.prefer_countries.includes(pA.country_code)) { score += 50; bd.b_pref = 50; reason = 'country_preferred'; }
        if (pA.country_code === pB.country_code) { score += 30; bd.same_country = 30; if (reason === 'base') reason = 'same_country'; }
        if (bd.a_pref && bd.b_pref) { score += 40; bd.mutual = 40; reason = 'mutual_country_preferred'; }
        if (B.gender_filter !== 'all' && pA.gender === B.gender_filter) { score += 15; bd.a_matches_b = 15; }
        if (A.gender_filter !== 'all' && pB.gender === A.gender_filter) { score += 15; bd.b_matches_a = 15; }
        const rd = Math.abs(pA.reputation - pB.reputation);
        if (rd < 10) { score += 25; bd.rep = 25; } else if (rd < 20) { score += 15; bd.rep = 15; } else if (rd < 35) { score += 5; bd.rep = 5; }
        const wA = Math.floor((now - new Date(A.joined_at).getTime()) / 1000);
        const wB = Math.floor((now - new Date(B.joined_at).getTime()) / 1000);
        if (wA > 10 && wB > 10) { score += 20; bd.both_waited = 20; }
        if (wA > 20 || wB > 20) { score += 15; bd.urgent = 15; }
        if (wA > 30 || wB > 30) { score += 30; bd.critical = 30; reason = 'urgent_timeout'; }
        if (A.skip_count > 5 || B.skip_count > 5) { score -= 10; bd.skip_pen = -10; }
        if (pA.reputation < 40) { const p = -Math.floor((40 - pA.reputation) / 2); score += p; bd.a_rep_pen = p; }
        if (pB.reputation < 40) { const p = -Math.floor((40 - pB.reputation) / 2); score += p; bd.b_rep_pen = p; }
        score += Math.floor(Math.random() * 8);
        score = Math.max(score, 1);
        scoredPairs.push({ userA: A, userB: B, score, breakdown: bd, reason });
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

    const livekitUrl = process.env.VITE_LIVEKIT_URL || process.env.LIVEKIT_URL || '';

    for (const match of finalMatches) {
      try {
        const roomName = `wrdvrg-${randomUUID().replace(/-/g, '').slice(0, 16)}`;
        const pA = match.userA.profile, pB = match.userB.profile;
        const tokenA = await createLiveKitToken(roomName, pA?.alias || `u-${match.userA.profile_id.slice(0, 8)}`);
        const tokenB = await createLiveKitToken(roomName, pB?.alias || `u-${match.userB.profile_id.slice(0, 8)}`);

        const { data: roomRow } = await supabase.from('rooms').insert({
          room_name: roomName, room_url: livekitUrl,
          participant_1: match.userA.profile_id, participant_2: match.userB.profile_id,
          match_score: match.score, match_reason: match.reason, status: 'active',
        }).select().single();

        const roomId = roomRow?.id;

        await supabase.from('queue').update({
          status: 'matched', room_url: livekitUrl, room_token: tokenA,
          matched_at: new Date().toISOString(), matched_peer_id: match.userB.profile_id,
          ...(roomId ? { room_id: roomId } : {}),
        }).eq('id', match.userA.id);

        await supabase.from('queue').update({
          status: 'matched', room_url: livekitUrl, room_token: tokenB,
          matched_at: new Date().toISOString(), matched_peer_id: match.userA.profile_id,
          ...(roomId ? { room_id: roomId } : {}),
        }).eq('id', match.userB.id);

        await supabase.from('presence').update({ status: 'in_call' })
          .in('profile_id', [match.userA.profile_id, match.userB.profile_id]);

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
        console.error('Room creation failed:', err.message);
        await supabase.from('queue').update({ status: 'waiting' }).in('id', [match.userA.id, match.userB.id]);
      }
    }
  } catch (err) {
    console.error('Match worker error:', err);
  } finally {
    isMatchWorkerRunning = false;
  }
}

let isCleanupRunning = false;
async function cleanupStale() {
  if (isCleanupRunning) return;
  isCleanupRunning = true;
  try {
    const supabase = createServiceClient();
    const now = new Date();
    await supabase.from('queue').update({ status: 'cancelled' }).eq('status', 'waiting').lt('last_heartbeat', new Date(now.getTime() - 30_000).toISOString());
    await supabase.from('queue').update({ status: 'cancelled' }).eq('status', 'matched').lt('matched_at', new Date(now.getTime() - 15_000).toISOString());
    await supabase.from('rooms').update({ ended_at: now.toISOString(), status: 'ended' }).is('ended_at', null).lt('started_at', new Date(now.getTime() - 3600_000).toISOString());
    await supabase.from('presence').update({ status: 'offline' }).neq('status', 'offline').lt('last_heartbeat', new Date(now.getTime() - 60_000).toISOString());
    await supabase.from('queue_cooldowns').delete().lt('cooldown_until', now.toISOString());
  } catch (err) {
    console.error('Cleanup error:', err);
  } finally {
    isCleanupRunning = false;
  }
}

setInterval(matchWorker, 2000);
setInterval(cleanupStale, 30000);

async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({ server: { middlewareMode: true }, appType: 'spa' });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => { res.sendFile(path.join(distPath, 'index.html')); });
  }
  app.listen(PORT, '0.0.0.0', () => { console.log(`Server running on http://localhost:${PORT}`); });
}

startServer();
