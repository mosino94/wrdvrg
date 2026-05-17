import { useEffect, useRef } from 'react';
import { Room, RoomEvent, ConnectionState } from 'livekit-client';
import { useCallStore } from '../store/useCallStore';
import { supabase } from '../lib/supabase';
import { useAppStore } from '../store/useAppStore';

const CONNECT_TIMEOUT_MS = 30_000;

export function useCall() {
  const {
    callState, roomId, roomUrl, roomToken,
    setCallState, clearCall, setReconnecting, autoConnect,
    isMuted, setIsMuted, toggleMuteRequested, clearToggleMuteRequest,
    setPartnerMuted,
    callTime, callElapsedBase, setCallTime, setCallElapsedBase,
    peerId,
  } = useCallStore();
  const { alias } = useAppStore();

  const roomRef = useRef<Room | null>(null);
  const disconnectReasonRef = useRef<'skip' | 'end' | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const roomChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const myProfileIdRef = useRef<string | null>(null);

  // Resolve own profileId once from alias
  useEffect(() => {
    if (!alias) return;
    supabase.from('profiles').select('id').eq('alias', alias).maybeSingle().then(({ data }) => {
      if (data) myProfileIdRef.current = data.id;
    });
  }, [alias]);

  // ── Timer helpers ──────────────────────────────────────────────────────────

  const startTimer = (base: number) => {
    if (timerRef.current) clearInterval(timerRef.current);
    setCallTime(base);
    timerRef.current = setInterval(() => {
      setCallTime((t: number) => t + 1);
    }, 1000);
  };

  const pauseTimer = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    // callTime is current; save it as base
    setCallElapsedBase(useCallStore.getState().callTime);
  };

  const stopTimer = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    setCallTime(0);
    setCallElapsedBase(0);
  };

  // ── Mute toggle request ────────────────────────────────────────────────────

  useEffect(() => {
    if (!toggleMuteRequested) return;
    clearToggleMuteRequest();
    if (!roomRef.current) return;
    const newMuted = !isMuted;
    roomRef.current.localParticipant.setMicrophoneEnabled(!newMuted).catch(() => {});
    setIsMuted(newMuted);

    // Broadcast mute state to partner
    const rid = useCallStore.getState().roomId;
    const pid = myProfileIdRef.current;
    if (rid && pid) {
      supabase.channel(`room-broadcast-${rid}`).send({
        type: 'broadcast',
        event: 'mute_state',
        payload: { profileId: pid, muted: newMuted },
      }).catch(() => {});
    }
  }, [toggleMuteRequested]);

  // ── Main call lifecycle ────────────────────────────────────────────────────

  useEffect(() => {
    if ((callState === 'connecting' || callState === 'reconnecting') && roomUrl && roomToken) {
      if (roomRef.current) return;

      const room = new Room({
        audioCaptureDefaults: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      roomRef.current = room;

      room.on(RoomEvent.Connected, () => {
        setCallState('connected');
        setReconnecting(false);
        // Start/resume timer from saved base
        const base = useCallStore.getState().callElapsedBase;
        startTimer(base);

        // Subscribe to room-level broadcasts (call_ended, mute_state)
        const rid = useCallStore.getState().roomId;
        const pid = myProfileIdRef.current;
        if (rid) {
          roomChannelRef.current = supabase
            .channel(`room-broadcast-${rid}`)
            .on('broadcast', { event: 'call_ended' }, (msg: any) => {
              const { reason, endedBy } = msg.payload || {};
              if (endedBy === pid) return; // we triggered it ourselves
              // Partner ended the call — disconnect immediately
              roomRef.current?.disconnect();
              roomRef.current = null;
              stopTimer();
              clearCall();
              setPartnerMuted(false);
              if (autoConnect && reason === 'skip') {
                setTimeout(() => setCallState('searching'), 1500);
              }
            })
            .on('broadcast', { event: 'mute_state' }, (msg: any) => {
              if (msg.payload?.profileId !== pid) {
                setPartnerMuted(msg.payload?.muted ?? false);
              }
            })
            .subscribe();
        }
      });

      room.on(RoomEvent.Disconnected, () => {
        const reason = disconnectReasonRef.current;
        disconnectReasonRef.current = null;
        roomRef.current = null;
        roomChannelRef.current?.unsubscribe();
        roomChannelRef.current = null;
        stopTimer();
        clearCall();
        setPartnerMuted(false);

        if (reason === 'skip') {
          setCallState('searching');
        } else if (reason !== 'end' && autoConnect) {
          setTimeout(() => setCallState('searching'), 1500);
        }
      });

      room.on(RoomEvent.ConnectionStateChanged, (state: ConnectionState) => {
        if (state === ConnectionState.Reconnecting) {
          setCallState('reconnecting');
          setReconnecting(true);
          pauseTimer(); // Feature 4: pause on network drop
        } else if (state === ConnectionState.Connected) {
          setCallState('connected');
          setReconnecting(false);
          // Resume from paused base
          const base = useCallStore.getState().callElapsedBase;
          startTimer(base);
        }
      });

      // Backup: partner left LiveKit room
      room.on(RoomEvent.ParticipantDisconnected, () => {
        if (useCallStore.getState().callState !== 'idle') {
          roomRef.current?.disconnect();
          roomRef.current = null;
          stopTimer();
          clearCall();
          setPartnerMuted(false);
        }
      });

      let timeoutId: ReturnType<typeof setTimeout>;
      const timeoutPromise = new Promise<never>((_, reject) => {
        timeoutId = setTimeout(() => reject(new Error('connect timeout')), CONNECT_TIMEOUT_MS);
      });

      Promise.race([
        room.connect(roomUrl, roomToken).then(() =>
          room.localParticipant.setMicrophoneEnabled(true)
        ),
        timeoutPromise,
      ])
        .then(() => clearTimeout(timeoutId))
        .catch((err) => {
          clearTimeout(timeoutId);
          console.error('[useCall] connect error:', err.message);
          disconnectReasonRef.current = 'end';
          room.disconnect();
          roomRef.current = null;
          stopTimer();
          setCallState('idle');
          clearCall();
        });

    } else if ((callState === 'idle' || callState === 'searching') && roomRef.current) {
      if (!disconnectReasonRef.current) {
        disconnectReasonRef.current = callState === 'searching' ? 'skip' : 'end';
      }
      const r = roomRef.current;
      roomRef.current = null;
      roomChannelRef.current?.unsubscribe();
      roomChannelRef.current = null;
      stopTimer();
      r.disconnect();
    }
  }, [callState, roomUrl, roomToken]);

  // Cleanup on unmount
  useEffect(() => () => {
    if (timerRef.current) clearInterval(timerRef.current);
    roomChannelRef.current?.unsubscribe();
  }, []);
}
