import { useEffect, useRef } from 'react';
import { useCallStore } from '../store/useCallStore';
import { useAppStore } from '../store/useAppStore';
import { useFilterStore } from '../store/useFilterStore';
import { supabase } from '../lib/supabase';

export function useMatchmaking() {
  const { callState, setCallState, setRoomDetails, setPeerDetails, setCallDurationBase } = useCallStore();
  const { alias, profileId } = useAppStore();
  const { genderFilter, preferCountries, blockCountries } = useFilterStore();
  const heartbeatIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const queueIdRef = useRef<string | null>(null);
  const matchHandledRef = useRef(false);

  const handleMatch = async (data: {
    room_url?: string; room_token?: string; matched_peer_id?: string;
    roomUrl?: string; roomToken?: string; matchedPeerId?: string;
    peer?: any; room_id?: string;
  }) => {
    const { setCallState: setState } = useCallStore.getState();
    if (matchHandledRef.current) return;
    matchHandledRef.current = true;

    const roomUrl = data.room_url || data.roomUrl || '';
    const roomToken = data.room_token || data.roomToken || '';
    const matchedPeerId = data.matched_peer_id || data.matchedPeerId || '';
    const roomId = data.room_id || matchedPeerId;

    if (!roomUrl || !roomToken || !matchedPeerId) {
      matchHandledRef.current = false;
      return;
    }

    let peerData = data.peer;
    if (!peerData) {
      const { data: fetched } = await supabase
        .from('profiles').select('id, alias, country_code, gender')
        .eq('id', matchedPeerId).single();
      peerData = fetched;
    }

    setPeerDetails({
      id: matchedPeerId,
      alias: peerData?.alias || 'Anonymous',
      country: peerData?.country_code || null,
      gender: peerData?.gender || null,
    });
    setRoomDetails({ id: roomId, url: roomUrl, token: roomToken });
    setState('connecting');
  };

  useEffect(() => {
    let active = true;
    let realtimeChannel: ReturnType<typeof supabase.channel> | null = null;

    const startSearching = async () => {
      try {
        matchHandledRef.current = false;

        // Resolve profile ID: store → localStorage → API (never direct Supabase anon query)
        let pid = profileId || localStorage.getItem('whisper_profile_id') || null;

        if (!pid) {
          if (!alias) { if (active) setCallState('idle'); return; }
          try {
            const res = await fetch('/api/sync-profile', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ alias, countryCode: null, gender: null }),
            });
            if (res.ok) {
              const profile = await res.json();
              if (profile?.id) {
                pid = profile.id;
                useAppStore.getState().setProfileId(profile.id);
                localStorage.setItem('whisper_profile_id', profile.id);
              }
            }
          } catch {}
          if (!pid) { if (active) setCallState('idle'); return; }
        }

        // Subscribe to realtime BEFORE enqueue to avoid race condition
        realtimeChannel = supabase.channel(`queue-${pid}`)
          .on(
            'postgres_changes',
            { event: 'UPDATE', schema: 'public', table: 'queue', filter: `profile_id=eq.${pid}` },
            async (payload) => {
              if (payload.new.status === 'matched' && active) {
                if (heartbeatIntervalRef.current) clearInterval(heartbeatIntervalRef.current);
                await handleMatch({
                  room_url: payload.new.room_url,
                  room_token: payload.new.room_token,
                  matched_peer_id: payload.new.matched_peer_id,
                  room_id: payload.new.room_id,
                });
              }
            }
          )
          .subscribe();

        const enqueueRes = await fetch('/api/enqueue', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ profileId: pid, genderFilter, preferCountries, avoidCountries: blockCountries }),
        });

        if (!enqueueRes.ok) {
          if (active) setCallState('idle');
          return;
        }

        const enqueueData = await enqueueRes.json();
        queueIdRef.current = enqueueData.queueId;

        // Already matched from enqueue response (synchronous match)
        if (enqueueData.status === 'matched' && active) {
          if (heartbeatIntervalRef.current) clearInterval(heartbeatIntervalRef.current);
          await handleMatch(enqueueData);
          return;
        }

        // Heartbeat polls every 8s as fallback for missed Realtime events
        heartbeatIntervalRef.current = setInterval(async () => {
          if (!active) return;
          try {
            const res = await fetch('/api/heartbeat', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ profileId: pid, queueId: queueIdRef.current }),
            });
            const data = await res.json();
            if (data.status === 'matched' && active) {
              clearInterval(heartbeatIntervalRef.current!);
              await handleMatch(data);
            }
          } catch {}
        }, 8000);
      } catch (err) {
        console.error('startSearching error:', err);
        if (active) setCallState('idle');
      }
    };

    const cleanupQueue = async () => {
      const pid = profileId || localStorage.getItem('whisper_profile_id');
      if (!pid || !queueIdRef.current) return;
      await fetch('/api/dequeue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ profileId: pid, queueId: queueIdRef.current }),
      }).catch(() => {});
      queueIdRef.current = null;
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
  }, [callState, alias, profileId, genderFilter, preferCountries, blockCountries]);
}
