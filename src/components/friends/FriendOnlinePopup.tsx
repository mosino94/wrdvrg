import React, { useEffect, useState } from 'react';
import { useAppStore } from '../../store/useAppStore';
import { supabase } from '../../lib/supabase';
import { Flag } from '../ui/Flag';
import { useSound } from '../../hooks/useSound';

interface PopupData {
  id: string; // friend's profile_id
  alias: string;
  country: string | null;
}

export function FriendOnlinePopup() {
  const [popups, setPopups] = useState<PopupData[]>([]);
  const { alias } = useAppStore();
  const { playFriendOnline } = useSound();

  // Simple array to keep track of already online friends (baseline)
  // or friends we recently showed a popup for
  const [knownOnlineFriends] = useState(new Set<string>());

  useEffect(() => {
    let active = true;

    const setupPresence = async () => {
      // 1. Get my profile id
      const { data: myProfile } = await supabase.from('profiles').select('id').eq('alias', alias).single();
      if (!myProfile) return;

      // 2. Fetch baseline of already online friends
      const { data: friendsData } = await supabase
        .from('friends')
        .select(`friend_id, presence!presence_profile_id_fkey(status)`)
        .eq('owner_id', myProfile.id);

      if (friendsData) {
        friendsData.forEach((f: any) => {
          if (f.presence?.status === 'online' || f.presence?.status === 'in_call' || f.presence?.status === 'searching') {
            knownOnlineFriends.add(f.friend_id);
          }
        });
      }

      // 3. Subscribe to presence changes
      const channel = supabase.channel('friend-presence-popups')
        .on(
          'postgres_changes',
          { event: 'UPDATE', schema: 'public', table: 'presence' },
          async (payload) => {
            const friendId = payload.new.profile_id;
            const newStatus = payload.new.status;
            const oldStatus = payload.old.status;

            if (newStatus === 'online' && oldStatus !== 'online') {
              // Ignore if already baseline or recently processed
              if (!knownOnlineFriends.has(friendId)) {
                
                // Fetch friend details for popup
                const { data: friendData } = await supabase
                  .from('profiles')
                  .select('alias, country_code')
                  .eq('id', friendId)
                  .single();

                if (friendData && active) {
                  const newPopup = {
                    id: friendId + Date.now().toString(), // unique id for multiple stackings
                    alias: friendData.alias,
                    country: friendData.country_code
                  };
                  
                  setPopups(prev => {
                    const next = [...prev, newPopup];
                    if (next.length > 3) return next.slice(next.length - 3); // Stack up to 3
                    return next;
                  });
                  playFriendOnline();

                  // Auto-dismiss after exactly 2.5s
                  setTimeout(() => {
                    if (active) {
                      setPopups(prev => prev.filter(p => p.id !== newPopup.id));
                    }
                  }, 2500);
                }

                knownOnlineFriends.add(friendId);
              }
            } else if (newStatus === 'offline') {
              knownOnlineFriends.delete(friendId);
            }
          }
        )
        .subscribe();

      return channel;
    };

    let channelPromise: Promise<any> | null = null;
    
    // 5-second grace period on load logic before setting up subscription
    // As per spec: "On app load: 5s grace period — no friend popups at all"
    const timer = setTimeout(() => {
      if (active && alias) {
        channelPromise = setupPresence();
      }
    }, 5000);

    return () => {
      active = false;
      clearTimeout(timer);
      if (channelPromise) {
        channelPromise.then(ch => ch && supabase.removeChannel(ch));
      }
    };
  }, [alias, knownOnlineFriends, playFriendOnline]);

  return (
    <div className="fixed top-4 right-4 z-[9999] flex flex-col gap-2">
      {popups.map(popup => (
        <div 
          key={popup.id} 
          className="flex items-center gap-3 p-3 w-64 bg-emerald-950/20 border border-emerald-900/50 rounded-xl shadow-2xl animate-slideDown pointer-events-auto"
        >
          <div className="w-10 h-10 rounded-full border border-emerald-900/50 flex items-center justify-center overflow-hidden bg-zinc-900 text-sm">
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
