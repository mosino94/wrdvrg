import React, { useEffect, useState } from 'react';
import { useAppStore } from '@/src/store/useAppStore';
import { Flag } from '@/src/components/ui/Flag';
import { StatusDot } from '@/src/components/ui/StatusDot';
import { X, Phone, Edit2, Check } from 'lucide-react';
import { supabase } from '@/src/lib/supabase';

interface Friend {
  id: string;
  alias: string;
  nickname: string | null;
  country: string | null;
  gender: string | null;
  status: 'online' | 'offline' | 'in_call' | 'searching';
}

export function Friends() {
  const { alias } = useAppStore();
  const [friends, setFriends] = useState<Friend[]>([]);
  const [myProfileId, setMyProfileId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');

  useEffect(() => {
    let active = true;

    const loadFriends = async () => {
      try {
        const { data: myProfile } = await supabase
          .from('profiles')
          .select('id')
          .eq('alias', alias)
          .maybeSingle();
        if (!myProfile) { if (active) setLoading(false); return; }

        setMyProfileId(myProfile.id);

        const res = await fetch(`/api/friends/${myProfile.id}`);
        if (res.ok && active) {
          const data = await res.json();
          setFriends(data);
        }
      } catch (err) {
        console.error('Failed to load friends', err);
      } finally {
        if (active) setLoading(false);
      }
    };

    if (alias) loadFriends();
    return () => { active = false; };
  }, [alias]);

  const saveNickname = async (friendId: string) => {
    if (!myProfileId) return;
    await fetch(`/api/friends/${myProfileId}/nickname`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ friendId, nickname: editValue || null }),
    });
    setFriends(friends.map(f => f.id === friendId ? { ...f, nickname: editValue || null } : f));
    setEditingId(null);
  };

  const removeFriend = async (friendId: string) => {
    if (!myProfileId) return;
    await fetch(`/api/friends/${myProfileId}/remove`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ friendId }),
    });
    setFriends(friends.filter(f => f.id !== friendId));
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="w-6 h-6 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="flex-1 w-full max-w-3xl mx-auto p-4 flex flex-col gap-6 h-full text-zinc-100 overflow-y-auto pb-24">
      <h1 className="text-2xl font-bold">Friends</h1>

      {friends.length === 0 ? (
        <div className="flex flex-col items-center justify-center p-12 text-center border border-zinc-800 rounded-xl bg-[#0C0C0C] mt-8">
          <div className="w-16 h-16 bg-zinc-900 rounded-full flex items-center justify-center text-2xl mb-4">👻</div>
          <h3 className="text-lg font-semibold mb-2">No friends yet</h3>
          <p className="text-sm text-zinc-500">Meet people in anonymous calls and add them as friends!</p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {friends.map(friend => (
            <div key={friend.id} className="flex items-center justify-between p-4 bg-[#0C0C0C] border border-zinc-800 rounded-xl">
              <div className="flex items-center gap-4">
                <div className="relative">
                  <div className="w-12 h-12 rounded-full border border-zinc-700 flex items-center justify-center bg-gradient-to-tr from-orange-600 to-amber-400 text-lg font-bold shadow-sm text-white">
                    {friend.alias.charAt(0).toUpperCase()}
                  </div>
                  {friend.country && (
                    <div className="absolute -bottom-1 -right-1 w-5 h-5 rounded border-2 border-[#0C0C0C] overflow-hidden">
                      <Flag code={friend.country} />
                    </div>
                  )}
                </div>

                <div className="flex flex-col">
                  <div className="flex items-center gap-2">
                    {editingId === friend.id ? (
                      <div className="flex items-center gap-1">
                        <input
                          autoFocus
                          value={editValue}
                          onChange={(e) => setEditValue(e.target.value)}
                          onKeyDown={(e) => { if (e.key === 'Enter') saveNickname(friend.id); if (e.key === 'Escape') setEditingId(null); }}
                          className="bg-zinc-900 border border-orange-500 rounded px-2 py-1 text-sm outline-none w-32"
                          placeholder="Nickname"
                        />
                        <button onClick={() => saveNickname(friend.id)} className="text-emerald-500 hover:bg-emerald-500/10 p-1 rounded"><Check size={14} /></button>
                        <button onClick={() => setEditingId(null)} className="text-[#ef4444] hover:bg-[#ef4444]/10 p-1 rounded"><X size={14} /></button>
                      </div>
                    ) : (
                      <>
                        <span className="font-bold text-lg">
                          {friend.nickname ? `${friend.nickname} (${friend.alias})` : friend.alias}
                        </span>
                        <button onClick={() => { setEditingId(friend.id); setEditValue(friend.nickname || ''); }} className="text-zinc-500 hover:text-zinc-100 transition-colors"><Edit2 size={14} /></button>
                        {friend.gender === 'male' && <span className="text-sm">👨</span>}
                        {friend.gender === 'female' && <span className="text-sm">👩</span>}
                      </>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5 text-xs text-zinc-300 mt-0.5">
                    <StatusDot status={friend.status} />
                    <span className="capitalize">{friend.status.replace('_', ' ')}</span>
                    <span className="text-zinc-600">·</span>
                    <span>{friend.country || 'Unknown'}</span>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  disabled={friend.status !== 'online'}
                  className="px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50 disabled:cursor-not-allowed border border-zinc-700 rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
                >
                  <Phone size={14} /> Call
                </button>
                <button onClick={() => removeFriend(friend.id)} className="p-1.5 text-zinc-500 hover:bg-[#1a0808] hover:text-[#ef4444] rounded-lg transition-colors">
                  <X size={16} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
