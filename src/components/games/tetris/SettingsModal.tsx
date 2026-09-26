'use client';
import { useEffect, useState } from 'react';
import { clsx } from 'clsx';
import { A, type Action } from '@shared/tetris.ts';
import { Button, Modal, Segmented } from '@/components/ui';
import {
  ACTION_LABELS, DEFAULT_HANDLING_MS, DEFAULT_KEYS, keyLabel, loadHandling, loadKeys, loadRender, saveHandling, saveKeys, saveRender,
  type HandlingMs, type KeyMap,
} from './controls';

export function TetrisSettings({ open, onClose, onSaved }: { open: boolean; onClose: () => void; onSaved: () => void }) {
  const [keys, setKeys] = useState<KeyMap>(DEFAULT_KEYS);
  const [handling, setHandling] = useState<HandlingMs>(DEFAULT_HANDLING_MS);
  const [render, setRender] = useState<'3d' | '2d'>('3d');
  const [listening, setListening] = useState<Action | null>(null);

  useEffect(() => {
    if (!open) return;
    setKeys(loadKeys());
    const h = loadHandling();
    setHandling({ ...h, sdf: h.sdf === 0 ? 41 : h.sdf });
    setRender(loadRender().mode);
  }, [open]);

  useEffect(() => {
    if (listening === null) return;
    const k = (e: KeyboardEvent) => {
      e.preventDefault();
      if (e.code !== 'Escape') {
        setKeys((prev) => {
          const next = { ...prev } as KeyMap;
          for (const a of Object.keys(next)) next[Number(a) as Action] = next[Number(a) as Action].filter((c) => c !== e.code);
          next[listening] = [e.code, ...next[listening].filter((c) => c !== e.code)].slice(0, 2);
          return next;
        });
      }
      setListening(null);
    };
    window.addEventListener('keydown', k, { capture: true });
    return () => window.removeEventListener('keydown', k, { capture: true });
  }, [listening]);

  const slider = (label: string, key: keyof HandlingMs, min: number, max: number, step: number, fmt: (v: number) => string) => (
    <label className="block">
      <div className="flex justify-between text-sm"><span>{label}</span><span className="font-mono text-cyan-200">{fmt(handling[key])}</span></div>
      <input type="range" min={min} max={max} step={step} value={handling[key]} onChange={(e) => setHandling({ ...handling, [key]: Number(e.target.value) })} className="w-full accent-cyan-400" />
    </label>
  );

  return (
    <Modal open={open} onClose={onClose} title="Cài đặt Tetris" wide>
      <div className="grid gap-6 md:grid-cols-2">
        <div className="space-y-4">
          <div className="text-xs font-semibold uppercase tracking-wider text-muted">Độ nhạy</div>
          {slider('DAS (giữ bao lâu thì bắt đầu trượt)', 'das', 17, 333, 1, (v) => `${v} ms`)}
          {slider('ARR (tốc độ trượt, 0 = tức thì)', 'arr', 0, 83, 1, (v) => `${v} ms`)}
          {slider('SDF (tốc độ rơi nhanh, 41 = tức thì)', 'sdf', 5, 41, 1, (v) => (v >= 41 ? 'tức thì' : `x${v}`))}
          <div className="text-xs font-semibold uppercase tracking-wider text-muted">Đồ họa</div>
          <Segmented value={render} onChange={setRender} options={[{ value: '3d', label: '3D (đẹp)' }, { value: '2d', label: '2D (nhẹ)' }]} />
        </div>
        <div>
          <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted">Phím (bấm để đổi)</div>
          <div className="space-y-1.5">
            {([A.LEFT, A.RIGHT, A.SOFT, A.HARD, A.CW, A.CCW, A.R180, A.HOLD] as Action[]).map((a) => (
              <button
                key={a}
                onClick={() => setListening(a)}
                className={clsx('flex w-full items-center justify-between rounded-xl border px-3 py-2 text-sm transition', listening === a ? 'border-cyan-400 bg-cyan-400/10' : 'border-white/10 bg-white/[0.03] hover:bg-white/[0.07]')}
              >
                <span>{ACTION_LABELS[a]}</span>
                <span className="flex gap-1">
                  {listening === a ? <span className="text-cyan-200">Bấm phím…</span> : keys[a].map((c) => <kbd key={c} className="rounded bg-white/10 px-2 py-0.5 font-mono text-xs">{keyLabel(c)}</kbd>)}
                </span>
              </button>
            ))}
          </div>
        </div>
      </div>
      <div className="mt-6 flex flex-wrap justify-between gap-2">
        <Button variant="ghost" onClick={() => { setKeys(DEFAULT_KEYS); setHandling(DEFAULT_HANDLING_MS); }}>Khôi phục mặc định</Button>
        <div className="flex gap-2">
          <Button variant="ghost" onClick={onClose}>Hủy</Button>
          <Button onClick={() => {
            saveKeys(keys);
            saveHandling({ ...handling, sdf: handling.sdf >= 41 ? 0 : handling.sdf });
            saveRender({ mode: render });
            onSaved();
            onClose();
          }}>Lưu</Button>
        </div>
      </div>
    </Modal>
  );
}
