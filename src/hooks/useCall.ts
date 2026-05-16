import { useEffect, useRef, useState } from 'react';
import { Room, RoomEvent, ConnectionState } from 'livekit-client';
import { useCallStore } from '../store/useCallStore';

export function useCall() {
  const { callState, roomUrl, roomToken, setCallState, clearCall, setReconnecting, autoConnect } = useCallStore();
  const roomRef = useRef<Room | null>(null);
  const [isMuted, setIsMuted] = useState(false);

  useEffect(() => {
    if ((callState === 'connecting' || callState === 'reconnecting') && roomUrl && roomToken) {
      if (roomRef.current) return; // already connecting

      const room = new Room({
        audioCaptureDefaults: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      roomRef.current = room;

      room.on(RoomEvent.Connected, () => {
        setCallState('connected');
        setReconnecting(false);
      });

      room.on(RoomEvent.Disconnected, () => {
        roomRef.current = null;
        clearCall();
        if (autoConnect) setTimeout(() => setCallState('searching'), 1500);
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

      room.connect(roomUrl, roomToken)
        .then(() => room.localParticipant.setMicrophoneEnabled(true))
        .catch((err) => {
          console.error('[useCall] connect error:', err);
          roomRef.current = null;
          setCallState('idle');
          clearCall();
        });
    } else if (callState === 'idle' && roomRef.current) {
      roomRef.current.disconnect();
      roomRef.current = null;
    }
  }, [callState, roomUrl, roomToken]);

  const endCall = () => {
    if (roomRef.current) {
      roomRef.current.disconnect();
      roomRef.current = null;
    }
    setCallState('idle');
    clearCall();
  };

  const toggleMute = () => {
    if (roomRef.current) {
      const enabled = !isMuted;
      roomRef.current.localParticipant.setMicrophoneEnabled(enabled);
      setIsMuted(!enabled);
    }
  };

  return { endCall, toggleMute, isMuted };
}
