import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

export function useOnlineCount() {
  // null = still loading, number = loaded (may be 0)
  const [count, setCount] = useState<number | null>(null);

  useEffect(() => {
    let active = true;

    const fetchCount = async () => {
      // Try API first
      try {
        const res = await fetch('/api/online-count');
        if (res.ok && (res.headers.get('content-type') || '').includes('application/json')) {
          const data = await res.json();
          if (active && typeof data.count === 'number') {
            setCount(data.count);
            return;
          }
        }
      } catch {}

      // Fallback: query Supabase directly
      try {
        const since = new Date(Date.now() - 60_000).toISOString();
        const { count: c } = await supabase
          .from('presence')
          .select('*', { count: 'exact', head: true })
          .neq('status', 'offline')
          .gte('last_heartbeat', since);
        if (active && c !== null) setCount(c);
      } catch {}
    };

    fetchCount();
    const interval = setInterval(fetchCount, 15_000);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, []);

  return count;
}
