import React from 'react';

interface Props {
  seconds: number;
}

export function ReconnectBanner({ seconds }: Props) {
  return (
    <div className="absolute top-0 left-0 right-0 bg-[#1a1200] border-b border-amber-500/40 px-4 py-2.5 flex items-center justify-center gap-2.5 z-20">
      <div className="w-3.5 h-3.5 border-2 border-amber-500 border-t-transparent rounded-full animate-spin flex-shrink-0" />
      <div className="text-center">
        <span className="text-amber-400 text-sm font-semibold">Reconnecting...</span>
        <span className="text-amber-600 text-xs ml-2">({seconds}s)</span>
      </div>
    </div>
  );
}
