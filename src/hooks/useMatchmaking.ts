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

  useEffect(() => {
    let active = true;
    let realtimeChannel: any = null;

    const startSearching = async () => {
      try {
        const { data: profile } = await supabase.from('profiles').select('id').eq('alias', alias).single();
        if (!profile) return; // Wait until profile is ready

        // 1. Insert into queue
        const { error } = await supabase.from('queue').insert({
          profile_id: profile.id,
          gender_filter: genderFilter,
          prefer_countries: preferCountries,
          avoid_countries: blockCountries,
          status: 'waiting'
        });

        if (error) {
          console.error('Queue error:', error);
          if (active) setCallState('idle');
          return;
        }

        // 2. Start heartbeat (every 10s) to keep queue active
        heartbeatIntervalRef.current = setInterval(() => {
          supabase.from('queue')
            .update({ last_heartbeat: new Date().toISOString() })
            .eq('profile_id', profile.id)
            .eq('status', 'waiting')
            .then();
        }, 10000);

        // 3. Subscribe to queue changes
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
              if (payload.new.status === 'matched') {
                if (active) {
                  setCallState('connecting');

                  // Extract peer details
                  const { data: peerData } = await supabase.from('profiles')
                    .select('alias, country_code, gender')
                    .eq('id', payload.new.last_peer_id)
                    .single();

                  setPeerDetails({
                    id: payload.new.last_peer_id,
                    alias: peerData?.alias || 'Anonymous',
                    country: peerData?.country_code || null,
                    gender: peerData?.gender || null
                  });

                  // We now have room info assigned by matching worker
                  setRoomDetails({
                    id: payload.new.id, // using queue id or ideally a room id from real room
                    url: payload.new.room_url,
                    token: payload.new.room_token
                  });
                  
                  // In a real flow, useCall hook handles the Daily.co join and moves to 'connected'
                }
              }
            }
          )
          .subscribe();
      } catch (err) {
        if (active) setCallState('idle');
      }
    };

    const cleanupQueue = async () => {
      const { data: profile } = await supabase.from('profiles').select('id').eq('alias', alias).single();
      if (profile) {
        await supabase.from('queue').delete().eq('profile_id', profile.id);
      }
    };

    if (callState === 'searching') {
      startSearching();
    } else {
      // Cleanup if leaving searching state
      if (heartbeatIntervalRef.current) {
        clearInterval(heartbeatIntervalRef.current);
      }
      if (realtimeChannel) {
        supabase.removeChannel(realtimeChannel);
      }
      // If we went from searching -> idle (user cancelled)
      // we must remove ourselves from queue.
      // Do this async.
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
