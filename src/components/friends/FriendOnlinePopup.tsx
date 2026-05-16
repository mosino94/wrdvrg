import React, { useEffect, useRef, useState } from 'react';
import { useAppStore } from '../../store/useAppStore';
import { supabase } from '../../lib/supabase';
import { Flag } from '../ui/Flag';
import { useSound } from '../../hooks/useSound';

interface PopupData {
  key: string;
  alias: string;
  country: string | null;
}

export function FriendOnlinePopup() {
  const [popups, setPopups] = useState<PopupData[]>([]);
  const { alias } = useAppStore();
  const { playFriendOnline } = useSound();
  const friendIds = useRef(new Set<string>());
  const knownOnline = useRef(new Set<string>());

  useEffect(() => {
    let active = true;
    let channel: any = null;

    const setup = async () => {
      const { data: myProfile } = await supabase
        .from('profiles').select('id').eq('alias', alias).maybeSingle();
      if (!myProfile || !active) return;

      // Load friends via API (no RLS issues)
      const res = await fetch(`/api/friends/${myProfile.id}`);
      if (!res.ok || !active) return;
      const friends = await res.json();

      // Build friend ID set and mark already-online as known (no popup on load)
      friends.forEach((f: any) => {
        friendIds.current.add(f.id);
        if (f.status !== 'offline') knownOnline.current.add(f.id);
      });

      // Subscribe to presence changes — only react to friends
      channel = supabase.channel('friend-presence')
        .on('postgres_changes',
          { event: 'UPDATE', schema: 'public', table: 'presence' },
          async (payload) => {
            const friendId = payload.new.profile_id;
            const newStatus = payload.new.status;

            // ONLY friends — ignore strangers
            if (!friendIds.current.has(friendId)) return;

            if (newStatus === 'online' && !knownOnline.current.has(friendId)) {
              knownOnline.current.add(friendId);

              const { data: p } = await supabase
                .from('profiles').select('alias, country_code')
                .eq('id', friendId).maybeSingle();

              if (p && active) {
                const popup: PopupData = { key: friendId + Date.now(), alias: p.alias, country: p.country_code };
                setPopups(prev => [...prev.slice(-2), popup]);
                playFriendOnline();
                setTimeout(() => {
                  if (active) setPopups(prev => prev.filter(x => x.key !== popup.key));
                }, 2500);
              }
            } else if (newStatus === 'offline') {
              knownOnline.current.delete(friendId);
            }
          }
        ).subscribe();
    };

    // 5s grace period on load
    const timer = setTimeout(() => { if (active && alias) setup(); }, 5000);

    return () => {
      active = false;
      clearTimeout(timer);
      if (channel) supabase.removeChannel(channel);
    };
  }, [alias, playFriendOnline]);

  return (
    <div className="fixed top-4 right-4 z-[9999] flex flex-col gap-2">
      {popups.map(popup => (
        <div key={popup.key} className="flex items-center gap-3 p-3 w-64 bg-emerald-950/20 border border-emerald-900/50 rounded-xl shadow-2xl animate-slideDown">
          <div className="w-10 h-10 rounded-full border border-emerald-900/50 flex items-center justify-center overflow-hidden bg-zinc-900">
            {popup.country ? <Flag code={popup.country} size={30} /> : <span className="text-white text-xs">?</span>}
          </div>
          <div className="flex flex-col">
            <span className="font-bold text-zinc-100 text-sm truncate">{popup.alias} is online</span>
            <span className="text-emerald-500 text-xs font-medium flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" /> Just came online
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}
