const SESSION_KEY = 'wrdvrg_call_session';

export interface CallSession {
  roomId: string;
  roomUrl: string;
  roomToken: string;
  peerId: string;
  peerAlias: string;
  peerCountry: string | null;
  peerGender: string | null;
  elapsedSeconds: number;
  disconnectedAt?: number;
}

export function saveCallSession(session: CallSession) {
  try {
    localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  } catch {}
}

export function updateCallElapsed(elapsedSeconds: number) {
  const session = getCallSession();
  if (session) saveCallSession({ ...session, elapsedSeconds });
}

export function markDisconnected() {
  const session = getCallSession();
  if (session) saveCallSession({ ...session, disconnectedAt: Date.now() });
}

export function getCallSession(): CallSession | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function clearCallSession() {
  try {
    localStorage.removeItem(SESSION_KEY);
  } catch {}
}
