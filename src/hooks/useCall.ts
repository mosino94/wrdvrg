import { useEffect, useRef, useState } from 'react';
import { Room, RoomEvent, ConnectionState } from 'livekit-client';
import { useCallStore } from '../store/useCallStore';
import { supabase } from '../lib/supabase';
import { saveCallSession, updateCallElapsed, markDisconnected, getCallSession, clearCallSession } from '../lib/callSession';

export function useCall() {
  const {
    callState, roomId, roomUrl, roomToken, peerId,
    peerAlias, peerCountry, peerGender, isMuted,
    setCallState, clearCall, setMuted, setPeerMuted,
    setCallDurationBase, callDurationBase,
  } = useCallStore();

  const roomRef = useRef<Room | null>(null);
  const graceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const timerPersistRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const callStartRef = useRef<number | null>(null);
  const broadcastChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const [reconnectSeconds, setReconnectSeconds] = useState(30);

  // Supabase broadcast for end-call and mute sync
  useEffect(() => {
    if ((callState !== 'connected' && callState !== 'reconnecting') || !roomId) return;

    const channel = supabase.channel(`room-broadcast-${roomId}`, {
      config: { broadcast: { self: false } },
    });

    channel
      .on('broadcast', { event: 'call_ended' }, () => {
        doEndCall(false);
      })
      .on('broadcast', { event: 'mute_state' }, (msg: any) => {
        setPeerMuted(!!msg.payload?.muted);
      })
      .subscribe();

    broadcastChannelRef.current = channel;
    return () => {
      supabase.removeChannel(channel);
      broadcastChannelRef.current = null;
    };
  }, [callState, roomId]);

  // LiveKit room lifecycle
  useEffect(() => {
    if (callState === 'connecting' && roomUrl && roomToken && !roomRef.current) {
      initRoom();
    } else if (callState === 'idle' && roomRef.current) {
      destroyRoom();
    }
  }, [callState, roomUrl, roomToken]);

  const initRoom = async () => {
    const room = new Room({ adaptiveStream: true, dynacast: true });
    roomRef.current = room;

    room.on(RoomEvent.Connected, async () => {
      try {
        await room.localParticipant.setMicrophoneEnabled(true);
      } catch (err) {
        console.warn('Mic enable failed:', err);
      }

      const session = getCallSession();
      const base = session?.elapsedSeconds ?? callDurationBase ?? 0;
      callStartRef.current = Date.now() - base * 1000;
      setCallDurationBase(base);
      setCallState('connected');

      if (roomId) {
        saveCallSession({
          roomId: roomId!,
          roomUrl: roomUrl!,
          roomToken: roomToken!,
          peerId: peerId!,
          peerAlias: peerAlias!,
          peerCountry,
          peerGender,
          elapsedSeconds: base,
        });
      }

      timerPersistRef.current = setInterval(() => {
        if (callStartRef.current !== null) {
          const elapsed = Math.floor((Date.now() - callStartRef.current) / 1000);
          updateCallElapsed(elapsed);
          setCallDurationBase(elapsed);
        }
      }, 5000);
    });

    room.on(RoomEvent.Disconnected, () => {
      graceTimerRef.current = setTimeout(() => {
        if (roomRef.current?.state === ConnectionState.Disconnected) {
          if (callStartRef.current !== null) {
            const elapsed = Math.floor((Date.now() - callStartRef.current) / 1000);
            setCallDurationBase(elapsed);
            updateCallElapsed(elapsed);
          }
          markDisconnected();
          setCallState('reconnecting');
          startReconnectCountdown();
        }
      }, 3000);
    });

    room.on(RoomEvent.Reconnected, () => {
      clearGrace();
      clearReconnectInterval();
      setReconnectSeconds(30);
      const session = getCallSession();
      const base = session?.elapsedSeconds ?? callDurationBase;
      callStartRef.current = Date.now() - base * 1000;
      setCallState('connected');
    });

    room.on(RoomEvent.ParticipantDisconnected, () => {
      doEndCall(false);
    });

    const livekitUrl = import.meta.env.VITE_LIVEKIT_URL || '';
    try {
      await room.connect(livekitUrl, roomToken!);
    } catch (err) {
      console.error('LiveKit connect error:', err);
      destroyRoom();
      clearCallSession();
      clearCall();
    }
  };

  const startReconnectCountdown = () => {
    setReconnectSeconds(30);
    reconnectIntervalRef.current = setInterval(() => {
      setReconnectSeconds((prev) => {
        if (prev <= 1) {
          clearReconnectInterval();
          doEndCall(false);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  const clearGrace = () => {
    if (graceTimerRef.current) { clearTimeout(graceTimerRef.current); graceTimerRef.current = null; }
  };

  const clearReconnectInterval = () => {
    if (reconnectIntervalRef.current) { clearInterval(reconnectIntervalRef.current); reconnectIntervalRef.current = null; }
  };

  const destroyRoom = () => {
    if (timerPersistRef.current) { clearInterval(timerPersistRef.current); timerPersistRef.current = null; }
    clearGrace();
    clearReconnectInterval();
    if (roomRef.current) {
      roomRef.current.disconnect();
      roomRef.current = null;
    }
    callStartRef.current = null;
  };

  const doEndCall = (broadcast: boolean) => {
    if (broadcast && broadcastChannelRef.current) {
      broadcastChannelRef.current
        .send({ type: 'broadcast', event: 'call_ended', payload: {} })
        .catch(() => {});
    }
    destroyRoom();
    clearCallSession();
    clearCall();
  };

  const endCall = () => doEndCall(true);

  const toggleMute = async () => {
    if (!roomRef.current) return;
    const newMuted = !isMuted;
    try {
      await roomRef.current.localParticipant.setMicrophoneEnabled(!newMuted);
    } catch {}
    setMuted(newMuted);
    if (broadcastChannelRef.current) {
      broadcastChannelRef.current
        .send({ type: 'broadcast', event: 'mute_state', payload: { muted: newMuted } })
        .catch(() => {});
    }
  };

  return { endCall, toggleMute, reconnectSeconds };
}
