import { useState, useEffect, useRef } from 'react';
import { useCallStore } from '../store/useCallStore';

export function useReconnect() {
  const { callState, setCallState, clearCall, autoConnect } = useCallStore();
  const [reconnectSeconds, setReconnectSeconds] = useState(30);
  const reconnectIntervalRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (callState === 'reconnecting') {
      setReconnectSeconds(30);
      reconnectIntervalRef.current = setInterval(() => {
        setReconnectSeconds(prev => {
          if (prev <= 1) {
            // timeout reached
            setCallState('idle');
            clearCall();
            if (autoConnect) {
               setTimeout(() => setCallState('searching'), 2000);
            }
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    } else {
      if (reconnectIntervalRef.current) {
        clearInterval(reconnectIntervalRef.current);
      }
    }

    return () => {
      if (reconnectIntervalRef.current) {
        clearInterval(reconnectIntervalRef.current);
      }
    };
  }, [callState, setCallState, autoConnect, clearCall]);

  return { reconnectSeconds };
}
