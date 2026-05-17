import { useEffect, useRef } from 'react';
import { Room, RoomEvent, ConnectionState } from 'livekit-client';
import { useCallStore } from '../store/useCallStore';

const CONNECT_TIMEOUT_MS = 30_000;

export function useCall() {
  const {
    callState, roomUrl, roomToken,
    setCallState, clearCall, setReconnecting, autoConnect,
    isMuted, setIsMuted, toggleMuteRequested, clearToggleMuteRequest,
  } = useCallStore();

  const roomRef = useRef<Room | null>(null);
  // 'skip' → restart search after disconnect; 'end' → stay idle; null → auto
  const disconnectReasonRef = useRef<'skip' | 'end' | null>(null);

  // Handle mute toggle requests dispatched from CallCard via store
  useEffect(() => {
    if (!toggleMuteRequested) return;
    clearToggleMuteRequest();
    if (!roomRef.current) return;
    const newMuted = !isMuted;
    roomRef.current.localParticipant.setMicrophoneEnabled(!newMuted).catch(() => {});
    setIsMuted(newMuted);
  }, [toggleMuteRequested]);

  useEffect(() => {
    if ((callState === 'connecting' || callState === 'reconnecting') && roomUrl && roomToken) {
      // For 'reconnecting', LiveKit handles it internally — don't create a new Room
      if (roomRef.current) return;

      const room = new Room({
        audioCaptureDefaults: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      roomRef.current = room;

      room.on(RoomEvent.Connected, () => {
        setCallState('connected');
        setReconnecting(false);
      });

      room.on(RoomEvent.Disconnected, () => {
        const reason = disconnectReasonRef.current;
        disconnectReasonRef.current = null;
        roomRef.current = null;
        clearCall(); // resets callState → 'idle'

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
        } else if (state === ConnectionState.Connected) {
          setCallState('connected');
          setReconnecting(false);
        }
      });

      // Timeout prevents permanently stuck "connecting" state
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
          setCallState('idle');
          clearCall();
        });

    } else if ((callState === 'idle' || callState === 'searching') && roomRef.current) {
      // Disconnect existing room on End Call ('idle') or Skip ('searching')
      if (!disconnectReasonRef.current) {
        disconnectReasonRef.current = callState === 'searching' ? 'skip' : 'end';
      }
      const r = roomRef.current;
      roomRef.current = null;
      r.disconnect();
    }
  }, [callState, roomUrl, roomToken]);
}
