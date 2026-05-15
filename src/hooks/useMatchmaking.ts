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

    const startSearching = async () => {
      try {
        const { data: profile } = await supabase.from('profiles').select('id').eq('alias', alias).single();
        if (!profile) return;

        const enqueueRes = await fetch('/api/enqueue', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            profileId: profile.id,
            genderFilter,
            preferCountries,
            avoidCountries: blockCountries
          })
        });

        if (!enqueueRes.ok) {
          const err = await enqueueRes.json();
          console.error('Queue error:', err);
          if (active) setCallState('idle');
          return;
        }

        const enqueueData = await enqueueRes.json();
        queueIdRef.current = enqueueData.queueId;

        // Start heartbeat
        heartbeatIntervalRef.current = setInterval(() => {
          fetch('/api/heartbeat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ profileId: profile.id, queueId: queueIdRef.current })
          }).catch(console.error);
        }, 10000);

        // Subscribe to our queue row for match notification
        realtimeChannel = supabase.channel(`queue-${profile.id}`)
          .on(
            'postgres_changes',
            {
              event: 'UPDATE',
              schema: 'public',
              table: 'queue',
              filter: `profile_id=eq.${profile.id}`
            },
            async (payload) => {
              if (payload.new.status === 'matched' && active) {
                setCallState('connecting');

                // FIX: use matched_peer_id (set by server) to get correct peer info
                const matchedPeerId = payload.new.matched_peer_id;
                if (!matchedPeerId) {
                  console.error('matched_peer_id is missing from queue row');
                  return;
                }

                const { data: peerData } = await supabase.from('profiles')
                  .select('id, alias, country_code, gender')
                  .eq('id', matchedPeerId)
                  .single();

                setPeerDetails({
                  id: matchedPeerId,
                  alias: peerData?.alias || 'Anonymous',
                  country: peerData?.country_code || null,
                  gender: peerData?.gender || null
                });

                setRoomDetails({
                  id: payload.new.id,
                  url: payload.new.room_url,
                  token: payload.new.room_token
                });
              }
            }
          )
          .subscribe((status) => {
            if (status === 'SUBSCRIBED') {
              console.log('Matchmaking realtime subscribed for', profile.id);
            }
          });
      } catch (err) {
        console.error('startSearching error:', err);
        if (active) setCallState('idle');
      }
    };

    const cleanupQueue = async () => {
      if (!alias) return;
      const { data: profile } = await supabase.from('profiles').select('id').eq('alias', alias).single();
      if (profile) {
        await fetch('/api/dequeue', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ profileId: profile.id, queueId: queueIdRef.current })
        }).catch(() => {});
        queueIdRef.current = null;
      }
    };

    if (callState === 'searching') {
      startSearching();
    } else {
      if (heartbeatIntervalRef.current) {
        clearInterval(heartbeatIntervalRef.current);
      }
      if (realtimeChannel) {
        supabase.removeChannel(realtimeChannel);
      }
      if (callState === 'idle') {
        cleanupQueue();
      }
    }

    return () => {
      active = false;
      if (heartbeatIntervalRef.current) clearInterval(heartbeatIntervalRef.current);
      if (realtimeChannel) supabase.removeChannel(realtimeChannel);
    };
  }, [callState, alias, genderFilter, preferCountries, blockCountries, setCallState, setRoomDetails, setPeerDetails]);
}
