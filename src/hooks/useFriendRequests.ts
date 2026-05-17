import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/src/lib/supabase';
import { useCallStore } from '@/src/store/useCallStore';

export interface IncomingRequest {
  requestId: string;
  senderAlias: string;
  senderCountry: string | null;
  senderGender: string | null;
}

export function useFriendRequests(myProfileId: string | null) {
  const [incomingRequest, setIncomingRequest] = useState<IncomingRequest | null>(null);
  const [acceptedNotice, setAcceptedNotice] = useState<string | null>(null);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const senderChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  useEffect(() => {
    if (!myProfileId) return;

    // Subscribe to incoming requests
    channelRef.current = supabase
      .channel(`incoming-friend-requests-${myProfileId}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'friend_requests',
        filter: `receiver_id=eq.${myProfileId}`,
      }, (payload: any) => {
        const req = payload.new;
        if (req.status === 'pending') {
          setIncomingRequest({
            requestId: req.id,
            senderAlias: req.sender_alias,
            senderCountry: req.sender_country,
            senderGender: req.sender_gender,
          });
        }
      })
      .subscribe();

    // Subscribe to sent requests (to know when accepted)
    senderChannelRef.current = supabase
      .channel(`my-sent-requests-${myProfileId}`)
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'friend_requests',
        filter: `sender_id=eq.${myProfileId}`,
      }, (payload: any) => {
        if (payload.new.status === 'accepted') {
          setAcceptedNotice(`${payload.new.sender_alias} accepted your friend request! 🎉`);
          setTimeout(() => setAcceptedNotice(null), 5000);
        }
      })
      .subscribe();

    return () => {
      channelRef.current?.unsubscribe();
      senderChannelRef.current?.unsubscribe();
    };
  }, [myProfileId]);

  const dismissIncomingRequest = () => setIncomingRequest(null);

  const respondToRequest = async (requestId: string, responderId: string, response: 'accept' | 'decline') => {
    await fetch('/api/friend-requests/respond', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ requestId, responderId, response }),
    });
    setIncomingRequest(null);
  };

  return { incomingRequest, acceptedNotice, respondToRequest, dismissIncomingRequest };
}
