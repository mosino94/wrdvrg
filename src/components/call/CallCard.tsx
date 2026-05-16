import React, { useEffect, useState, useRef } from 'react';
import { useCallStore } from '@/src/store/useCallStore';
import { useFilterStore } from '@/src/store/useFilterStore';
import { useCall } from '@/src/hooks/useCall';
import { Flag } from '@/src/components/ui/Flag';
import { ReconnectBanner } from './ReconnectBanner';
import { FriendRequestButton } from './FriendRequestButton';
import { cn } from '@/src/lib/utils';
import { Mic, MicOff, Search, Settings2, SkipForward, PhoneOff } from 'lucide-react';

function fmtTime(seconds: number) {
  const m = Math.floor(seconds / 60).toString().padStart(2, '0');
  const s = (seconds % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

export function CallCard() {
  const { callState, setCallState, peerAlias, peerCountry, peerGender, isMuted, peerMuted, callDurationBase } = useCallStore();
  const { genderFilter, preferCountries, blockCountries } = useFilterStore();
  const { endCall, toggleMute, reconnectSeconds } = useCall();

  const filterCount =
    (genderFilter !== 'all' ? 1 : 0) +
    (preferCountries.length > 0 ? 1 : 0) +
    (blockCountries.length > 0 ? 1 : 0);

  // Queue timer
  const [queueSeconds, setQueueSeconds] = useState(0);
  useEffect(() => {
    if (callState !== 'searching') { setQueueSeconds(0); return; }
    setQueueSeconds(0);
    const id = setInterval(() => setQueueSeconds((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, [callState]);

  // Call duration timer — resumes from callDurationBase on connect/reconnect
  const [displaySeconds, setDisplaySeconds] = useState(callDurationBase);
  const callStartRef = useRef<number | null>(null);
  useEffect(() => {
    if (callState === 'connected') {
      const base = callDurationBase;
      callStartRef.current = Date.now() - base * 1000;
      setDisplaySeconds(base);
      const id = setInterval(() => {
        if (callStartRef.current !== null) {
          setDisplaySeconds(Math.floor((Date.now() - callStartRef.current) / 1000));
        }
      }, 1000);
      return () => clearInterval(id);
    }
    if (callState === 'reconnecting') {
      setDisplaySeconds(callDurationBase);
      callStartRef.current = null;
    }
    if (callState === 'idle' || callState === 'searching') {
      setDisplaySeconds(0);
      callStartRef.current = null;
    }
  }, [callState, callDurationBase]);

  const handleSkip = () => {
    endCall();
    setCallState('searching');
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
      <p className="text-sm text-amber-500 mb-1 animate-pulse font-mono">{fmtTime(queueSeconds)} in queue</p>
      {filterCount > 0 && (
        <p className="text-xs text-orange-500 mb-6 flex items-center gap-1 justify-center">
          <Settings2 size={12} /> {filterCount} filter{filterCount > 1 ? 's' : ''} active
        </p>
      )}
      {filterCount === 0 && <div className="mb-6" />}
      <button
        onClick={() => setCallState('idle')}
        className="px-6 py-2 border border-[#ef4444] text-[#ef4444] rounded-full text-sm font-medium hover:bg-[#ef4444]/10 transition-colors"
      >
        Cancel
      </button>
    </div>
  );

  const renderConnecting = () => (
    <div className="flex flex-col items-center justify-center p-8 bg-zinc-900/40 border border-orange-500/50 rounded-2xl w-full min-h-[280px] text-center shadow-[0_0_40px_rgba(249,115,22,0.1)] relative overflow-hidden backdrop-blur-xl">
      <div className="absolute inset-0 bg-accent-gradient opacity-5 animate-pulse" />
      <div className="w-20 h-20 rounded-full bg-gradient-to-tr from-orange-600 to-amber-400 flex items-center justify-center text-3xl font-bold mb-4 shadow-lg text-white relative z-10">
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
    <div className="flex flex-col p-6 bg-zinc-900/40 border border-zinc-800 rounded-2xl w-full min-h-[440px] shadow-lg relative overflow-hidden backdrop-blur-xl">
      {callState === 'reconnecting' && <ReconnectBanner seconds={reconnectSeconds} />}

      <div className={cn('flex flex-col flex-1', callState === 'reconnecting' && 'opacity-40 pointer-events-none mt-8')}>
        <div className="flex flex-col items-center justify-center flex-1 mt-2">
          {/* Avatar with mute badge */}
          <div className="relative mb-4">
            <div
              className={cn(
                'w-24 h-24 rounded-full bg-gradient-to-tr from-orange-600 to-amber-400 flex items-center justify-center text-4xl font-bold shadow-lg text-white transition-all',
                peerMuted && 'grayscale opacity-60'
              )}
            >
              {(peerAlias || 'A').charAt(0).toUpperCase()}
            </div>
            {peerCountry && (
              <div className="absolute bottom-0 right-0 w-8 h-8 rounded-full border-[3px] border-[#0C0C0C] overflow-hidden bg-white">
                <Flag code={peerCountry} size={32} />
              </div>
            )}
            {peerMuted && (
              <div className="absolute -top-1 -right-1 w-7 h-7 rounded-full bg-zinc-900 border border-zinc-700 flex items-center justify-center">
                <span className="text-base">🔇</span>
              </div>
            )}
          </div>

          <h3 className="font-bold text-2xl text-zinc-100 mb-1">{peerAlias || 'Anonymous'}</h3>
          <div className="flex items-center gap-2 text-sm text-zinc-300 mb-2">
            {peerCountry && <Flag code={peerCountry} />}
            <span>{peerCountry || 'Unknown'}</span>
            {peerGender === 'male' && <span className="bg-zinc-900 px-2 py-0.5 rounded text-xs">Male</span>}
            {peerGender === 'female' && <span className="bg-zinc-900 px-2 py-0.5 rounded text-xs">Female</span>}
          </div>
          {peerMuted && <p className="text-xs text-zinc-500 mb-2">Partner muted</p>}

          {/* Call timer */}
          <div className="flex items-center gap-2 px-3 py-1 bg-emerald-950/20 text-emerald-500 rounded-full border border-emerald-900/50 mb-6">
            <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-sm font-medium tracking-wide font-mono">{fmtTime(displaySeconds)}</span>
          </div>

          {/* Waveform */}
          <div className="w-full flex items-center justify-center gap-1 mb-6">
            {Array.from({ length: 20 }).map((_, i) => (
              <div
                key={i}
                className={cn('w-1.5 rounded-full animate-wave', peerMuted ? 'bg-zinc-600' : 'bg-orange-500')}
                style={{
                  height: `${Math.max(4, Math.random() * 40)}px`,
                  animationDuration: peerMuted ? `${1.5 + i * 0.1}s` : `${0.5 + i * 0.05}s`,
                }}
              />
            ))}
          </div>
        </div>

        {/* Controls */}
        <div className="flex flex-col gap-2">
          <FriendRequestButton />

          <button
            onClick={toggleMute}
            className={cn(
              'w-full py-3 border rounded-xl flex items-center justify-center gap-2 transition-colors font-medium',
              isMuted
                ? 'bg-red-950/30 border-red-700/60 text-red-400 hover:bg-red-950/50'
                : 'bg-zinc-900 hover:bg-zinc-800 border-zinc-700 text-zinc-100'
            )}
          >
            {isMuted ? <MicOff size={18} /> : <Mic size={18} />}
            {isMuted ? 'Unmute mic' : 'Mute mic'}
          </button>

          <div className="flex gap-2">
            <button
              onClick={handleSkip}
              className="flex-1 py-3 bg-zinc-800 hover:bg-zinc-700 text-white rounded-xl flex items-center justify-center gap-2 transition-colors font-bold"
            >
              <SkipForward size={18} fill="currentColor" /> Skip
            </button>
            <button
              onClick={endCall}
              className="flex-1 py-3 bg-[#ef4444] hover:bg-[#dc2626] text-white rounded-xl flex items-center justify-center gap-2 transition-colors font-bold"
            >
              <PhoneOff size={18} /> End
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
