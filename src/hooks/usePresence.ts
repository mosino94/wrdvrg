import { useState, useEffect } from 'react';

export function useOnlineCount() {
  const [count, setCount] = useState(247);

  useEffect(() => {
    let active = true;

    const fetchCount = async () => {
      try {
        const res = await fetch('/api/online-count');
        if (res.ok) {
          const data = await res.json();
          if (active) setCount(data.count || 0);
        }
      } catch {
        // keep last count
      }
    };

    fetchCount();
    const interval = setInterval(fetchCount, 15000);
    return () => { active = false; clearInterval(interval); };
  }, []);

  return count;
}
