import { useState, useEffect } from 'react';

export function useOnlineCount() {
  const [onlineCount, setOnlineCount] = useState(200);
  const [displayedCount, setDisplayedCount] = useState(200);

  // Fake generation fallback for when edge function is missing
  const generateFakeCount = (realCount: number): number => {
    const now = new Date();
    const hour = now.getHours();
    const minute = now.getMinutes();

    const peakBoost = (hour >= 18 && hour <= 23) ? 120 : 0;
    const morningDip = (hour >= 3 && hour <= 7) ? -80 : 0;
    const baseCount = 280 + (hour * 8) + peakBoost + morningDip;
    
    // Smooth wave variation over minutes
    const wave = Math.sin((minute / 60) * Math.PI * 2) * 40;
    
    // Small random jitter
    const jitter = Math.floor(Math.random() * 30) - 15;
    
    const fake = Math.floor(baseCount + wave + jitter);
    const final = Math.max(realCount, fake);
    return Math.min(final, 499);
  };

  useEffect(() => {
    let active = true;

    const fetchCount = async () => {
      try {
        const res = await fetch(import.meta.env.VITE_SUPABASE_URL + '/functions/v1/online-count');
        if (res.ok) {
          const { count } = await res.json();
          if (active) setOnlineCount(count);
        } else {
          // Fallback if edge function not deployed
          if (active) setOnlineCount(generateFakeCount(0));
        }
      } catch (err) {
        if (active) setOnlineCount(generateFakeCount(0));
      }
    };

    fetchCount();
    const interval = setInterval(fetchCount, 4000);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, []);

  // Smooth number transition
  useEffect(() => {
    const diff = onlineCount - displayedCount;
    const step = Math.ceil(Math.abs(diff) / 8);
    
    if (diff !== 0) {
      const timer = setTimeout(() => {
        setDisplayedCount(c => c + (diff > 0 ? step : -step));
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [onlineCount, displayedCount]);

  return displayedCount;
}
