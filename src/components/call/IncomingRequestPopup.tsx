import React, { useEffect, useState } from 'react';
import { UserPlus, X, Check } from 'lucide-react';
import { supabase } from '@/src/lib/supabase';
import { useAppStore } from '@/src/store/useAppStore';

interface FriendRequest {
  id: string;
  sender_id: string;
  sender_alias: string;
  sender_country: string | null;
  sender_gender: string | null;
}

export function IncomingRequestPopup() {
  const { profileId } = useAppStore();
  const [requests, setRequests] = useState<FriendRequest[]>([]);

  useEffect(() => {
    const pid = profileId || localStorage.getItem('whisper_profile_id');
    if (!pid) return;

    const channel = supabase
      .channel(`friend-req-${pid}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'friend_requests',
          filter: `receiver_id=eq.${pid}`,
        },
        (payload) => {
          const req = payload.new as FriendRequest;
          setRequests((prev) => [...prev, req]);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [profileId]);

  const respond = async (requestId: string, response: 'accepted' | 'declined') => {
    setRequests((prev) => prev.filter((r) => r.id !== requestId));
    await fetch('/api/friend-request/respond', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ requestId, response, responderId: profileId }),
    }).catch(() => {});
  };

  if (requests.length === 0) return null;

  return (
    <div className="fixed bottom-24 right-4 z-50 flex flex-col gap-2">
      {requests.map((req) => (
        <div
          key={req.id}
          className="bg-zinc-900 border border-zinc-700 rounded-2xl p-4 shadow-2xl w-72 animate-fadeUp"
        >
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-orange-600 to-amber-400 flex items-center justify-center text-white font-bold">
              {(req.sender_alias || 'A').charAt(0).toUpperCase()}
            </div>
            <div>
              <p className="font-semibold text-zinc-100 text-sm">{req.sender_alias || 'Anonymous'}</p>
              <p className="text-xs text-zinc-500 flex items-center gap-1">
                <UserPlus size={11} /> Friend request
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => respond(req.id, 'accepted')}
              className="flex-1 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-sm font-medium flex items-center justify-center gap-1.5 transition-colors"
            >
              <Check size={14} /> Accept
            </button>
            <button
              onClick={() => respond(req.id, 'declined')}
              className="flex-1 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-xl text-sm font-medium flex items-center justify-center gap-1.5 transition-colors"
            >
              <X size={14} /> Decline
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
