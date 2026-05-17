import React from 'react';
import { Flag } from '@/src/components/ui/Flag';

interface IncomingRequest {
  requestId: string;
  senderAlias: string;
  senderCountry: string | null;
  senderGender: string | null;
}

interface Props {
  request: IncomingRequest;
  onAccept: () => void;
  onDecline: () => void;
}

export function IncomingRequestPopup({ request, onAccept, onDecline }: Props) {
  return (
    <div style={{
      position: 'fixed', top: 64, right: 16, zIndex: 500,
      background: '#0d0d1a', border: '1px solid #6366f1', borderRadius: 14,
      padding: '14px 16px', maxWidth: 280, width: '90%',
      boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
      animation: 'slideDown 0.3s ease',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
        <div style={{
          width: 36, height: 36, borderRadius: '50%',
          background: 'linear-gradient(135deg,#4f46e5,#7c3aed)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 16, fontWeight: 700, color: '#fff', flexShrink: 0,
        }}>
          {request.senderAlias[0]}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: '#f1f5f9' }}>
            Friend request
          </p>
          <p style={{ margin: 0, fontSize: 12, color: '#94a3b8' }}>
            {request.senderCountry && <Flag code={request.senderCountry} size={12} />}{' '}
            {request.senderAlias}
            {request.senderGender ? ` · ${request.senderGender === 'male' ? '👨' : '👩'}` : ''}
          </p>
        </div>
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <button
          onClick={onAccept}
          style={{
            flex: 1, padding: '9px', borderRadius: 10,
            background: '#6366f1', color: '#fff',
            border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600,
          }}
        >
          ✓ Accept
        </button>
        <button
          onClick={onDecline}
          style={{
            flex: 1, padding: '9px', borderRadius: 10,
            background: 'transparent', color: '#94a3b8',
            border: '1px solid #2d2d4e', cursor: 'pointer', fontSize: 13,
          }}
        >
          Decline
        </button>
      </div>
    </div>
  );
}
