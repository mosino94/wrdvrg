import React, { useEffect, useState } from 'react';
import { useAppStore } from '@/src/store/useAppStore';
import { Flag } from '@/src/components/ui/Flag';
import { StatusDot } from '@/src/components/ui/StatusDot';
import { IncomingRequestPopup } from '@/src/components/friends/IncomingRequestPopup';
import { useFriendRequests } from '@/src/hooks/useFriendRequests';
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

interface PendingRequest {
  id: string;
  sender_id: string;
  senderAlias: string;
  senderCountry: string | null;
  senderGender: string | null;
}

export function Friends() {
  const { alias } = useAppStore();
  const [friends, setFriends] = useState<Friend[]>([]);
  const [myProfileId, setMyProfileId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [pendingRequests, setPendingRequests] = useState<PendingRequest[]>([]);

  const { incomingRequest, acceptedNotice, respondToRequest, dismissIncomingRequest } = useFriendRequests(myProfileId);

  useEffect(() => {
    let active = true;

    const loadData = async () => {
      try {
        const { data: myProfile } = await supabase.from('profiles').select('id').eq('alias', alias).maybeSingle();
        if (!myProfile) { if (active) setLoading(false); return; }

        setMyProfileId(myProfile.id);

        const [friendsRes, pendingRes] = await Promise.all([
          fetch(`/api/friends/${myProfile.id}`),
          fetch(`/api/friend-requests/pending/${myProfile.id}`),
        ]);

        if (friendsRes.ok && active) setFriends(await friendsRes.json());
        if (pendingRes.ok && active) {
          const pending = await pendingRes.json();
          setPendingRequests(pending.map((r: any) => ({
            id: r.id,
            sender_id: r.sender_id,
            senderAlias: r.sender_alias,
            senderCountry: r.sender_country,
            senderGender: r.sender_gender,
          })));
        }
      } catch (err) {
        console.error('Failed to load friends', err);
      } finally {
        if (active) setLoading(false);
      }
    };

    if (alias) loadData();
    return () => { active = false; };
  }, [alias]);

  const handleAccept = async (req: PendingRequest) => {
    if (!myProfileId) return;
    await respondToRequest(req.id, myProfileId, 'accept');
    setPendingRequests(prev => prev.filter(r => r.id !== req.id));
    // Refresh friends list
    const res = await fetch(`/api/friends/${myProfileId}`);
    if (res.ok) setFriends(await res.json());
  };

  const handleDecline = async (req: PendingRequest) => {
    if (!myProfileId) return;
    await respondToRequest(req.id, myProfileId, 'decline');
    setPendingRequests(prev => prev.filter(r => r.id !== req.id));
  };

  const handleIncomingAccept = async () => {
    if (!incomingRequest || !myProfileId) return;
    await respondToRequest(incomingRequest.requestId, myProfileId, 'accept');
    const res = await fetch(`/api/friends/${myProfileId}`);
    if (res.ok) setFriends(await res.json());
  };

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
      {/* Incoming request floating popup */}
      {incomingRequest && (
        <IncomingRequestPopup
          request={incomingRequest}
          onAccept={handleIncomingAccept}
          onDecline={() => myProfileId && respondToRequest(incomingRequest.requestId, myProfileId, 'decline')}
        />
      )}

      {/* Accepted notice */}
      {acceptedNotice && (
        <div style={{
          position: 'fixed', top: 64, right: 16, zIndex: 500,
          background: '#052e16', border: '1px solid #166534', borderRadius: 12,
          padding: '12px 16px', color: '#86efac', fontSize: 13,
          boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
        }}>
          {acceptedNotice}
        </div>
      )}

      <h1 className="text-2xl font-bold">Friends</h1>

      {/* Pending Requests Section */}
      {pendingRequests.length > 0 && (
        <div style={{ marginBottom: 20 }}>
          <p style={{ fontSize: 11, color: '#6366f1', textTransform: 'uppercase', letterSpacing: '.06em', margin: '0 0 10px' }}>
            Pending requests · {pendingRequests.length}
          </p>
          {pendingRequests.map(req => (
            <div key={req.id} style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '10px 0', borderTop: '1px solid #1a1a2e', gap: 8,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 0 }}>
                <div style={{
                  width: 36, height: 36, borderRadius: '50%',
                  background: 'linear-gradient(135deg,#4f46e5,#7c3aed)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 14, fontWeight: 700, color: '#fff', flexShrink: 0,
                }}>
                  {req.senderAlias[0]}
                </div>
                <div style={{ minWidth: 0 }}>
                  <p style={{ margin: 0, fontSize: 13, color: '#e2e8f0', fontWeight: 500 }}>
                    {req.senderAlias}
                    {req.senderGender ? ` ${req.senderGender === 'male' ? '👨' : '👩'}` : ''}
                  </p>
                  <p style={{ margin: 0, fontSize: 11, color: '#6366f1' }}>
                    {req.senderCountry && <Flag code={req.senderCountry} size={11} />} Wants to be friends
                  </p>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                <button
                  onClick={() => handleAccept(req)}
                  style={{
                    fontSize: 12, padding: '6px 12px', borderRadius: 20,
                    background: '#6366f1', color: '#fff', border: 'none', cursor: 'pointer',
                  }}
                >
                  Accept
                </button>
                <button
                  onClick={() => handleDecline(req)}
                  style={{
                    fontSize: 12, padding: '6px 10px', borderRadius: 20,
                    background: 'transparent', color: '#ef4444',
                    border: '1px solid #2d2d4e', cursor: 'pointer',
                  }}
                >
                  Decline
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {friends.length === 0 && pendingRequests.length === 0 ? (
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
