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
        const resolvedProfileId = profileId || (() => {
          const pid = localStorage.getItem('whisper_profile_id');
          return pid;
        })();

        if (!resolvedProfileId && !alias) { if (active) setCallState('idle'); return; }

        let pid = resolvedProfileId;
        if (!pid) {
          const { data: profile } = await supabase.from('profiles').select('id').eq('alias', alias!).single();
          if (!profile) { if (active) setCallState('idle'); return; }
          pid = profile.id;
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

        // If already matched from enqueue response
        if (enqueueData.status === 'matched' && active) {
          if (heartbeatIntervalRef.current) clearInterval(heartbeatIntervalRef.current);
          await handleMatch(enqueueData);
          return;
        }

        // Heartbeat polls every 8s — also checks match status as fallback
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
      const resolvedProfileId = profileId || localStorage.getItem('whisper_profile_id');
      if (!resolvedProfileId && !alias) return;
      let pid = resolvedProfileId;
      if (!pid) {
        const { data: profile } = await supabase.from('profiles').select('id').eq('alias', alias!).single();
        pid = profile?.id;
      }
      if (pid && queueIdRef.current) {
        await fetch('/api/dequeue', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ profileId: pid, queueId: queueIdRef.current }),
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
  }, [callState, alias, profileId, genderFilter, preferCountries, blockCountries]);
}
