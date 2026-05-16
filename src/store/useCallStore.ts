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
  isMuted: boolean;
  peerMuted: boolean;
  callDurationBase: number;
  autoConnect: boolean;

  setCallState: (state: CallState) => void;
  setRoomDetails: (details: { id: string; url: string; token: string }) => void;
  setPeerDetails: (details: { id: string; alias: string; country: string | null; gender: string | null } | null) => void;
  setMuted: (muted: boolean) => void;
  setPeerMuted: (muted: boolean) => void;
  setCallDurationBase: (base: number) => void;
  setAutoConnect: (autoConnect: boolean) => void;
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
  isMuted: false,
  peerMuted: false,
  callDurationBase: 0,
  autoConnect: true,

  setCallState: (callState) => set({ callState }),
  setRoomDetails: ({ id, url, token }) => set({ roomId: id, roomUrl: url, roomToken: token }),
  setPeerDetails: (details) =>
    set(
      details
        ? { peerId: details.id, peerAlias: details.alias, peerCountry: details.country, peerGender: details.gender }
        : { peerId: null, peerAlias: null, peerCountry: null, peerGender: null }
    ),
  setMuted: (isMuted) => set({ isMuted }),
  setPeerMuted: (peerMuted) => set({ peerMuted }),
  setCallDurationBase: (callDurationBase) => set({ callDurationBase }),
  setAutoConnect: (autoConnect) => set({ autoConnect }),
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
      isMuted: false,
      peerMuted: false,
      callDurationBase: 0,
    }),
}));
