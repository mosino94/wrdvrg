import express from 'express';
import { createClient } from '@supabase/supabase-js';
import { createHmac, randomUUID } from 'crypto';

function createServiceClient() {
  const url = process.env.VITE_SUPABASE_URL || '';
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || '';
  return createClient(url, key);
}

// Generate a LiveKit JWT token (no extra SDK needed - pure crypto)
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

const app = express();
app.use(express.json());

interface QueueEntry { id: string; profile_id: string; gender_filter: string; prefer_countries: string[]; avoid_countries: string[]; last_peer_id: string | null; last_5_peers: string[]; skip_count: number; joined_at: string; profile?: any; }
interface ScoredPair { userA: QueueEntry; userB: QueueEntry; score: number; reason: string; }

async function matchWorker() {
  try {
    const supabase = createServiceClient();
    const startTime = Date.now();

    // Cleanup stale entries
    const staleThreshold = new Date(Date.now() - 30_000).toISOString();
    const { data: staleEntries } = await supabase.from('queue').select('id, profile_id').eq('status', 'waiting').lt('last_heartbeat', staleThreshold);
    if (staleEntries?.length) {
      await supabase.from('queue').update({ status: 'cancelled' }).in('id', staleEntries.map((e: any) => e.id));
      await supabase.from('presence').update({ status: 'online' }).in('profile_id', staleEntries.map((e: any) => e.profile_id));
      console.log('[matchWorker] cancelled', staleEntries.length, 'stale entries');
    }

    // Step 1: Get waiting queue entries (no join — avoids ambiguous FK issue with 3 FKs to profiles)
    const { data: waitingQueue, error: qErr } = await supabase.from('queue')
      .select('id, profile_id, gender_filter, prefer_countries, avoid_countries, last_peer_id, last_5_peers, skip_count, joined_at')
      .eq('status', 'waiting')
      .gte('last_heartbeat', new Date(Date.now() - 30_000).toISOString())
      .order('joined_at', { ascending: true });

    console.log('[matchWorker] waiting:', waitingQueue?.length ?? 0, qErr?.message ?? '');
    if (!waitingQueue || waitingQueue.length < 2) return;

    // Step 2: Fetch profiles separately
    const profileIds = waitingQueue.map((q: any) => q.profile_id);
    const { data: profiles, error: pErr } = await supabase.from('profiles')
      .select('id, alias, gender, country_code, reputation')
      .in('id', profileIds);
    console.log('[matchWorker] profiles:', profiles?.length ?? 0, pErr?.message ?? '');
    const profileMap = new Map((profiles || []).map((p: any) => [p.id, p]));

    // Step 3: Combine
    const waitingUsers: QueueEntry[] = (waitingQueue as any[]).map(q => ({ ...q, profile: profileMap.get(q.profile_id) || null })).filter(u => u.profile !== null);
    console.log('[matchWorker] users with profiles:', waitingUsers.length);
    if (waitingUsers.length < 2) return;

    // Fetch blocks
    const { data: allBlocks } = await supabase.from('blocks').select('blocker_id, blocked_id')
      .or(`blocker_id.in.(${profileIds.join(',')}),blocked_id.in.(${profileIds.join(',')})`);
    const blockSet = new Set<string>();
    allBlocks?.forEach((b: any) => { blockSet.add(`${b.blocker_id}|${b.blocked_id}`); blockSet.add(`${b.blocked_id}|${b.blocker_id}`); });

    // Score pairs
    const scoredPairs: ScoredPair[] = [];
    const now = Date.now();
    for (let i = 0; i < waitingUsers.length; i++) {
      for (let j = i + 1; j < waitingUsers.length; j++) {
        const A = waitingUsers[i]; const B = waitingUsers[j];
        const pA = A.profile; const pB = B.profile;
        if (A.profile_id === B.profile_id) continue;
        if (blockSet.has(`${A.profile_id}|${B.profile_id}`)) continue;
        if (A.last_peer_id && A.last_peer_id === B.profile_id) continue;
        if (B.last_peer_id && B.last_peer_id === A.profile_id) continue;
        if (A.last_5_peers?.length && A.last_5_peers.includes(B.profile_id)) continue;
        if (B.last_5_peers?.length && B.last_5_peers.includes(A.profile_id)) continue;
        if (A.gender_filter !== 'all' && pB.gender !== A.gender_filter) continue;
        if (B.gender_filter !== 'all' && pA.gender !== B.gender_filter) continue;
        if (A.avoid_countries?.length && A.avoid_countries.includes(pB.country_code)) continue;
        if (B.avoid_countries?.length && B.avoid_countries.includes(pA.country_code)) continue;

        let score = 100; let reason = 'base';
        if (pA.country_code && pA.country_code === pB.country_code) { score += 30; reason = 'same_country'; }
        const rd = Math.abs((pA.reputation || 50) - (pB.reputation || 50));
        score += rd < 10 ? 25 : rd < 20 ? 15 : rd < 35 ? 5 : 0;
        const wA = Math.floor((now - new Date(A.joined_at).getTime()) / 1000);
        const wB = Math.floor((now - new Date(B.joined_at).getTime()) / 1000);
        if (wA > 10 && wB > 10) score += 20;
        if (wA > 20 || wB > 20) score += 15;
        if (wA > 30 || wB > 30) { score += 30; reason = 'urgent'; }
        score += Math.floor(Math.random() * 8);
        scoredPairs.push({ userA: A, userB: B, score: Math.max(score, 1), reason });
      }
    }

    console.log('[matchWorker] valid pairs:', scoredPairs.length);
    if (!scoredPairs.length) return;

    // Greedy match
    scoredPairs.sort((a, b) => b.score - a.score);
    const matched = new Set<string>(); const finalMatches: ScoredPair[] = [];
    for (const pair of scoredPairs) {
      if (matched.has(pair.userA.profile_id) || matched.has(pair.userB.profile_id)) continue;
      finalMatches.push(pair); matched.add(pair.userA.profile_id); matched.add(pair.userB.profile_id);
      if (finalMatches.length >= 10 || Date.now() - startTime > 3000) break;
    }

    console.log('[matchWorker] creating', finalMatches.length, 'matches');
    const livekitUrl = process.env.LIVEKIT_URL || '';

    for (const match of finalMatches) {
      try {
        const roomName = `wr-${randomUUID().replace(/-/g, '').slice(0, 16)}`;
        const [tokenA, tokenB] = await Promise.all([
          createLiveKitToken(roomName, match.userA.profile?.alias || 'GuestA'),
          createLiveKitToken(roomName, match.userB.profile?.alias || 'GuestB'),
        ]);

        const supabase2 = createServiceClient();
        const now2 = new Date().toISOString();
        const [resA, resB] = await Promise.all([
          supabase2.from('queue').update({ status: 'matched', room_url: livekitUrl, room_token: tokenA, matched_at: now2, matched_peer_id: match.userB.profile_id }).eq('id', match.userA.id),
          supabase2.from('queue').update({ status: 'matched', room_url: livekitUrl, room_token: tokenB, matched_at: now2, matched_peer_id: match.userA.profile_id }).eq('id', match.userB.id),
        ]);
        console.log('[matchWorker] queue A:', resA.error?.message ?? 'ok', 'B:', resB.error?.message ?? 'ok');

        await supabase2.from('rooms').insert({ daily_room_name: roomName, daily_room_url: livekitUrl, participant_1: match.userA.profile_id, participant_2: match.userB.profile_id, match_score: match.score, match_reason: match.reason }).catch(() => {});
        await supabase2.from('presence').update({ status: 'in_call' }).in('profile_id', [match.userA.profile_id, match.userB.profile_id]);
        console.log('[matchWorker] matched:', match.userA.profile_id, '<->', match.userB.profile_id);
      } catch (err: any) {
        console.error('[matchWorker] error:', err.message);
      }
    }
  } catch (err) { console.error('[matchWorker] top-level error:', err); }
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

app.get('/api/test', async (_req, res) => {
  const livekitKey = process.env.LIVEKIT_API_KEY || '';
  const livekitSecret = process.env.LIVEKIT_API_SECRET || '';
  const livekitUrl = process.env.LIVEKIT_URL || '';
  if (!livekitKey || !livekitSecret || !livekitUrl) {
    return res.json({ status: 'error', message: `Missing: ${[!livekitKey && 'LIVEKIT_API_KEY', !livekitSecret && 'LIVEKIT_API_SECRET', !livekitUrl && 'LIVEKIT_URL'].filter(Boolean).join(', ')}` });
  }
  return res.json({ status: 'ok', message: 'LiveKit config is set' });
});

app.get('/api/debug-queue', async (_req, res) => {
  try {
    const supabase = createServiceClient();
    const { data: queue, error } = await supabase.from('queue').select('id, profile_id, status, gender_filter, avoid_countries, last_heartbeat, joined_at').eq('status', 'waiting');
    const { data: profiles } = await supabase.from('profiles').select('id, alias, gender, country_code');
    return res.json({ queue, profiles, error: error?.message, time: new Date().toISOString() });
  } catch (err: any) { res.json({ error: err.message }); }
});

// Use real user IP from x-forwarded-for (Vercel sets this)
app.get('/api/country', async (req, res) => {
  const forwarded = req.headers['x-forwarded-for'] as string | undefined;
  const userIp = forwarded ? forwarded.split(',')[0].trim() : '';
  const isLocal = !userIp || userIp === '::1' || userIp.startsWith('127.') || userIp.startsWith('192.168.') || userIp.startsWith('10.');

  if (!isLocal) {
    try {
      const r = await fetch(`https://ip2c.org/${userIp}`);
      const t = await r.text();
      if (t.startsWith('1;')) return res.json({ country: t.split(';')[1] });
    } catch {}
    try {
      const r2 = await fetch(`https://ipapi.co/${userIp}/country/`, { headers: { 'User-Agent': 'wrdvrg/1.0' } });
      if (r2.ok) {
        const t2 = await r2.text();
        if (t2.trim().length === 2 && /^[A-Z]+$/.test(t2.trim())) return res.json({ country: t2.trim() });
      }
    } catch {}
  }
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

    const { data: existing } = await supabase.from('queue').select('id, status, room_url, room_token, matched_peer_id').eq('profile_id', profileId).eq('status', 'waiting').maybeSingle();
    if (existing) {
      await matchWorker();
      const { data: updated } = await supabase.from('queue').select('id, status, room_url, room_token, matched_peer_id').eq('id', existing.id).maybeSingle();
      return res.json({ queueId: existing.id, status: updated?.status || 'waiting', roomUrl: updated?.room_url || null, roomToken: updated?.room_token || null, matchedPeerId: updated?.matched_peer_id || null });
    }

    // Auto-end any stale active rooms (older than 3 min) so they don't block re-queueing
    await supabase.from('rooms')
      .update({ ended_at: new Date().toISOString() })
      .or(`participant_1.eq.${profileId},participant_2.eq.${profileId}`)
      .is('ended_at', null)
      .lt('started_at', new Date(Date.now() - 3 * 60_000).toISOString());

    const { data: activeRoom } = await supabase.from('rooms').select('id, started_at').or(`participant_1.eq.${profileId},participant_2.eq.${profileId}`).is('ended_at', null).maybeSingle();
    if (activeRoom) {
      // Fresh active room (< 3 min) — end it anyway so user can re-queue
      await supabase.from('rooms').update({ ended_at: new Date().toISOString() }).eq('id', activeRoom.id);
    }

    const { data: lastCalls } = await supabase.from('call_history').select('peer_id').eq('owner_id', profileId).order('called_at', { ascending: false }).limit(5);
    const last5Peers = lastCalls?.map((c: any) => c.peer_id).filter(Boolean) || [];

    const { data: queueEntry, error } = await supabase.from('queue').insert({
      profile_id: profileId, gender_filter: genderFilter,
      prefer_countries: preferCountries, avoid_countries: avoidCountries,
      last_peer_id: last5Peers[0] || null, last_5_peers: last5Peers.slice(0, 5),
    }).select().single();
    if (error) throw error;

    await supabase.from('presence').upsert({ profile_id: profileId, status: 'searching', last_heartbeat: new Date().toISOString() });
    await matchWorker();

    const { data: afterMatch } = await supabase.from('queue').select('status, room_url, room_token, matched_peer_id').eq('id', queueEntry.id).maybeSingle();
    return res.json({ queueId: queueEntry.id, status: afterMatch?.status || 'waiting', roomUrl: afterMatch?.room_url || null, roomToken: afterMatch?.room_token || null, matchedPeerId: afterMatch?.matched_peer_id || null });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

app.post('/api/heartbeat', async (req, res) => {
  try {
    const { profileId, queueId } = req.body;
    const supabase = createServiceClient();
    const now = new Date().toISOString();
    await supabase.from('presence').upsert({ profile_id: profileId, last_heartbeat: now });
    if (queueId) {
      await supabase.from('queue').update({ last_heartbeat: now }).eq('id', queueId).eq('status', 'waiting');
      const { data: entry } = await supabase.from('queue').select('status, room_url, room_token, matched_peer_id').eq('id', queueId).maybeSingle();
      if (entry?.status === 'matched') {
        return res.json({ ok: true, status: 'matched', roomUrl: entry.room_url, roomToken: entry.room_token, matchedPeerId: entry.matched_peer_id });
      }
    }
    return res.json({ ok: true, status: 'waiting' });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

app.post('/api/dequeue', async (req, res) => {
  try {
    const { profileId, queueId } = req.body; const supabase = createServiceClient();
    if (queueId) await supabase.from('queue').update({ status: 'cancelled' }).eq('id', queueId).eq('profile_id', profileId);
    else await supabase.from('queue').update({ status: 'cancelled' }).eq('profile_id', profileId).in('status', ['waiting', 'matched']);
    // Also end any active rooms so user can re-queue freely
    await supabase.from('rooms').update({ ended_at: new Date().toISOString() })
      .or(`participant_1.eq.${profileId},participant_2.eq.${profileId}`)
      .is('ended_at', null);
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

// ── FRIEND REQUESTS ──────────────────────────────────────────────────────────

app.post('/api/friend-requests/send', async (req, res) => {
  try {
    const { senderId, receiverId } = req.body;
    if (!senderId || !receiverId) return res.status(400).json({ error: 'missing_fields' });
    if (senderId === receiverId) return res.status(400).json({ error: 'cannot_add_self' });
    const supabase = createServiceClient();

    const { data: alreadyFriend } = await supabase.from('friends').select('id').eq('owner_id', senderId).eq('friend_id', receiverId).maybeSingle();
    if (alreadyFriend) return res.status(409).json({ error: 'already_friends' });

    const { data: existing } = await supabase.from('friend_requests').select('id, status').eq('sender_id', senderId).eq('receiver_id', receiverId).maybeSingle();
    if (existing?.status === 'pending') return res.status(409).json({ error: 'request_already_sent' });

    const { data: sender } = await supabase.from('profiles').select('alias, country_code, gender').eq('id', senderId).single();
    if (!sender) return res.status(404).json({ error: 'sender_not_found' });

    const { data: request, error } = await supabase.from('friend_requests').upsert({
      sender_id: senderId,
      receiver_id: receiverId,
      sender_alias: sender.alias,
      sender_country: sender.country_code,
      sender_gender: sender.gender,
      status: 'pending',
      sent_at: new Date().toISOString(),
    }).select().single();
    if (error) throw error;

    return res.json({ requestId: request.id, status: 'sent' });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

app.post('/api/friend-requests/respond', async (req, res) => {
  try {
    const { requestId, responderId, response } = req.body;
    if (!requestId || !responderId || !response) return res.status(400).json({ error: 'missing_fields' });
    if (!['accept', 'decline'].includes(response)) return res.status(400).json({ error: 'invalid_response' });
    const supabase = createServiceClient();

    const { data: request } = await supabase.from('friend_requests').select('*').eq('id', requestId).eq('receiver_id', responderId).eq('status', 'pending').maybeSingle();
    if (!request) return res.status(404).json({ error: 'request_not_found' });

    await supabase.from('friend_requests').update({
      status: response === 'accept' ? 'accepted' : 'declined',
      responded_at: new Date().toISOString(),
    }).eq('id', requestId);

    if (response === 'accept') {
      await supabase.from('friends').insert([
        { owner_id: responderId, friend_id: request.sender_id, nickname: '' },
        { owner_id: request.sender_id, friend_id: responderId, nickname: '' },
      ]);
      const { data: responder } = await supabase.from('profiles').select('alias, country_code, gender').eq('id', responderId).single();
      return res.json({ status: 'accepted', newFriend: { alias: responder?.alias, country: responder?.country_code, gender: responder?.gender } });
    }
    return res.json({ status: 'declined' });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

app.get('/api/friend-requests/pending/:profileId', async (req, res) => {
  try {
    const { profileId } = req.params;
    const supabase = createServiceClient();
    const { data } = await supabase.from('friend_requests').select('id, sender_id, sender_alias, sender_country, sender_gender, sent_at').eq('receiver_id', profileId).eq('status', 'pending').order('sent_at', { ascending: false });
    return res.json(data || []);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// ── END CALL BROADCAST ───────────────────────────────────────────────────────

app.post('/api/end-call', async (req, res) => {
  try {
    const { roomId, profileId, reason } = req.body;
    if (!roomId || !profileId) return res.status(400).json({ error: 'missing_fields' });
    const supabase = createServiceClient();

    await supabase.channel(`room-broadcast-${roomId}`).send({
      type: 'broadcast',
      event: 'call_ended',
      payload: { reason: reason || 'end_call', endedBy: profileId, endedAt: new Date().toISOString() },
    });

    return res.json({ ok: true });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

export default app;
