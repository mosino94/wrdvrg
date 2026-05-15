import { create } from 'zustand';

interface AppState {
  alias: string | null;
  gender: 'male' | 'female' | null;
  countryCode: string | null;
  isGuest: boolean;
  username: string | null;
  authModalOpen: boolean;

  setAlias: (alias: string) => void;
  setGender: (gender: 'male' | 'female' | null) => void;
  setCountryCode: (code: string) => void;
  setAuthModalOpen: (open: boolean) => void;
  login: (username: string, alias: string, isGuest?: boolean) => void;
  logout: () => void;
}

export const useAppStore = create<AppState>((set) => ({
  alias: localStorage.getItem('whisper_alias'),
  gender: null, // Will be hydrated from DB or local
  countryCode: null, // Will be set via ipapi
  isGuest: localStorage.getItem('whisper_is_guest') !== 'false',
  username: localStorage.getItem('whisper_username'),
  authModalOpen: false,
  
  setAlias: (alias) => {
    localStorage.setItem('whisper_alias', alias);
    set({ alias });
  },
  setGender: (gender) => set({ gender }),
  setCountryCode: (countryCode) => set({ countryCode }),
  setAuthModalOpen: (authModalOpen) => set({ authModalOpen }),
  
  login: (username, alias, isGuest = false) => {
    localStorage.setItem('whisper_username', username);
    localStorage.setItem('whisper_alias', alias);
    localStorage.setItem('whisper_is_guest', String(isGuest));
    set({ username, alias, isGuest });
  },
  
  logout: () => {
    localStorage.removeItem('whisper_username');
    localStorage.setItem('whisper_is_guest', 'true');
    set({ username: null, isGuest: true });
  }
}));
