import { useEffect, useRef } from 'react';
import { useCallStore } from '../store/useCallStore';
import { useAppStore } from '../store/useAppStore';
import { useFilterStore } from '../store/useFilterStore';
import { supabase } from '../lib/supabase';

export function useMatchmaking() {
  const { callState, setCallState, setRoomDetails, setPeerDetails } = useCallStore();
  const { alias, gender, countryCode } = useAppStore();
  const { genderFilter, preferCountries, blockCountries } = useFilterStore();
  const heartbeatIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const queueIdRef = useRef<string | null>(null);

  useEffect(() => {
    let active = true;
    let realtimeChannel: any = null;

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
      if (res.ok) {
        const p = await res.json();
        return { id: p.id };
      }
      return null;
    };

    const handleMatchPayload = async (row: any) => {
      if (!active) return;
      setCallState('connecting');

      const matchedPeerId = row.matched_peer_id;
      if (!matchedPeerId) return;

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

      setRoomDetails({
        id: row.id,
        url: row.room_url,
        token: row.room_token,
      });
    };

    const startSearching = async () => {
      try {
        const profile = await getOrCreateProfile();
        if (!profile || !active) return;

        // Subscribe BEFORE enqueuing — match may happen during enqueue response
        realtimeChannel = supabase
          .channel(`queue-${profile.id}`)
          .on(
            'postgres_changes',
            { event: 'UPDATE', schema: 'public', table: 'queue', filter: `profile_id=eq.${profile.id}` },
            async (payload) => {
              if (payload.new.status === 'matched') {
                await handleMatchPayload(payload.new);
              }
            }
          )
          .subscribe();

        const enqueueRes = await fetch('/api/enqueue', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            profileId: profile.id,
            genderFilter,
            preferCountries,
            avoidCountries: blockCountries,
          }),
        });

        if (!enqueueRes.ok) {
          const err = await enqueueRes.json();
          console.error('Queue error:', err);
          if (active) setCallState('idle');
          return;
        }

        const enqueueData = await enqueueRes.json();
        queueIdRef.current = enqueueData.queueId;

        // Check current status immediately — match may have happened during enqueue
        // and the Realtime event may have fired before subscribe() was fully active
        const { data: currentEntry } = await supabase
          .from('queue')
          .select('id, status, room_url, room_token, matched_peer_id')
          .eq('id', enqueueData.queueId)
          .maybeSingle();

        if (currentEntry?.status === 'matched' && active) {
          await handleMatchPayload(currentEntry);
          return;
        }

        // Still waiting — start heartbeat
        heartbeatIntervalRef.current = setInterval(() => {
          fetch('/api/heartbeat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ profileId: profile.id, queueId: queueIdRef.current }),
          }).catch(console.error);
        }, 10000);
      } catch (err) {
        console.error('startSearching error:', err);
        if (active) setCallState('idle');
      }
    };

    const cleanupQueue = async () => {
      if (!alias) return;
      const { data: profile } = await supabase
        .from('profiles')
        .select('id')
        .eq('alias', alias)
        .maybeSingle();
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
