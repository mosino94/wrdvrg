import { useEffect, useState, useRef } from 'react';
import DailyIframe, { DailyCall } from '@daily-co/daily-js';
import { useCallStore } from '../store/useCallStore';

export function useCall() {
  const { callState, roomUrl, roomToken, setCallState, clearCall, isReconnecting, setReconnecting, setAutoConnect, autoConnect } = useCallStore();
  const [callObject, setCallObject] = useState<DailyCall | null>(null);
  const reconnectTimerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if ((callState === 'connecting' || callState === 'reconnecting') && roomUrl && roomToken) {
      if (callObject) return; // already initializing/initialized

      const initCall = async () => {
        const newCallObject = DailyIframe.createCallObject({
          audioSource: true,
          videoSource: false,
        });

        // Event handlers
        newCallObject.on('joined-meeting', () => {
          setCallState('connected');
          setReconnecting(false);
          // Persist to local storage per specs
        });

        newCallObject.on('participant-left', (e) => {
          // If we are reconnecting and they skip, or they drop
          // Spec: Handle partner skip
          if (e.participant.local) return;
          
          setCallState('idle');
          clearCall();
          if (newCallObject) {
            newCallObject.leave().then(() => newCallObject.destroy());
            setCallObject(null);
          }

          if (autoConnect) {
            setTimeout(() => setCallState('searching'), 1500);
          }
        });

        newCallObject.on('network-connection', (ev: any) => {
          if (ev.event === 'interrupted') {
             // network short disconnect
             setCallState('reconnecting');
             setReconnecting(true);
          }
          if (ev.event === 'connected') {
             setCallState('connected');
             setReconnecting(false);
          }
        });

        await newCallObject.join({ url: roomUrl, token: roomToken });
        setCallObject(newCallObject);
      };

      initCall();
    } else if (callState === 'idle' && callObject) {
      // Clean up
      callObject.leave().then(() => callObject.destroy());
      setCallObject(null);
    }

    return () => {
      // Cleanup on unmount handled gracefully
      // we only destroy if unmounting entirely and leaving app, 
      // otherwise handled by state changes
    };
  }, [callState, roomUrl, roomToken, callObject, setCallState, setReconnecting, clearCall, autoConnect]);

  const endCall = () => {
    setCallState('idle');
    clearCall();
    if (callObject) {
      callObject.leave().then(() => callObject.destroy());
      setCallObject(null);
    }
  };

  return { callObject, endCall };
}
