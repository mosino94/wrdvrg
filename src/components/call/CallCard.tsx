import React from 'react';
import { useCallStore } from '@/src/store/useCallStore';
import { useAppStore } from '@/src/store/useAppStore';
import { useReconnect } from '@/src/hooks/useReconnect';
import { Flag } from '@/src/components/ui/Flag';
import { cn } from '@/src/lib/utils';
import { Mic, Search, Settings2, SkipForward, X, Plus, PhoneOff, MicOff } from 'lucide-react';

export function CallCard() {
  const { callState, setCallState, peerAlias, peerCountry, peerGender } = useCallStore();
  const { reconnectSeconds } = useReconnect();

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
      <p className="text-sm text-amber-500 mb-1 animate-pulse">24s in queue</p>
      <p className="text-xs text-orange-500 mb-6 flex items-center gap-1 justify-center">
        <Settings2 size={12} /> 1 filter active
      </p>

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
      
      {/* Dev helper: click to connect */}
      <button onClick={() => setCallState('connected')} className="absolute bottom-2 right-2 text-[10px] text-gray-700">dev:connect</button>
    </div>
  );

  const renderConnected = () => (
    <div className="flex flex-col p-6 bg-zinc-900/40 border border-zinc-800 rounded-2xl w-full min-h-[400px] shadow-lg relative overflow-hidden backdrop-blur-xl">
      {callState === 'reconnecting' && (
        <div className="absolute top-0 left-0 right-0 bg-[#1a1200] border-b border-amber-500/30 p-2 flex items-center justify-center gap-2 z-20">
          <div className="w-3.5 h-3.5 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
          <span className="text-amber-500 text-sm font-medium">Reconnecting... ({reconnectSeconds}s remaining)</span>
        </div>
      )}

      <div className={cn("flex flex-col flex-1", callState === 'reconnecting' && "opacity-50 pointer-events-none")}>
        <div className="flex flex-col items-center justify-center flex-1 mt-4">
          <div className="relative mb-5">
            <div className="w-24 h-24 rounded-full bg-gradient-to-tr from-orange-600 to-amber-400 flex items-center justify-center text-4xl font-bold shadow-lg text-white">
              {(peerAlias || 'A').charAt(0).toUpperCase()}
            </div>
            {peerCountry && (
              <div className="absolute bottom-0 right-0 w-8 h-8 rounded-full border-[3px] border-[#0C0C0C] overflow-hidden bg-white">
                <Flag code={peerCountry} size={32} />
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
          
          <div className="flex items-center gap-2 px-3 py-1 bg-emerald-950/20 text-emerald-500 rounded-full border border-emerald-900/50 mb-8">
            <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-sm font-medium tracking-wide font-mono">03:45</span>
          </div>

          <div className="w-full flex items-center justify-center gap-1 mb-8">
            {Array.from({ length: 20 }).map((_, i) => (
              <div key={i} className="w-1.5 bg-orange-500 rounded-full animate-wave" style={{ 
                height: `${Math.max(4, Math.random() * 40)}px`,
                animationDelay: `${i * 0.05}s`
              }} />
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-3">
          <button className="w-full py-3 bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 rounded-xl flex items-center justify-center gap-2 transition-colors font-medium">
            <Plus size={18} /> Add {peerAlias || 'Stranger'} as friend
          </button>
          
          <button className="w-full py-3 bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 rounded-xl flex items-center justify-center gap-2 transition-colors font-medium">
            <MicOff size={18} /> Mute mic
          </button>

          <div className="flex gap-3">
            <button 
              onClick={() => setCallState('searching')}
              className="flex-1 py-3 bg-zinc-800 hover:bg-zinc-700 text-white rounded-xl flex items-center justify-center gap-2 transition-colors font-bold"
            >
              <SkipForward size={18} fill="currentColor" /> Skip
            </button>
            <button 
              onClick={() => setCallState('idle')}
              className="flex-1 py-3 bg-[#ef4444] hover:bg-[#dc2626] text-white rounded-xl flex items-center justify-center gap-2 transition-colors font-bold"
            >
              <PhoneOff size={18} /> End call
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
