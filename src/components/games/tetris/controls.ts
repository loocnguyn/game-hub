'use client';
import { A, type Action, type Handling } from '@shared/tetris.ts';

export type KeyMap = Record<Action, string[]>;

export const DEFAULT_KEYS: KeyMap = {
  [A.LEFT]: ['ArrowLeft'],
  [A.RIGHT]: ['ArrowRight'],
  [A.SOFT]: ['ArrowDown'],
  [A.HARD]: ['Space'],
  [A.CW]: ['ArrowUp', 'KeyX'],
  [A.CCW]: ['KeyZ', 'ControlLeft'],
  [A.R180]: ['KeyA'],
  [A.HOLD]: ['KeyC', 'ShiftLeft'],
} as KeyMap;

export const ACTION_LABELS: Record<Action, string> = {
  [A.LEFT]: 'Sang trái',
  [A.RIGHT]: 'Sang phải',
  [A.SOFT]: 'Rơi nhanh',
  [A.HARD]: 'Thả xuống',
  [A.CW]: 'Xoay phải',
  [A.CCW]: 'Xoay trái',
  [A.R180]: 'Xoay 180°',
  [A.HOLD]: 'Giữ khối',
} as Record<Action, string>;

/** Handling in milliseconds (converted to frames for the engine). */
export interface HandlingMs {
  das: number;
  arr: number;
  sdf: number; // 0 = instant
}
export const DEFAULT_HANDLING_MS: HandlingMs = { das: 167, arr: 33, sdf: 20 };

export function toFrames(h: HandlingMs): Handling {
  return { das: Math.max(0, Math.round(h.das / (1000 / 60))), arr: Math.max(0, Math.round(h.arr / (1000 / 60))), sdf: h.sdf };
}

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? { ...fallback, ...JSON.parse(raw) } : fallback;
  } catch {
    return fallback;
  }
}
function write(key: string, v: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(v));
  } catch {
    /* storage blocked */
  }
}

export const loadKeys = (): KeyMap => read('hub:tetris:keys', DEFAULT_KEYS);
export const saveKeys = (k: KeyMap) => write('hub:tetris:keys', k);
export const loadHandling = (): HandlingMs => read('hub:tetris:handling', DEFAULT_HANDLING_MS);
export const saveHandling = (h: HandlingMs) => write('hub:tetris:handling', h);
export const loadRender = (): { mode: '3d' | '2d' } => read('hub:tetris:render', { mode: '3d' as const });
export const saveRender = (r: { mode: '3d' | '2d' }) => write('hub:tetris:render', r);

export function keyLabel(code: string): string {
  const map: Record<string, string> = {
    ArrowLeft: '←', ArrowRight: '→', ArrowUp: '↑', ArrowDown: '↓', Space: 'Space', ShiftLeft: 'Shift', ShiftRight: 'Shift phải',
    ControlLeft: 'Ctrl', ControlRight: 'Ctrl phải', AltLeft: 'Alt', Enter: 'Enter',
  };
  if (map[code]) return map[code];
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  return code;
}
