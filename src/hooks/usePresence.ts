import { useState, useEffect } from 'react';

export function useOnlineCount() {
  const [onlineCount, setOnlineCount] = useState(200);
  const [displayedCount, setDisplayedCount] = useState(200);

  const generateFakeCount = (): number => {
    const now = new Date();
    const hour = now.getHours();
    const minute = now.getMinutes();
    const peakBoost = (hour >= 18 && hour <= 23) ? 120 : 0;
    const morningDip = (hour >= 3 && hour <= 7) ? -80 : 0;
    const baseCount = 280 + (hour * 8) + peakBoost + morningDip;
    const wave = Math.sin((minute / 60) * Math.PI * 2) * 40;
    const jitter = Math.floor(Math.random() * 30) - 15;
    return Math.min(Math.max(Math.floor(baseCount + wave + jitter), 50), 499);
  };

  useEffect(() => {
    let active = true;

    const fetchCount = async () => {
      try {
        const res = await fetch('/api/online-count');
        if (res.ok) {
          const { count } = await res.json();
          if (active) setOnlineCount(Math.max(count, generateFakeCount()));
        } else {
          if (active) setOnlineCount(generateFakeCount());
        }
      } catch {
        if (active) setOnlineCount(generateFakeCount());
      }
    };

    fetchCount();
    const interval = setInterval(fetchCount, 30000);
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
