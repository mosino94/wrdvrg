import React, { useState, useEffect } from 'react';
import { UserPlus, Check, Clock, Users } from 'lucide-react';
import { useCallStore } from '@/src/store/useCallStore';
import { useAppStore } from '@/src/store/useAppStore';

type BtnState = 'idle' | 'confirm' | 'sent' | 'friends';

export function FriendRequestButton() {
  const { peerId, peerAlias, peerCountry, peerGender } = useCallStore();
  const { profileId, alias, countryCode, gender } = useAppStore();
  const [btnState, setBtnState] = useState<BtnState>('idle');
  const confirmTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (confirmTimerRef.current) clearTimeout(confirmTimerRef.current);
    };
  }, []);

  // Reset when peer changes
  useEffect(() => {
    setBtnState('idle');
    if (confirmTimerRef.current) clearTimeout(confirmTimerRef.current);
  }, [peerId]);

  const handleClick = async () => {
    if (btnState === 'idle') {
      setBtnState('confirm');
      confirmTimerRef.current = setTimeout(() => setBtnState('idle'), 3000);
      return;
    }

    if (btnState === 'confirm') {
      if (confirmTimerRef.current) clearTimeout(confirmTimerRef.current);
      try {
        const res = await fetch('/api/friend-request/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            senderId: profileId || localStorage.getItem('whisper_profile_id'),
            receiverId: peerId,
            senderAlias: alias,
            senderCountry: countryCode,
            senderGender: gender,
          }),
        });
        const data = await res.json();
        if (data.status === 'already_friends') {
          setBtnState('friends');
        } else {
          setBtnState('sent');
        }
      } catch {
        setBtnState('idle');
      }
    }
  };

  if (btnState === 'friends') {
    return (
      <button disabled className="w-full py-3 bg-emerald-950/30 border border-emerald-700/50 text-emerald-400 rounded-xl flex items-center justify-center gap-2 font-medium cursor-default">
        <Users size={18} /> Friends!
      </button>
    );
  }

  if (btnState === 'sent') {
    return (
      <button disabled className="w-full py-3 bg-zinc-900 border border-zinc-700 text-zinc-400 rounded-xl flex items-center justify-center gap-2 font-medium cursor-default">
        <Clock size={18} /> Request sent
      </button>
    );
  }

  if (btnState === 'confirm') {
    return (
      <button
        onClick={handleClick}
        className="w-full py-3 bg-orange-500/20 border border-orange-500/60 text-orange-400 rounded-xl flex items-center justify-center gap-2 font-medium hover:bg-orange-500/30 transition-colors"
      >
        <Check size={18} /> Tap to confirm request
      </button>
    );
  }

  return (
    <button
      onClick={handleClick}
      className="w-full py-3 bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 rounded-xl flex items-center justify-center gap-2 transition-colors font-medium"
    >
      <UserPlus size={18} /> Add {peerAlias || 'Stranger'} as friend
    </button>
  );
}
