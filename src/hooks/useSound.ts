import { useCallback } from 'react';

export function useSound() {
  const playMatchConnected = useCallback(() => {
    if (document.hidden) return;
    try {
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const playFreq = (freq: number, startTime: number, _duration: number) => {
        const osc = ctx.createOscillator();
        const gainNode = ctx.createGain();
        osc.frequency.value = freq;
        osc.type = 'sine';
        osc.connect(gainNode);
        gainNode.connect(ctx.destination);
        
        gainNode.gain.setValueAtTime(0.2, startTime);
        gainNode.gain.exponentialRampToValueAtTime(0.001, startTime + 0.6);
        
        osc.start(startTime);
        osc.stop(startTime + 0.6);
      };

      const now = ctx.currentTime;
      playFreq(523, now, 0.6); // C5
      playFreq(659, now + 0.1, 0.6); // E5
      playFreq(784, now + 0.2, 0.6); // G5
    } catch (err) {
      console.warn('Audio play failed', err);
    }
  }, []);

  const playFriendOnline = useCallback(() => {
    if (document.hidden) return;
    try {
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const playFreq = (freq: number, startTime: number) => {
        const osc = ctx.createOscillator();
        const gainNode = ctx.createGain();
        osc.frequency.value = freq;
        osc.type = 'sine';
        osc.connect(gainNode);
        gainNode.connect(ctx.destination);
        
        gainNode.gain.setValueAtTime(0.15, startTime);
        gainNode.gain.linearRampToValueAtTime(0.15, startTime + 0.05); // keep it flat briefly
        gainNode.gain.exponentialRampToValueAtTime(0.001, startTime + 0.25);
        
        osc.start(startTime);
        osc.stop(startTime + 0.25);
      };

      const now = ctx.currentTime;
      playFreq(880, now); // A5
      playFreq(1100, now + 0.08); // C#6
      playFreq(1320, now + 0.18); // E6
    } catch (err) {
      console.warn('Audio play failed', err);
    }
  }, []);

  return { playMatchConnected, playFriendOnline };
}
