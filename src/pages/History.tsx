import React, { useEffect, useState } from 'react';
import { supabase } from '@/src/lib/supabase';
import { useAppStore } from '@/src/store/useAppStore';
import { Flag } from '@/src/components/ui/Flag';
import { Phone, Plus } from 'lucide-react';

interface HistoryRecord {
  id: string;
  peerAlias: string;
  peerCountry: string | null;
  peerGender: string | null;
  durationSeconds: number;
  calledAt: string;
}

export function History() {
  const { alias } = useAppStore();
  const [history, setHistory] = useState<HistoryRecord[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    
    const loadHistory = async () => {
      try {
        const { data: myProfile } = await supabase.from('profiles').select('id').eq('alias', alias).single();
        if (!myProfile) return;

        const { data: historyData } = await supabase
          .from('call_history')
          .select('*')
          .eq('owner_id', myProfile.id)
          .order('called_at', { ascending: false })
          .limit(15);

        if (active && historyData) {
          setHistory(historyData.map(h => ({
            id: h.id,
            peerAlias: h.peer_alias,
            peerCountry: h.peer_country,
            peerGender: h.peer_gender,
            durationSeconds: h.duration_seconds,
            calledAt: h.called_at
          })));
        }
      } catch (err) {
        console.error("Failed to load history", err);
      } finally {
        if (active) setLoading(false);
      }
    };

    if (alias) loadHistory();

    return () => { active = false; };
  }, [alias]);

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const getTimeAgo = (dateString: string) => {
    const minDiff = Math.floor((new Date().getTime() - new Date(dateString).getTime()) / 60000);
    if (minDiff < 60) return `${minDiff}m ago`;
    const hourDiff = Math.floor(minDiff / 60);
    if (hourDiff < 24) return `${hourDiff}h ago`;
    return `${Math.floor(hourDiff / 24)}d ago`;
  };

  if (loading) {
    return <div className="flex items-center justify-center h-full"><div className="w-6 h-6 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" /></div>;
  }

  return (
    <div className="flex-1 w-full max-w-3xl mx-auto p-4 flex flex-col gap-6 h-full text-zinc-100 overflow-y-auto pb-24">
      <h1 className="text-2xl font-bold">Call History</h1>

      {history.length === 0 ? (
        <div className="flex flex-col items-center justify-center p-12 text-center border border-zinc-800 rounded-xl bg-[#0C0C0C] mt-8">
          <div className="w-16 h-16 bg-zinc-900 rounded-full flex items-center justify-center text-2xl mb-4">⏱️</div>
          <h3 className="text-lg font-semibold mb-2">No calls yet</h3>
          <p className="text-sm text-zinc-500">Your last 15 calls will appear here.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {history.map(record => (
            <div key={record.id} className="flex items-center justify-between p-4 bg-[#0C0C0C] border border-zinc-800 rounded-xl flex-wrap gap-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-zinc-900 border border-zinc-700 flex items-center justify-center overflow-hidden">
                  {record.peerCountry ? <Flag code={record.peerCountry} size={30} /> : <span className="text-xs">?</span>}
                </div>
                
                <div className="flex flex-col">
                  <div className="flex items-center gap-1.5">
                    <span className="font-bold">{record.peerAlias}</span>
                    {record.peerGender === 'male' && <span className="text-xs">👨</span>}
                    {record.peerGender === 'female' && <span className="text-xs">👩</span>}
                  </div>
                  <div className="text-xs text-zinc-500 flex items-center gap-1">
                    {record.peerCountry && <span>{record.peerCountry} ·</span>}
                    <span>{getTimeAgo(record.calledAt)} ·</span>
                    <span className="font-mono text-orange-500">{formatDuration(record.durationSeconds)}</span>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2 w-full sm:w-auto">
                <button className="flex-1 sm:flex-none px-3 py-1.5 bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2">
                  <Plus size={14} /> Add friend
                </button>
                <button className="flex-1 sm:flex-none px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-white rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2">
                  <Phone size={14} /> Call back
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
