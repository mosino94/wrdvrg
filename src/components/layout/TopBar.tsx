import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useOnlineCount } from '@/src/hooks/usePresence';
import { useAppStore } from '@/src/store/useAppStore';
import { Flag } from '@/src/components/ui/Flag';

export function TopBar() {
  const navigate = useNavigate();
  const onlineCount = useOnlineCount();
  const { alias, countryCode, gender } = useAppStore();

  const formattedCount =
    onlineCount === null
      ? '...'
      : new Intl.NumberFormat('en-US').format(onlineCount);

  return (
    <header className="w-full h-14 bg-[#0C0C0C] border-b border-zinc-800 flex items-center justify-between px-6 flex-shrink-0 z-50">
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-orange-600 to-amber-400 flex items-center justify-center shadow-sm">
            <svg viewBox="0 0 24 24" className="w-5 h-5 text-black" fill="currentColor"><path d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364-6.364l-.707.707M6.343 17.657l-.707.707m12.728 0l-.707-.707M6.343 6.343l-.707-.707"></path></svg>
          </div>
          <span className="font-semibold tracking-wider text-zinc-100 text-lg uppercase hidden sm:block">Whisper</span>
        </div>

        <div className="flex items-center gap-2 px-3 py-1 bg-zinc-900 border border-zinc-800 rounded-full">
          <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
          <span className="text-xs font-mono text-zinc-400">
            <span className="text-zinc-100">{formattedCount}</span>{' '}
            <span className="hidden sm:inline">ONLINE</span>
          </span>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <button
          onClick={() => navigate('/settings')}
          className="flex items-center gap-2 px-3 py-1.5 bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 rounded-lg transition-colors cursor-pointer group"
          title="Edit Profile"
        >
          {countryCode && <Flag code={countryCode} />}
          <span className="text-sm font-medium">{alias || 'Guest'}</span>
          {gender === 'male' && <span>👨</span>}
          {gender === 'female' && <span>👩</span>}
          <span className="text-zinc-500 group-hover:text-orange-500 transition-colors ml-1">⚙️</span>
        </button>

        <button className="w-8 h-8 flex items-center justify-center text-zinc-300 hover:text-zinc-100 transition-colors rounded-lg hover:bg-zinc-900">
          🔊
        </button>
      </div>
    </header>
  );
}
