import { useEffect, useRef } from 'react';
import { useCallStore } from '../store/useCallStore';
import { useAppStore } from '../store/useAppStore';
import { useFilterStore } from '../store/useFilterStore';
import { supabase } from '../lib/supabase';

// Returns parsed JSON only if the response is ok and content-type is JSON
async function safeJson(res: Response): Promise<any | null> {
  if (!res.ok) return null;
  if (!(res.headers.get('content-type') || '').includes('application/json')) return null;
  try { return await res.json(); } catch { return null; }
}

export function useMatchmaking() {
  const { callState, setCallState, setRoomDetails, setPeerDetails } = useCallStore();
  const { alias, gender, countryCode } = useAppStore();
  const { genderFilter, preferCountries, blockCountries } = useFilterStore();
  const heartbeatIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const queueIdRef = useRef<string | null>(null);
  const matchHandledRef = useRef(false);

  useEffect(() => {
    let active = true;
    let realtimeChannel: any = null;
    matchHandledRef.current = false;

    const getOrCreateProfile = async () => {
      const { data: profile } = await supabase
        .from('profiles')
        .select('id')
        .eq('alias', alias)
        .maybeSingle();
      if (profile) return profile;

      const res = await fetch('/api/sync-profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ alias, countryCode, gender }),
      });
      const data = await safeJson(res);
      if (data?.id) return { id: data.id };
      return null;
    };

    const handleMatch = async (data: {
      id?: string; queueId?: string;
      room_url?: string; roomUrl?: string;
      room_token?: string; roomToken?: string;
      matched_peer_id?: string; matchedPeerId?: string;
    }) => {
      if (!active || matchHandledRef.current) return;
      matchHandledRef.current = true;

      const roomId = data.id || data.queueId || queueIdRef.current || '';
      const roomUrl = data.room_url || data.roomUrl || '';
      const roomToken = data.room_token || data.roomToken || '';
      const matchedPeerId = data.matched_peer_id || data.matchedPeerId || '';

      if (!roomUrl || !roomToken || !matchedPeerId) {
        console.error('[matchmaking] handleMatch incomplete data', data);
        matchHandledRef.current = false;
        return;
      }

      setCallState('connecting');

      const { data: peerData } = await supabase
        .from('profiles')
        .select('id, alias, country_code, gender')
        .eq('id', matchedPeerId)
        .maybeSingle();

      setPeerDetails({
        id: matchedPeerId,
        alias: peerData?.alias || 'Anonymous',
        country: peerData?.country_code || null,
        gender: peerData?.gender || null,
      });

      setRoomDetails({ id: roomId, url: roomUrl, token: roomToken });
    };

    const startSearching = async () => {
      queueIdRef.current = null; // clear stale ID from previous session
      try {
        const profile = await getOrCreateProfile();
        if (!profile || !active) return;

        realtimeChannel = supabase
          .channel(`queue-match-${profile.id}`)
          .on(
            'postgres_changes',
            { event: 'UPDATE', schema: 'public', table: 'queue', filter: `profile_id=eq.${profile.id}` },
            async (payload) => {
              if (payload.new.status === 'matched') {
                await handleMatch(payload.new);
              }
            }
          )
          .subscribe();

        const enqueueRes = await fetch('/api/enqueue', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ profileId: profile.id, genderFilter, preferCountries, avoidCountries: blockCountries }),
        });

        const enqueueData = await safeJson(enqueueRes);
        if (!enqueueData) {
          console.error('[matchmaking] enqueue failed or returned non-JSON');
          if (active) setCallState('idle');
          return;
        }

        if (enqueueData.error) {
          console.error('[matchmaking] enqueue error:', enqueueData.error);
          if (active) setCallState('idle');
          return;
        }

        queueIdRef.current = enqueueData.queueId;

        if (enqueueData.status === 'matched') {
          await handleMatch(enqueueData);
          return;
        }

        // Heartbeat fallback every 8s in case Realtime misses the event
        heartbeatIntervalRef.current = setInterval(async () => {
          if (!active || matchHandledRef.current) return;
          try {
            const hbRes = await fetch('/api/heartbeat', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ profileId: profile.id, queueId: queueIdRef.current }),
            });
            const hbData = await safeJson(hbRes);
            if (hbData?.status === 'matched') {
              await handleMatch({
                queueId: queueIdRef.current || '',
                roomUrl: hbData.roomUrl,
                roomToken: hbData.roomToken,
                matchedPeerId: hbData.matchedPeerId,
              });
            }
          } catch (e) { console.error('[matchmaking] heartbeat error:', e); }
        }, 8000);
      } catch (err) {
        console.error('[matchmaking] startSearching error:', err);
        if (active) setCallState('idle');
      }
    };

    const cleanupQueue = async () => {
      if (!alias) return;
      const { data: profile } = await supabase.from('profiles').select('id').eq('alias', alias).maybeSingle();
      if (profile) {
        await fetch('/api/dequeue', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ profileId: profile.id, queueId: queueIdRef.current }),
        }).catch(() => {});
        queueIdRef.current = null;
      }
    };

    if (callState === 'searching') {
      startSearching();
    } else {
      if (heartbeatIntervalRef.current) clearInterval(heartbeatIntervalRef.current);
      if (realtimeChannel) supabase.removeChannel(realtimeChannel);
      if (callState === 'idle') cleanupQueue();
    }

    return () => {
      active = false;
      if (heartbeatIntervalRef.current) clearInterval(heartbeatIntervalRef.current);
      if (realtimeChannel) supabase.removeChannel(realtimeChannel);
    };
  }, [callState, alias, genderFilter, preferCountries, blockCountries, setCallState, setRoomDetails, setPeerDetails]);
}
