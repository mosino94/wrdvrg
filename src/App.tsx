import React, { useEffect } from 'react';
import { HashRouter, Routes, Route } from 'react-router-dom';
import { AppShell } from './components/layout/AppShell';
import { Home } from './pages/Home';
import { Friends } from './pages/Friends';
import { History } from './pages/History';
import { Settings } from './components/layout/Settings';
import { useAppStore } from './store/useAppStore';
import { useCallStore } from './store/useCallStore';
import { genDeviceAlias } from './lib/fingerprint';
import { useMatchmaking } from './hooks/useMatchmaking';
import { useCall } from './hooks/useCall';
import { IncomingRequestPopup } from './components/call/IncomingRequestPopup';
import { getCallSession, clearCallSession } from './lib/callSession';

function GlobalHooks() {
  useMatchmaking();
  useCall();
  return null;
}

export default function App() {
  const { alias, setAlias, setCountryCode, gender, setGender, countryCode, setProfileId } = useAppStore();
  const { setCallState, setRoomDetails, setPeerDetails, setCallDurationBase } = useCallStore();
  const [showGenderModal, setShowGenderModal] = React.useState(false);

  // Session recovery on mount
  useEffect(() => {
    const session = getCallSession();
    if (session?.disconnectedAt) {
      const age = Date.now() - session.disconnectedAt;
      if (age < 30000) {
        setPeerDetails({
          id: session.peerId,
          alias: session.peerAlias,
          country: session.peerCountry,
          gender: session.peerGender,
        });
        setRoomDetails({ id: session.roomId, url: session.roomUrl, token: session.roomToken });
        setCallDurationBase(session.elapsedSeconds);
        setCallState('connecting');
      } else {
        clearCallSession();
      }
    }
  }, []);

  useEffect(() => {
    let currentAlias = alias;
    if (!currentAlias) {
      currentAlias = genDeviceAlias();
      setAlias(currentAlias);
    }

    if (!gender && localStorage.getItem('whisper_gender_prompted') !== 'true') {
      setShowGenderModal(true);
    }

    const detectCountry = async () => {
      let finalCountry = 'US';
      try {
        const r = await fetch('https://ipworld.info/api/ip/self_country');
        if (r.ok) {
          const d = await r.text();
          if (d && d.trim().length === 2) finalCountry = d.trim().toUpperCase();
        }
      } catch {
        try {
          const r2 = await fetch('https://ip2c.org/self');
          const d2 = await r2.text();
          if (d2?.startsWith('1;')) finalCountry = d2.split(';')[1] || 'US';
        } catch {}
      }
      setCountryCode(finalCountry);

      try {
        const res = await fetch('/api/sync-profile', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ alias: currentAlias, countryCode: finalCountry, gender }),
        });
        if (res.ok) {
          const profile = await res.json();
          if (profile?.id) setProfileId(profile.id);
        }
      } catch {}
    };

    detectCountry();
  }, [alias]);

  useEffect(() => {
    if (!alias) return;
    fetch('/api/sync-profile', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ alias, countryCode, gender }),
    })
      .then((r) => r.ok && r.json())
      .then((p) => { if (p?.id) setProfileId(p.id); })
      .catch(() => {});
  }, [gender]);

  return (
    <HashRouter>
      <GlobalHooks />
      <IncomingRequestPopup />
      <Routes>
        <Route element={<AppShell />}>
          <Route path="/" element={<Home />} />
          <Route path="/friends" element={<Friends />} />
          <Route path="/history" element={<History />} />
          <Route path="/settings" element={<Settings />} />
        </Route>
      </Routes>

      {showGenderModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="bg-[#0C0C0C] border border-zinc-800 rounded-2xl w-full max-w-sm p-6 text-center animate-fadeUp">
            <h2 className="text-xl font-bold mb-2">Welcome!</h2>
            <p className="text-zinc-400 text-sm mb-6">Before you start connecting, what's your gender?</p>
            <div className="flex gap-2 justify-center mb-6">
              <button
                onClick={() => { setGender('male'); setShowGenderModal(false); localStorage.setItem('whisper_gender_prompted', 'true'); }}
                className="flex-1 py-3 bg-zinc-900 border border-zinc-800 hover:border-orange-500 hover:bg-orange-500/10 rounded-xl transition-all font-medium flex flex-col items-center gap-1"
              >
                <span className="text-2xl">👨</span> Male
              </button>
              <button
                onClick={() => { setGender('female'); setShowGenderModal(false); localStorage.setItem('whisper_gender_prompted', 'true'); }}
                className="flex-1 py-3 bg-zinc-900 border border-zinc-800 hover:border-orange-500 hover:bg-orange-500/10 rounded-xl transition-all font-medium flex flex-col items-center gap-1"
              >
                <span className="text-2xl">👩</span> Female
              </button>
            </div>
            <button
              onClick={() => { setShowGenderModal(false); localStorage.setItem('whisper_gender_prompted', 'true'); }}
              className="text-zinc-500 hover:text-zinc-300 text-sm underline underline-offset-4"
            >
              Skip, keep it private
            </button>
          </div>
        </div>
      )}
    </HashRouter>
  );
}
