'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { A, FPS, TetrisEngine, type Action, type EngineOptions, type InputEvent, type TetrisEvent } from '@shared/tetris.ts';
import { loadKeys, type KeyMap } from './controls';

const STEP_MS = 1000 / FPS;
const HELD: Action[] = [A.LEFT, A.RIGHT, A.SOFT];

export interface LoopOptions {
  options: EngineOptions | null; // null = not started
  paused?: boolean;
  onEvents?: (events: TetrisEvent[], engine: TetrisEngine, inputLog: InputEvent[]) => void;
  onFrame?: (engine: TetrisEngine) => void; // called after each simulated frame (versus uses it)
  keys?: KeyMap;
}

/**
 * Runs a TetrisEngine at a fixed 60 Hz from requestAnimationFrame and records every input with
 * the frame it applied to, so the game can be replayed exactly on the server.
 */
export function useTetrisLoop({ options, paused = false, onEvents, onFrame, keys }: LoopOptions) {
  const engine = useRef<TetrisEngine | null>(null);
  const log = useRef<InputEvent[]>([]);
  const queue = useRef<{ a: Action; d: boolean }[]>([]);
  const held = useRef<Set<Action>>(new Set());
  const [version, setVersion] = useState(0); // bumps when a new engine is created
  const pausedRef = useRef(paused);
  pausedRef.current = paused;
  const cb = useRef({ onEvents, onFrame });
  cb.current = { onEvents, onFrame };
  const keyMap = useRef<KeyMap>(keys ?? loadKeys());
  if (keys) keyMap.current = keys;

  // (Re)create the engine when options change.
  useEffect(() => {
    if (!options) {
      engine.current = null;
      return;
    }
    engine.current = new TetrisEngine(options);
    log.current = [];
    queue.current = [];
    held.current.clear();
    setVersion((v) => v + 1);
  }, [options]);

  // Keyboard -> action queue.
  useEffect(() => {
    const lookup = (code: string): Action | null => {
      for (const [a, codes] of Object.entries(keyMap.current)) if (codes.includes(code)) return Number(a) as Action;
      return null;
    };
    const down = (e: KeyboardEvent) => {
      const a = lookup(e.code);
      if (a === null || !engine.current) return;
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return;
      e.preventDefault();
      if (e.repeat || pausedRef.current) return;
      if (held.current.has(a) && HELD.includes(a)) return;
      held.current.add(a);
      queue.current.push({ a, d: true });
      if (!HELD.includes(a)) {
        queue.current.push({ a, d: false });
        held.current.delete(a);
      }
    };
    const up = (e: KeyboardEvent) => {
      const a = lookup(e.code);
      if (a === null || !engine.current) return;
      if (!HELD.includes(a) || !held.current.has(a)) return;
      held.current.delete(a);
      queue.current.push({ a, d: false });
    };
    const blur = () => {
      for (const a of held.current) if (HELD.includes(a)) queue.current.push({ a, d: false });
      held.current.clear();
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', blur);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', blur);
    };
  }, []);

  // Fixed-step simulation.
  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    let acc = 0;
    const tick = (t: number) => {
      raf = requestAnimationFrame(tick);
      const eng = engine.current;
      const dt = Math.min(250, t - last);
      last = t;
      if (!eng || pausedRef.current || eng.over) {
        acc = 0;
        return;
      }
      acc += dt;
      let steps = 0;
      while (acc >= STEP_MS && steps < 12) {
        const batch: InputEvent[] = queue.current.splice(0).map((q) => ({ f: eng.frame, a: q.a, d: q.d }));
        log.current.push(...batch);
        eng.step(batch);
        cb.current.onFrame?.(eng);
        const ev = eng.drainEvents();
        if (ev.length) cb.current.onEvents?.(ev, eng, log.current);
        acc -= STEP_MS;
        steps++;
        if (eng.over) break;
      }
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  /** Push a synthetic input (touch controls). */
  const press = useCallback((a: Action, d: boolean) => {
    if (!engine.current || pausedRef.current) return;
    if (d) held.current.add(a);
    else held.current.delete(a);
    queue.current.push({ a, d });
  }, []);

  return { engine, log, version, press };
}
