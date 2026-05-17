import React, { useState } from 'react';
import { useAppStore } from '@/src/store/useAppStore';

type RequestState = 'none' | 'confirm' | 'sent' | 'friends';

interface Props {
  peer: { id: string; alias: string; country: string | null; gender: string | null };
  myProfileId: string;
  isFriend: boolean;
  onRequestSent?: () => void;
}

export function FriendRequestButton({ peer, myProfileId, isFriend, onRequestSent }: Props) {
  const [reqState, setReqState] = useState<RequestState>(isFriend ? 'friends' : 'none');
  const [sending, setSending] = useState(false);

  const sendRequest = async () => {
    setSending(true);
    try {
      const res = await fetch('/api/friend-requests/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ senderId: myProfileId, receiverId: peer.id }),
      });
      const data = await res.json();
      if (res.ok) {
        setReqState('sent');
        onRequestSent?.();
      } else if (data.error === 'already_friends') {
        setReqState('friends');
      } else if (data.error === 'request_already_sent') {
        setReqState('sent');
      }
    } finally {
      setSending(false);
    }
  };

  if (reqState === 'friends') return (
    <div style={{
      width: '100%', padding: '11px', borderRadius: 10, textAlign: 'center',
      background: '#052e16', border: '1px solid #166534', color: '#86efac', fontSize: 13,
    }}>
      ✓ You are friends
    </div>
  );

  if (reqState === 'sent') return (
    <div style={{
      width: '100%', padding: '11px', borderRadius: 10, textAlign: 'center',
      background: '#0a1628', border: '1px solid #1e3a5f', color: '#60a5fa', fontSize: 13,
    }}>
      ✉️ Friend request sent — waiting for {peer.alias}
    </div>
  );

  if (reqState === 'confirm') return (
    <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 8 }}>
      <p style={{ margin: 0, fontSize: 12, color: '#94a3b8', textAlign: 'center' }}>
        Send a friend request to <strong style={{ color: '#f1f5f9' }}>{peer.alias}</strong>?
      </p>
      <div style={{ display: 'flex', gap: 8 }}>
        <button
          onClick={sendRequest}
          disabled={sending}
          style={{
            flex: 1, padding: '11px', borderRadius: 10,
            background: sending ? '#374151' : '#16a34a',
            color: '#fff', border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600,
          }}
        >
          {sending ? 'Sending...' : '✓ Send request'}
        </button>
        <button
          onClick={() => setReqState('none')}
          style={{
            flex: 1, padding: '11px', borderRadius: 10,
            background: '#1e1e3f', color: '#94a3b8',
            border: '1px solid #2d2d4e', cursor: 'pointer', fontSize: 13,
          }}
        >
          Cancel
        </button>
      </div>
    </div>
  );

  return (
    <button
      onClick={() => setReqState('confirm')}
      style={{
        width: '100%', padding: '11px', borderRadius: 10,
        background: '#1e1e3f', color: '#a78bfa',
        border: '1px solid #2d2d4e', cursor: 'pointer', fontSize: 13, fontWeight: 500,
      }}
    >
      ➕ Send friend request to {peer.alias}
    </button>
  );
}
