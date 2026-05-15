import React, { useState } from 'react';
import { useFilterStore } from '../../store/useFilterStore';
import { cn } from '../../lib/utils';
import { Flag } from '../ui/Flag';

const COUNTRY_LIST = [
  { code: 'BD', name: 'Bangladesh' },
  { code: 'US', name: 'United States' },
  { code: 'GB', name: 'United Kingdom' },
  { code: 'IN', name: 'India' },
  { code: 'PK', name: 'Pakistan' },
  { code: 'CA', name: 'Canada' },
  { code: 'AU', name: 'Australia' },
  { code: 'DE', name: 'Germany' },
  { code: 'FR', name: 'France' },
  { code: 'BR', name: 'Brazil' },
  { code: 'TR', name: 'Turkey' },
  { code: 'ID', name: 'Indonesia' },
  { code: 'RU', name: 'Russia' },
  { code: 'MX', name: 'Mexico' },
  { code: 'JP', name: 'Japan' },
  { code: 'KR', name: 'South Korea' },
  { code: 'SA', name: 'Saudi Arabia' },
  { code: 'AE', name: 'UAE' },
  { code: 'EG', name: 'Egypt' },
  { code: 'NG', name: 'Nigeria' },
  { code: 'ZA', name: 'South Africa' },
  { code: 'AR', name: 'Argentina' },
  { code: 'IT', name: 'Italy' },
  { code: 'ES', name: 'Spain' },
  { code: 'NL', name: 'Netherlands' },
  { code: 'SE', name: 'Sweden' },
  { code: 'SG', name: 'Singapore' },
  { code: 'MY', name: 'Malaysia' },
  { code: 'PH', name: 'Philippines' },
  { code: 'NO', name: 'Norway' },
];

export function FiltersPanel() {
  const { 
    genderFilter, setGenderFilter, 
    preferCountries, addPreferCountry, removePreferCountry,
    blockCountries, addBlockCountry, removeBlockCountry,
    clearAllFilters 
  } = useFilterStore();

  const [activeDropdown, setActiveDropdown] = useState<'prefer' | 'block' | null>(null);

  const filterCount = (genderFilter !== 'all' ? 1 : 0) + preferCountries.length + blockCountries.length;

  return (
    <div className="w-full mt-2 p-5 bg-[#0C0C0C] border border-zinc-800 rounded-[16px] animate-slideDown flex flex-col gap-6 shadow-xl">
      {/* Gender Filter */}
      <div className="flex flex-col gap-2">
        <label className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Gender Preference</label>
        <div className="flex border border-zinc-700 rounded-xl overflow-hidden p-1 bg-zinc-900">
          {(['all', 'male', 'female'] as const).map(g => (
            <button
              key={g}
              onClick={() => setGenderFilter(g)}
              className={cn(
                "flex-1 py-2 text-sm font-medium rounded-lg transition-colors flex items-center justify-center gap-1",
                genderFilter === g ? "bg-orange-500 text-white shadow-sm" : "text-zinc-600 hover:bg-zinc-800 hover:text-zinc-300"
              )}
            >
              {g === 'all' ? 'All' : g === 'male' ? '👨 Male' : '👩 Female'}
            </button>
          ))}
        </div>
      </div>

      {/* Prefer Countries */}
      <div className="flex flex-col gap-2">
        <label className="text-[11px] font-semibold text-emerald-500 uppercase tracking-wider flex items-center gap-1">
          ✓ Prefer countries
        </label>
        
        {preferCountries.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-1">
            {preferCountries.map(code => (
              <div key={code} className="flex items-center gap-1.5 px-2.5 py-1 bg-zinc-900 border border-emerald-500/50 rounded-lg text-sm">
                <Flag code={code} />
                <span className="text-zinc-100">{COUNTRY_LIST.find(c => c.code === code)?.name || code}</span>
                <button onClick={() => removePreferCountry(code)} className="text-zinc-500 hover:text-[#ef4444] ml-1">✕</button>
              </div>
            ))}
          </div>
        )}

        <div className="relative">
          <button 
            onClick={() => setActiveDropdown(activeDropdown === 'prefer' ? null : 'prefer')}
            className="flex items-center gap-2 text-sm text-emerald-500 hover:text-[#4ade80] transition-colors"
          >
            <span className="w-5 h-5 rounded flex items-center justify-center bg-emerald-500/10 border border-[#22c55e]/20 font-bold">+</span>
            Add preferred country...
          </button>
          
          {activeDropdown === 'prefer' && (
            <div className="absolute top-full left-0 mt-2 w-full max-h-48 overflow-y-auto bg-[#1a1a2e] border border-zinc-700 rounded-xl shadow-2xl z-20">
              {COUNTRY_LIST.filter(c => !preferCountries.includes(c.code) && !blockCountries.includes(c.code)).map(c => (
                <button
                  key={c.code}
                  onClick={() => { addPreferCountry(c.code); setActiveDropdown(null); }}
                  className="w-full flex items-center gap-3 px-4 py-3 hover:bg-zinc-700 transition-colors text-left"
                >
                  <Flag code={c.code} />
                  <span className="text-zinc-100 text-sm">{c.name}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Block Countries */}
      <div className="flex flex-col gap-2">
        <label className="text-[11px] font-semibold text-[#ef4444] uppercase tracking-wider flex items-center gap-1">
          🚫 Block countries
        </label>
        
        {blockCountries.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-1">
            {blockCountries.map(code => (
              <div key={code} className="flex items-center gap-1.5 px-2.5 py-1 bg-[#1a0808] border border-[#ef4444]/50 rounded-lg text-sm">
                <Flag code={code} />
                <span className="text-zinc-100">{COUNTRY_LIST.find(c => c.code === code)?.name || code}</span>
                <button onClick={() => removeBlockCountry(code)} className="text-[#ef4444] hover:text-[#f87171] ml-1">✕</button>
              </div>
            ))}
          </div>
        )}

        <div className="relative">
          <button 
            onClick={() => setActiveDropdown(activeDropdown === 'block' ? null : 'block')}
            className="flex items-center gap-2 text-sm text-[#ef4444] hover:text-[#f87171] transition-colors"
          >
            <span className="w-5 h-5 rounded flex items-center justify-center bg-[#ef4444]/10 border border-[#ef4444]/20 font-bold">+</span>
            Block a country...
          </button>
          
          {activeDropdown === 'block' && (
            <div className="absolute top-full left-0 mt-2 w-full max-h-48 overflow-y-auto bg-[#1a1a2e] border border-zinc-700 rounded-xl shadow-2xl z-20">
              {COUNTRY_LIST.filter(c => !blockCountries.includes(c.code) && !preferCountries.includes(c.code)).map(c => (
                <button
                  key={c.code}
                  onClick={() => { addBlockCountry(c.code); setActiveDropdown(null); }}
                  className="w-full flex items-center gap-3 px-4 py-3 hover:bg-zinc-700 transition-colors text-left"
                >
                  <Flag code={c.code} />
                  <span className="text-zinc-100 text-sm">{c.name}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {filterCount > 0 && (
        <button 
          onClick={clearAllFilters}
          className="text-sm text-[#ef4444] hover:underline self-end font-medium pt-2"
        >
          ✕ Clear all filters
        </button>
      )}
    </div>
  );
}
