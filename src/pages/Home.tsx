import React, { useState } from 'react';
import { useCallStore } from '@/src/store/useCallStore';
import { useAppStore } from '@/src/store/useAppStore';
import { Flag } from '@/src/components/ui/Flag';
import { CallCard } from '@/src/components/call/CallCard';
import { FiltersPanel } from '@/src/components/filters/FiltersPanel';
import { cn } from '@/src/lib/utils';
import { Settings2, Zap } from 'lucide-react';
import { useFilterStore } from '@/src/store/useFilterStore';

export function Home() {
  const { alias, gender, countryCode } = useAppStore();
  const { autoConnect, setAutoConnect } = useCallStore();
  const { genderFilter, preferCountries, blockCountries } = useFilterStore();
  const [filtersOpen, setFiltersOpen] = useState(false);

  const filterCount = (genderFilter !== 'all' ? 1 : 0) + preferCountries.length + blockCountries.length;

  return (
    <div className="flex flex-col items-center w-full max-w-md mx-auto p-4 md:p-6 min-h-full pb-24 relative overflow-y-auto overflow-x-hidden">
      {/* Profile Row */}
      <div className="w-full flex justify-between items-center mb-6 px-1">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full border-2 border-zinc-800 flex items-center justify-center bg-zinc-900 overflow-hidden">
             {countryCode ? <Flag code={countryCode} size={30} /> : <span className="text-xs">?</span>}
          </div>
          <div className="flex flex-col">
            <div className="flex items-center gap-1.5">
              <span className="font-bold text-lg leading-tight truncate max-w-[150px]">{alias}</span>
              {gender === 'male' && <span className="text-sm">👨</span>}
              {gender === 'female' && <span className="text-sm">👩</span>}
            </div>
            <div className="text-zinc-500 text-xs font-medium">
              {countryCode || 'Locating...'} · {gender ? gender.charAt(0).toUpperCase() + gender.slice(1) : 'Secret'}
            </div>
          </div>
        </div>
        <button className="w-9 h-9 rounded-full bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 flex items-center justify-center transition-colors">
          ✏️
        </button>
      </div>

      <CallCard />

      {/* Auto Connect Toggle ALWAYS visible below card, every state */}
      <div 
        className={cn(
          "w-full mt-6 rounded-[16px] border transition-all p-4 flex flex-col gap-1 cursor-pointer",
          autoConnect ? "bg-[#0C0C0C] border-orange-500" : "bg-[#0C0C0C] border-zinc-800"
        )}
        onClick={() => setAutoConnect(!autoConnect)}
      >
        <div className="flex justify-between items-center">
          <span className={cn("font-semibold flex items-center gap-2", autoConnect ? "text-zinc-100" : "text-zinc-300")}>
            <Zap size={18} className={autoConnect ? "text-amber-500 fill-[#f59e0b]" : ""} /> Auto connect
          </span>
          <div className={cn("w-12 h-6 rounded-full relative transition-colors duration-300", autoConnect ? "bg-orange-500" : "bg-[#2d2d4e]")}>
            <div className={cn("absolute top-1 bottom-1 w-4 bg-white rounded-full transition-all shadow-sm duration-300", autoConnect ? "right-1" : "left-1")} />
          </div>
        </div>
        <span className="text-sm text-zinc-500 ml-7 opacity-80">Instantly match when idle</span>
      </div>

      {/* Filters Toggle */}
      <button 
        onClick={() => setFiltersOpen(!filtersOpen)}
        className={cn("w-full mt-4 py-3 border rounded-xl flex items-center justify-center gap-2 transition-colors", filtersOpen || filterCount > 0 ? "bg-zinc-900 border-zinc-700 text-orange-500" : "bg-[#080808] border-zinc-800 hover:bg-zinc-900 text-zinc-300")}
      >
        <Settings2 size={18} /> Filters {filterCount > 0 && <span className="flex items-center justify-center bg-orange-500 text-white text-xs rounded-full w-5 h-5 ml-1">{filterCount}</span>}
      </button>

      {/* Filters Area */}
      {filtersOpen && <FiltersPanel />}
    </div>
  );
}
