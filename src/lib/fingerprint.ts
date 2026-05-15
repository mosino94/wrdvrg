import { ADJECTIVES, NOUNS } from './constants';

export function genDeviceAlias(): string {
  const seed = [
    navigator.userAgent,
    navigator.language,
    window.screen.width,
    window.screen.height,
    window.screen.colorDepth,
    Intl.DateTimeFormat().resolvedOptions().timeZone,
    navigator.hardwareConcurrency,
    navigator.maxTouchPoints
  ].join("|");

  let h = 0;
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(31, h) + seed.charCodeAt(i) | 0;
  }
  
  const h2 = Math.abs(h);
  const adj = ADJECTIVES[h2 % ADJECTIVES.length];
  const noun = NOUNS[Math.floor(h2 / 30) % 30];
  const num = (h2 % 9000) + 1000;
  
  return `${adj}${noun}${num}`;
}
