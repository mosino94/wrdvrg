import { create } from 'zustand';

export type CallState = 'idle' | 'searching' | 'matched' | 'connecting' | 'connected' | 'reconnecting';

interface CallStore {
  callState: CallState;
  roomId: string | null;
  roomUrl: string | null;
  roomToken: string | null;
  peerId: string | null;
  peerAlias: string | null;
  peerCountry: string | null;
  peerGender: string | null;
  isReconnecting: boolean;
  autoConnect: boolean;
  isMuted: boolean;
  toggleMuteRequested: boolean;
  partnerMuted: boolean;

  // Timer (Feature 4 — persists through reconnects)
  callTime: number;          // current display value (seconds)
  callElapsedBase: number;   // elapsed saved before reconnect pause

  setCallState: (state: CallState) => void;
  setRoomDetails: (details: { id: string; url: string; token: string }) => void;
  setPeerDetails: (details: { id: string; alias: string; country: string | null; gender: string | null } | null) => void;
  setReconnecting: (isReconnecting: boolean) => void;
  setAutoConnect: (autoConnect: boolean) => void;
  setIsMuted: (v: boolean) => void;
  requestToggleMute: () => void;
  clearToggleMuteRequest: () => void;
  setPartnerMuted: (v: boolean) => void;
  setCallTime: (v: number | ((prev: number) => number)) => void;
  setCallElapsedBase: (v: number) => void;
  clearCall: () => void;
}

export const useCallStore = create<CallStore>((set) => ({
  callState: 'idle',
  roomId: null,
  roomUrl: null,
  roomToken: null,
  peerId: null,
  peerAlias: null,
  peerCountry: null,
  peerGender: null,
  isReconnecting: false,
  autoConnect: true,
  isMuted: false,
  toggleMuteRequested: false,
  partnerMuted: false,
  callTime: 0,
  callElapsedBase: 0,

  setCallState: (callState) => set({ callState }),
  setRoomDetails: ({ id, url, token }) => set({ roomId: id, roomUrl: url, roomToken: token }),
  setPeerDetails: (details) =>
    set(
      details
        ? { peerId: details.id, peerAlias: details.alias, peerCountry: details.country, peerGender: details.gender }
        : { peerId: null, peerAlias: null, peerCountry: null, peerGender: null }
    ),
  setReconnecting: (isReconnecting) => set({ isReconnecting }),
  setAutoConnect: (autoConnect) => set({ autoConnect }),
  setIsMuted: (isMuted) => set({ isMuted }),
  requestToggleMute: () => set({ toggleMuteRequested: true }),
  clearToggleMuteRequest: () => set({ toggleMuteRequested: false }),
  setPartnerMuted: (partnerMuted) => set({ partnerMuted }),
  setCallTime: (v) => set((s) => ({ callTime: typeof v === 'function' ? v(s.callTime) : v })),
  setCallElapsedBase: (callElapsedBase) => set({ callElapsedBase }),
  clearCall: () =>
    set({
      callState: 'idle',
      roomId: null,
      roomUrl: null,
      roomToken: null,
      peerId: null,
      peerAlias: null,
      peerCountry: null,
      peerGender: null,
      isReconnecting: false,
      isMuted: false,
      partnerMuted: false,
      callTime: 0,
      callElapsedBase: 0,
    }),
}));
