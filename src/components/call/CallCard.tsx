import React, { useState, useEffect, useRef } from 'react';
import { useCallStore } from '@/src/store/useCallStore';
import { useFilterStore } from '@/src/store/useFilterStore';
import { useReconnect } from '@/src/hooks/useReconnect';
import { useAppStore } from '@/src/store/useAppStore';
import { Flag } from '@/src/components/ui/Flag';
import { FriendRequestButton } from '@/src/components/call/FriendRequestButton';
import { cn } from '@/src/lib/utils';
import { Mic, MicOff, Search, Settings2, SkipForward, PhoneOff, RefreshCw } from 'lucide-react';
import { supabase } from '@/src/lib/supabase';

function useQueueTimer(running: boolean) {
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    if (!running) { setSeconds(0); return; }
    const id = setInterval(() => setSeconds(s => s + 1), 1000);
    return () => clearInterval(id);
  }, [running]);
  return seconds;
}

function formatTime(s: number) {
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
}

export function CallCard() {
  const {
    callState, roomId, setCallState,
    peerAlias, peerCountry, peerGender, peerId,
    isMuted, requestToggleMute,
    partnerMuted,
    callTime, callElapsedBase,
  } = useCallStore();
  const { genderFilter, preferCountries, blockCountries } = useFilterStore();
  const { alias } = useAppStore();
  const { reconnectSeconds } = useReconnect();
  const queueSeconds = useQueueTimer(callState === 'searching');
  const filterCount = (genderFilter !== 'all' ? 1 : 0) + preferCountries.length + blockCountries.length;

  const [myProfileId, setMyProfileId] = useState<string | null>(null);
  const [isFriend, setIsFriend] = useState(false);
  const isReconnecting = callState === 'reconnecting';

  // Resolve own profileId + check friendship when peer changes
  useEffect(() => {
    if (!alias) return;
    supabase.from('profiles').select('id').eq('alias', alias).maybeSingle().then(({ data }) => {
      if (data) setMyProfileId(data.id);
    });
  }, [alias]);

  useEffect(() => {
    if (!myProfileId || !peerId) { setIsFriend(false); return; }
    supabase.from('friends').select('id').eq('owner_id', myProfileId).eq('friend_id', peerId).maybeSingle().then(({ data }) => {
      setIsFriend(!!data);
    });
  }, [myProfileId, peerId]);

  const handleSkip = async () => {
    if (roomId && myProfileId) {
      await fetch('/api/end-call', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roomId, profileId: myProfileId, reason: 'skip' }),
      }).catch(() => {});
    }
    setCallState('searching');
  };

  const handleEndCall = async () => {
    if (roomId && myProfileId) {
      await fetch('/api/end-call', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roomId, profileId: myProfileId, reason: 'end_call' }),
      }).catch(() => {});
    }
    setCallState('idle');
  };

  const renderIdle = () => (
    <div className="flex flex-col items-center justify-center p-8 bg-zinc-900/40 border border-zinc-800 rounded-2xl w-full min-h-[280px] text-center shadow-lg backdrop-blur-xl">
      <div className="w-16 h-16 rounded-full bg-zinc-900 flex items-center justify-center mb-4 text-zinc-600">
        <Mic size={24} />
      </div>
      <h2 className="font-bold text-xl mb-1 text-zinc-100">Ready to connect</h2>
      <p className="text-sm text-zinc-500 mb-8">Anonymous · Instant · No signup</p>
      <button
        onClick={() => setCallState('searching')}
        className="w-full py-3.5 bg-accent-gradient text-white rounded-full font-semibold shadow-[0_0_20px_rgba(249,115,22,0.3)] hover:shadow-[0_0_30px_rgba(249,115,22,0.5)] transition-all flex justify-center items-center gap-2"
      >
        <Search size={18} /> Find someone to talk to
      </button>
    </div>
  );

  const renderSearching = () => (
    <div className="flex flex-col items-center justify-center p-8 bg-zinc-900/40 border border-amber-500/30 rounded-2xl w-full min-h-[280px] text-center shadow-[0_0_40px_rgba(245,158,11,0.05)] backdrop-blur-xl">
      <div className="relative w-24 h-24 flex items-center justify-center mb-6">
        <div className="absolute inset-0 border-t-2 border-r-2 border-amber-500 rounded-full animate-spin" style={{ animationDuration: '3s' }} />
        <div className="absolute inset-2 border-l-2 border-b-2 border-[#a78bfa] rounded-full animate-spin" style={{ animationDuration: '2s', animationDirection: 'reverse' }} />
        <div className="w-12 h-12 bg-zinc-900 rounded-full flex items-center justify-center text-amber-500">
          <Search size={20} />
        </div>
      </div>
      <h2 className="font-bold text-xl mb-1 text-zinc-100">Finding someone...</h2>
      <p className="text-sm text-amber-500 mb-1 animate-pulse">{queueSeconds}s in queue</p>
      {filterCount > 0 && (
        <p className="text-xs text-orange-500 mb-6 flex items-center gap-1 justify-center">
          <Settings2 size={12} /> {filterCount} filter{filterCount > 1 ? 's' : ''} active
        </p>
      )}
      <div className={filterCount > 0 ? '' : 'mt-6'}>
        <button
          onClick={() => setCallState('idle')}
          className="px-6 py-2 border border-[#ef4444] text-[#ef4444] rounded-full text-sm font-medium hover:bg-[#ef4444]/10 transition-colors"
        >
          Cancel
        </button>
      </div>
    </div>
  );

  const renderConnecting = () => (
    <div className="flex flex-col items-center justify-center p-8 bg-zinc-900/40 border border-orange-500/50 rounded-2xl w-full min-h-[280px] text-center shadow-[0_0_40px_rgba(249,115,22,0.1)] relative overflow-hidden backdrop-blur-xl">
      <div className="absolute inset-0 bg-accent-gradient opacity-5 animate-pulse" />
      <div className="w-20 h-20 rounded-full bg-gradient-to-tr from-orange-600 to-amber-400 flex items-center justify-center text-3xl font-bold mb-4 shadow-lg animate-matchPop text-white relative z-10">
        {(peerAlias || 'A').charAt(0).toUpperCase()}
      </div>
      <div className="flex items-center gap-2 mb-1 relative z-10">
        {peerCountry && <Flag code={peerCountry} />}
        <span className="font-bold text-xl text-zinc-100">{peerAlias || 'Anonymous'}</span>
        {peerGender === 'male' && <span>👨</span>}
        {peerGender === 'female' && <span>👩</span>}
      </div>
      <p className="text-sm text-zinc-500 mb-6 relative z-10">{peerCountry || 'Unknown'}</p>
      <div className="flex items-center justify-center gap-3 relative z-10 text-orange-500">
        <div className="w-4 h-4 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" />
        <span className="font-medium">Matched! Connecting...</span>
      </div>
    </div>
  );

  const renderConnected = () => (
    <div className="flex flex-col p-6 bg-zinc-900/40 border border-zinc-800 rounded-2xl w-full min-h-[420px] shadow-lg relative overflow-hidden backdrop-blur-xl">
      {/* Reconnecting banner */}
      {isReconnecting && (
        <div className="absolute top-0 left-0 right-0 bg-[#1a1200] border-b border-amber-500/30 p-2 flex items-center justify-center gap-2 z-20">
          <div className="w-3.5 h-3.5 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
          <span className="text-amber-500 text-sm font-medium">Reconnecting... ({reconnectSeconds}s remaining)</span>
        </div>
      )}

      <div className={cn('flex flex-col flex-1', isReconnecting && 'opacity-50 pointer-events-none')}>
        {/* Peer avatar */}
        <div className="flex flex-col items-center justify-center flex-1 mt-4">
          <div className="relative mb-2">
            <div
              className="w-24 h-24 rounded-full bg-gradient-to-tr from-orange-600 to-amber-400 flex items-center justify-center text-4xl font-bold shadow-lg text-white"
              style={{ filter: partnerMuted ? 'grayscale(60%)' : 'none', transition: 'filter 0.3s' }}
            >
              {(peerAlias || 'A').charAt(0).toUpperCase()}
            </div>
            {peerCountry && (
              <div className="absolute bottom-0 right-0 w-8 h-8 rounded-full border-[3px] border-[#0C0C0C] overflow-hidden bg-white">
                <Flag code={peerCountry} size={32} />
              </div>
            )}
            {/* Partner muted badge */}
            {partnerMuted && (
              <div
                style={{
                  position: 'absolute', top: -4, left: -4,
                  background: '#7f1d1d', borderRadius: '50%',
                  width: 26, height: 26,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 13, border: '2px solid #0d0d1a',
                  animation: 'pulse 2s infinite',
                }}
                title="Partner has muted their mic"
              >
                🔇
              </div>
            )}
          </div>

          <h3 className="font-bold text-2xl text-zinc-100 mb-1">{peerAlias || 'Anonymous'}</h3>
          <div className="flex items-center gap-2 text-sm text-zinc-300 mb-1">
            {peerCountry && <Flag code={peerCountry} />}
            <span>{peerCountry || 'Unknown'}</span>
            {peerGender === 'male' && <span className="bg-zinc-900 px-2 py-0.5 rounded text-xs">Male</span>}
            {peerGender === 'female' && <span className="bg-zinc-900 px-2 py-0.5 rounded text-xs">Female</span>}
          </div>

          {/* Partner muted text */}
          {partnerMuted && (
            <p style={{ margin: '2px 0', fontSize: 11, color: '#ef4444', textAlign: 'center' }}>
              🔇 {peerAlias} has muted their mic
            </p>
          )}
          {/* Own mute warning */}
          {isMuted && (
            <p style={{ margin: '2px 0', fontSize: 11, color: '#f59e0b', textAlign: 'center' }}>
              🔇 You are muted — partner cannot hear you
            </p>
          )}

          {/* Timer */}
          <div className="flex items-center gap-2 px-3 py-1 bg-emerald-950/20 text-emerald-500 rounded-full border border-emerald-900/50 mt-2 mb-4">
            <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-sm font-medium tracking-wide font-mono">
              {isReconnecting
                ? `⏸ Paused at ${formatTime(callElapsedBase)}`
                : `● Connected · ${formatTime(callTime)}`}
            </span>
          </div>

          {/* Waveform */}
          <div className="w-full flex items-center justify-center gap-1 mb-6">
            {Array.from({ length: 20 }).map((_, i) => (
              <div
                key={i}
                className="rounded-full"
                style={{
                  width: 4,
                  height: `${Math.max(4, Math.random() * 40)}px`,
                  background: isMuted ? '#374151' : partnerMuted ? '#4b5563' : '#6366f1',
                  animation: isMuted
                    ? 'none'
                    : partnerMuted
                    ? `wave ${1.5}s ease-in-out infinite alternate`
                    : `wave ${0.4 + Math.random() * 0.5}s ease-in-out infinite alternate`,
                  animationDelay: `${i * 0.05}s`,
                  transition: 'background 0.3s',
                }}
              />
            ))}
          </div>
        </div>

        {/* ── Call Controls (Feature 2: layout) ── */}
        <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 10 }}>
          {/* 1. Friend Request — full width */}
          {myProfileId && peerId && (
            <FriendRequestButton
              peer={{ id: peerId, alias: peerAlias || 'Anonymous', country: peerCountry, gender: peerGender }}
              myProfileId={myProfileId}
              isFriend={isFriend}
              onRequestSent={() => {}}
            />
          )}

          {/* Divider */}
          <div style={{ height: 1, background: '#1a1a2e', width: '100%' }} />

          {/* 2. Mute — full width, own row */}
          <button
            onClick={requestToggleMute}
            style={{
              width: '100%', padding: '12px 16px', borderRadius: 12,
              background: isMuted ? '#7f1d1d' : '#1e1e3f',
              color: isMuted ? '#fca5a5' : '#94a3b8',
              border: `1px solid ${isMuted ? '#991b1b' : '#2d2d4e'}`,
              cursor: 'pointer', fontSize: 14, fontWeight: 500,
              textAlign: 'left', display: 'flex', alignItems: 'center', gap: 10,
              transition: 'all 0.2s',
            }}
          >
            <span style={{ fontSize: 18 }}>{isMuted ? '🎤' : '🔇'}</span>
            <span>{isMuted ? 'Unmute mic' : 'Mute mic'}</span>
            {isMuted && (
              <span style={{
                marginLeft: 'auto', fontSize: 11, padding: '2px 8px',
                borderRadius: 20, background: '#991b1b', color: '#fca5a5',
              }}>
                Partner can't hear you
              </span>
            )}
          </button>

          {/* 3. Reconnect — full width, own row */}
          <button
            onClick={() => setCallState('reconnecting')}
            style={{
              width: '100%', padding: '12px 16px', borderRadius: 12,
              background: '#1e1e3f', color: '#94a3b8',
              border: '1px solid #2d2d4e', cursor: 'pointer', fontSize: 14,
              fontWeight: 500, textAlign: 'left', display: 'flex', alignItems: 'center', gap: 10,
            }}
          >
            <span style={{ fontSize: 18 }}>🔄</span>
            <span>Reconnect</span>
          </button>

          {/* 4. Skip + End Call — 50/50 */}
          <div style={{ display: 'flex', gap: 10 }}>
            <button
              onClick={handleSkip}
              style={{
                flex: 1, padding: '12px', borderRadius: 12,
                background: '#1e293b', color: '#f59e0b',
                border: '1px solid #2d2d4e', cursor: 'pointer', fontSize: 14, fontWeight: 500,
              }}
            >
              ⏭ Skip
            </button>
            <button
              onClick={handleEndCall}
              style={{
                flex: 1, padding: '12px', borderRadius: 12,
                background: '#7f1d1d', color: '#fca5a5',
                border: 'none', cursor: 'pointer', fontSize: 14, fontWeight: 700,
              }}
            >
              📵 End call
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  switch (callState) {
    case 'searching': return renderSearching();
    case 'matched':
    case 'connecting': return renderConnecting();
    case 'connected':
    case 'reconnecting': return renderConnected();
    case 'idle':
    default: return renderIdle();
  }
}
