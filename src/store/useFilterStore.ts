import { create } from 'zustand';

type FilterGender = 'all' | 'male' | 'female';

interface FilterStore {
  genderFilter: FilterGender;
  preferCountries: string[];
  blockCountries: string[];
  setGenderFilter: (filter: FilterGender) => void;
  addPreferCountry: (code: string) => void;
  removePreferCountry: (code: string) => void;
  addBlockCountry: (code: string) => void;
  removeBlockCountry: (code: string) => void;
  clearAllFilters: () => void;
}

export const useFilterStore = create<FilterStore>((set) => ({
  genderFilter: 'all',
  preferCountries: [],
  blockCountries: [],
  
  setGenderFilter: (genderFilter) => set({ genderFilter }),
  addPreferCountry: (code) => set((state) => ({ preferCountries: [...new Set([...state.preferCountries, code])] })),
  removePreferCountry: (code) => set((state) => ({ preferCountries: state.preferCountries.filter(c => c !== code) })),
  addBlockCountry: (code) => set((state) => ({ blockCountries: [...new Set([...state.blockCountries, code])] })),
  removeBlockCountry: (code) => set((state) => ({ blockCountries: state.blockCountries.filter(c => c !== code) })),
  clearAllFilters: () => set({ genderFilter: 'all', preferCountries: [], blockCountries: [] })
}));
