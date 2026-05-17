import React from 'react';
import { cn } from '@/src/lib/utils';
import { LogOut, MonitorSmartphone, Volume2, Shield } from 'lucide-react';
import { useAppStore } from '@/src/store/useAppStore';

export function Settings() {
  const { alias, countryCode, gender, setGender, isGuest, username, setAuthModalOpen, logout } = useAppStore();

  return (
    <div className="flex-1 w-full max-w-3xl mx-auto p-4 flex flex-col gap-8 h-full bg-[#080808] text-zinc-100 overflow-y-auto">
      <h1 className="text-2xl font-bold">Settings</h1>

      <section className="bg-[#0C0C0C] border border-zinc-800 rounded-xl p-6">
        <h2 className="text-lg font-semibold mb-4 text-zinc-300">Profile</h2>
        <div className="flex items-center gap-4 mb-6">
          <div className="w-16 h-16 rounded-full bg-gradient-to-tr from-orange-600 to-amber-400 flex items-center justify-center text-xl font-bold shadow-lg">
            {alias?.charAt(0).toUpperCase()}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-lg">{alias}</span>
            </div>
            <p className="text-sm text-zinc-500">{isGuest ? 'Auto-generated · device fingerprint' : 'Custom Screen Name'}</p>
          </div>
        </div>

        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-zinc-300">Country</span>
            <div className="flex items-center gap-2">
              {countryCode && (
                <img
                  src={`https://flagcdn.com/24x18/${countryCode.toLowerCase()}.png`}
                  alt={countryCode}
                  className="w-6 h-4 object-cover rounded"
                />
              )}
              <span className="font-medium">{countryCode || 'Detecting...'}</span>
            </div>
          </div>
          <p className="text-xs text-zinc-500 -mt-2">Auto-detected · cannot be changed</p>

          <div className="flex items-center justify-between pt-4 border-t border-zinc-800">
            <span className="text-zinc-300">Gender</span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setGender('male')}
                className={cn(
                  'px-3 py-1.5 rounded-lg text-sm font-medium transition-all',
                  gender === 'male' ? 'bg-orange-500 text-white' : 'bg-zinc-900 text-zinc-300 hover:bg-zinc-800'
                )}
              >
                👨 Male
              </button>
              <button
                onClick={() => setGender('female')}
                className={cn(
                  'px-3 py-1.5 rounded-lg text-sm font-medium transition-all',
                  gender === 'female' ? 'bg-orange-500 text-white' : 'bg-zinc-900 text-zinc-300 hover:bg-zinc-800'
                )}
              >
                👩 Female
              </button>
              <button
                onClick={() => setGender(null)}
                className={cn(
                  'px-3 py-1.5 rounded-lg text-sm font-medium transition-all',
                  gender === null ? 'bg-orange-500 text-white' : 'bg-zinc-900 text-zinc-300 hover:bg-zinc-800'
                )}
              >
                🔒 Private
              </button>
            </div>
          </div>
        </div>
      </section>

      <section className="bg-[#0C0C0C] border border-zinc-800 rounded-xl p-6">
        <h2 className="text-lg font-semibold mb-4 text-zinc-300 flex items-center gap-2">
          <Volume2 size={18} /> Audio
        </h2>
        <div className="flex items-center justify-between">
          <span>Sound effects</span>
          <button className="w-12 h-6 bg-orange-500 rounded-full relative transition-all">
            <div className="absolute right-1 top-1 bottom-1 w-4 bg-white rounded-full shadow-sm" />
          </button>
        </div>
      </section>

      <section className="bg-[#0C0C0C] border border-zinc-800 rounded-xl p-6">
        <h2 className="text-lg font-semibold mb-4 text-zinc-300 flex items-center gap-2">
          <Shield size={18} /> Privacy
        </h2>
        <div className="flex items-center justify-between">
          <span>📞 Accept callbacks from non-friends</span>
          <button className="w-12 h-6 bg-orange-500 rounded-full relative transition-all">
            <div className="absolute right-1 top-1 bottom-1 w-4 bg-white rounded-full shadow-sm" />
          </button>
        </div>
      </section>

      <section className="bg-[#0C0C0C] border border-zinc-800 rounded-xl p-6">
        <h2 className="text-lg font-semibold mb-4 text-zinc-300">Account Sync</h2>
        {isGuest ? (
          <div className="space-y-3">
            <p className="text-sm text-zinc-500">Log in or create an account to sync your friends and history across devices.</p>
            <button
              onClick={() => setAuthModalOpen(true)}
              className="w-full py-3 bg-orange-500 hover:bg-orange-600 text-white rounded-lg font-medium transition-colors"
            >
              Create Account / Log In
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-zinc-400 mb-4">Logged in as <strong className="text-zinc-100">{username}</strong></p>
            <button className="w-full py-3 bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 text-white rounded-lg font-medium flex items-center justify-center gap-2 transition-colors">
              <MonitorSmartphone size={18} /> Active devices
            </button>
            <button
              onClick={logout}
              className="w-full py-3 bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 text-white rounded-lg font-medium flex items-center justify-center gap-2 transition-colors"
            >
              <LogOut size={18} /> Logout
            </button>
            <button className="w-full py-3 mt-4 bg-[rgba(69,10,10,0.4)] hover:bg-[#3f0f0f] border border-[rgba(127,29,29,0.5)] text-[#ef4444] rounded-lg font-medium transition-colors">
              Delete account
            </button>
          </div>
        )}
      </section>
    </div>
  );
}
