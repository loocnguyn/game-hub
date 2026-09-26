'use client';
// Tiny WebAudio synth: no audio files to download, works offline.
let ctx: AudioContext | null = null;
let muted = false;

try {
  muted = typeof localStorage !== 'undefined' && localStorage.getItem('hub:muted') === '1';
} catch {
  /* storage blocked */
}

export function isMuted() {
  return muted;
}
export function setMuted(m: boolean) {
  muted = m;
  try {
    localStorage.setItem('hub:muted', m ? '1' : '0');
  } catch {
    /* ignore */
  }
}

function ac(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!ctx) {
    const C = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!C) return null;
    ctx = new C();
  }
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  return ctx;
}

function tone(freq: number, dur = 0.08, type: OscillatorType = 'sine', gain = 0.08, slide = 0, delay = 0) {
  if (muted) return;
  const a = ac();
  if (!a) return;
  const t0 = a.currentTime + delay;
  const o = a.createOscillator();
  const g = a.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t0);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq + slide), t0 + dur);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(gain, t0 + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g).connect(a.destination);
  o.start(t0);
  o.stop(t0 + dur + 0.02);
}

function noise(dur = 0.12, gain = 0.08, delay = 0, filterFreq = 1800) {
  if (muted) return;
  const a = ac();
  if (!a) return;
  const t0 = a.currentTime + delay;
  const buf = a.createBuffer(1, Math.floor(a.sampleRate * dur), a.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
  const src = a.createBufferSource();
  src.buffer = buf;
  const f = a.createBiquadFilter();
  f.type = 'lowpass';
  f.frequency.value = filterFreq;
  const g = a.createGain();
  g.gain.value = gain;
  src.connect(f).connect(g).connect(a.destination);
  src.start(t0);
}

export const sfx = {
  click: () => tone(660, 0.05, 'triangle', 0.05),
  move: () => tone(420, 0.03, 'square', 0.025),
  rotate: () => tone(560, 0.04, 'triangle', 0.035, 120),
  drop: () => { tone(160, 0.09, 'sine', 0.12, -80); noise(0.05, 0.05, 0, 900); },
  lock: () => tone(220, 0.05, 'triangle', 0.05),
  hold: () => tone(500, 0.06, 'sine', 0.05, -150),
  clear: (n: number) => [0, 1, 2, 3].slice(0, Math.max(1, n)).forEach((k) => tone(520 + k * 140, 0.12, 'triangle', 0.07, 0, k * 0.05)),
  tetris: () => [523, 659, 784, 1047].forEach((f, k) => tone(f, 0.18, 'sawtooth', 0.05, 0, k * 0.06)),
  tspin: () => [700, 900, 1200].forEach((f, k) => tone(f, 0.1, 'square', 0.04, 0, k * 0.04)),
  garbage: () => { noise(0.18, 0.1, 0, 500); tone(120, 0.15, 'sawtooth', 0.05, -40); },
  levelUp: () => [440, 554, 659, 880].forEach((f, k) => tone(f, 0.12, 'triangle', 0.06, 0, k * 0.07)),
  gameOver: () => [392, 330, 262, 196].forEach((f, k) => tone(f, 0.25, 'sawtooth', 0.05, 0, k * 0.16)),
  win: () => [523, 659, 784, 1047, 1319].forEach((f, k) => tone(f, 0.2, 'triangle', 0.06, 0, k * 0.09)),
  piece: () => { tone(300, 0.04, 'triangle', 0.06); noise(0.04, 0.04, 0, 2400); },
  capture: () => { tone(200, 0.08, 'square', 0.05); noise(0.08, 0.08, 0, 1500); },
  check: () => [880, 660].forEach((f, k) => tone(f, 0.1, 'square', 0.04, 0, k * 0.08)),
  tick: () => tone(1200, 0.02, 'square', 0.03),
  lowTime: () => tone(990, 0.06, 'square', 0.05),
  notify: () => [660, 990].forEach((f, k) => tone(f, 0.1, 'sine', 0.06, 0, k * 0.1)),
  chip: () => { tone(1800, 0.03, 'triangle', 0.04); tone(2400, 0.03, 'triangle', 0.03, 0, 0.03); },
  dice: () => { for (let k = 0; k < 6; k++) noise(0.04, 0.06, k * 0.07, 3000); },
  card: () => noise(0.06, 0.06, 0, 4000),
  reveal: () => tone(300, 0.2, 'sine', 0.08, 400),
  boom: () => { noise(0.6, 0.25, 0, 700); tone(90, 0.5, 'sawtooth', 0.08, -60); },
  cash: () => [1319, 1568, 2093].forEach((f, k) => tone(f, 0.1, 'triangle', 0.05, 0, k * 0.05)),
  flag: () => tone(700, 0.05, 'triangle', 0.05, -200),
  pop: () => tone(900, 0.04, 'sine', 0.05, 300),
};
