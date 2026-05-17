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

  setCallState: (state: CallState) => void;
  setRoomDetails: (details: { id: string; url: string; token: string }) => void;
  setPeerDetails: (details: { id: string; alias: string; country: string | null; gender: string | null } | null) => void;
  setReconnecting: (isReconnecting: boolean) => void;
  setAutoConnect: (autoConnect: boolean) => void;
  setIsMuted: (v: boolean) => void;
  requestToggleMute: () => void;
  clearToggleMuteRequest: () => void;
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
    }),
}));
