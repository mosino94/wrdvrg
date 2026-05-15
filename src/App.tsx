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
  const { alias, setAlias, setCountryCode } = useAppStore();

  useEffect(() => {
    // 1. Alias Generation
    if (!alias) {
      setAlias(genDeviceAlias());
    }

    // 2. Country detection
    const detectCountry = async () => {
      try {
        const r = await fetch('https://ipworld.info/api/ip/self_country'); // returns "US" directly
        if (r.ok) {
           const d = await r.text();
           if (d && d.trim().length === 2) return setCountryCode(d.trim().toUpperCase());
        }
      } catch (e) {}
      try {
        const r0 = await fetch('https://ip2c.org/self');
        const d0 = await r0.text();
        if (d0 && d0.startsWith('1;')) {
          const code = d0.split(';')[1];
          if (code) return setCountryCode(code);
        }
      } catch (e) {}
      try {
        const r1 = await fetch('https://api.country.is/');
        const d1 = await r1.json();
        if (d1.country) return setCountryCode(d1.country);
      } catch (e) {}
      try {
        const r2 = await fetch('https://freeipapi.com/api/json/');
        const d2 = await r2.json();
        if (d2.countryCode) return setCountryCode(d2.countryCode);
      } catch (e) {}
      try {
        const r3 = await fetch('https://get.geojs.io/v1/ip/country.json');
        const d3 = await r3.json();
        if (d3.country) return setCountryCode(d3.country);
      } catch (e) {}
      
      const langCode = navigator.language.split('-')[1]?.toUpperCase() || navigator.language.substring(0, 2).toUpperCase() || 'US';
      setCountryCode(langCode); // fallback
    };
    detectCountry();
  }, [alias, setAlias, setCountryCode]);

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
    </HashRouter>
  );
}
