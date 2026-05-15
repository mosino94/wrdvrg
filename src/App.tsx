import React, { useEffect } from 'react';
import { HashRouter, Routes, Route } from 'react-router-dom';
import { AppShell } from './components/layout/AppShell';
import { Home } from './pages/Home';
import { Friends } from './pages/Friends';
import { History } from './pages/History';
import { Settings } from './components/layout/Settings';
import { useAppStore } from './store/useAppStore';
import { genDeviceAlias } from './lib/fingerprint';
import { useMatchmaking } from './hooks/useMatchmaking';
import { useCall } from './hooks/useCall';

// Component to run global hooks without breaking React Router setup
function GlobalHooks() {
  useMatchmaking();
  useCall();
  return null;
}

export default function App() {
  const { alias, setAlias, setCountryCode, gender, setGender, countryCode } = useAppStore();
  const [showGenderModal, setShowGenderModal] = React.useState(false);
  const [profileSynced, setProfileSynced] = React.useState(false);

  useEffect(() => {
    // 1. Alias Generation
    let currentAlias = alias;
    if (!currentAlias) {
      currentAlias = genDeviceAlias();
      setAlias(currentAlias);
    }

    if (!gender && localStorage.getItem('whisper_gender_prompted') !== 'true') {
      setShowGenderModal(true);
    }

    // 2. Country detection
    const detectCountry = async () => {
      let finalCountry = 'US';
      try {
        const r = await fetch('https://ipworld.info/api/ip/self_country'); // returns "US" directly
        if (r.ok) {
           const d = await r.text();
           if (d && d.trim().length === 2) finalCountry = d.trim().toUpperCase();
        }
      } catch (e) {
        try {
          const r0 = await fetch('https://ip2c.org/self');
          const d0 = await r0.text();
          if (d0 && d0.startsWith('1;')) {
            const code = d0.split(';')[1];
            if (code) finalCountry = code;
          }
        } catch (e) {
           finalCountry = navigator.language.split('-')[1]?.toUpperCase() || navigator.language.substring(0, 2).toUpperCase() || 'US';
        }
      }
      setCountryCode(finalCountry);
      
      // Sync DB Profile
      try {
        await fetch('/api/sync-profile', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ alias: currentAlias, countryCode: finalCountry, gender })
        });
        setProfileSynced(true);
      } catch (e) {
         console.error(e);
         // Fallback allow app to load
         setProfileSynced(true);
      }
    };
    detectCountry();
  }, [alias, setAlias, setCountryCode]);

  useEffect(() => {
    // If gender changes later (e.g. from modal), sync again to save
    if (profileSynced && alias) {
       fetch('/api/sync-profile', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ alias, countryCode, gender })
       }).catch(() => {});
    }
  }, [gender, profileSynced]);

  return (
    <HashRouter>
      <GlobalHooks />
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
