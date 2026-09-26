'use client';
import { useMemo, useRef, useState } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { ContactShadows, Environment, Lightformer, OrbitControls } from '@react-three/drei';
import { Bloom, EffectComposer } from '@react-three/postprocessing';
import * as THREE from 'three';
import { Chess, type Square } from 'chess.js';
import { ChessPiece3D } from '@/components/three/shared';
import type { BoardProps } from '../BoardRoom';

const FILES = 'abcdefgh';
const toXZ = (sq: string): [number, number] => [FILES.indexOf(sq[0]) - 3.5, 3.5 - (Number(sq[1]) - 1)];

function AnimatedPiece({ id, type, white, square, onClick }: { id: string; type: string; white: boolean; square: string; onClick: () => void }) {
  const ref = useRef<THREE.Group>(null);
  const [x, z] = toXZ(square);
  useFrame((_, dt) => {
    const g = ref.current;
    if (!g) return;
    const k = 1 - Math.pow(0.0005, dt);
    const dx = x - g.position.x, dz = z - g.position.z;
    g.position.x += dx * k;
    g.position.z += dz * k;
    const dist = Math.hypot(dx, dz);
    g.position.y = Math.min(0.6, dist * 0.35); // little hop while moving
  });
  return (
    <group ref={ref} position={[x, 0, z]} name={id} onClick={(e) => { e.stopPropagation(); onClick(); }}>
      <ChessPiece3D type={type} white={white} scale={0.46} rotation={[0, white ? 0 : Math.PI, 0]} />
    </group>
  );
}

function Board({ fen, mySide, canMove, lastMove, check, onMove }: BoardProps) {
  const game = useMemo(() => new Chess(fen), [fen]);
  const [sel, setSel] = useState<string | null>(null);
  const myColor = mySide === 0 ? 'w' : mySide === 1 ? 'b' : null;
  const targets = sel && canMove ? (game.moves({ square: sel as Square, verbose: true }) as { to: string }[]).map((m) => m.to) : [];

  // Stable ids so pieces animate between squares: match by (type,color) nearest previous square.
  const prev = useRef<{ id: string; type: string; color: string; square: string }[]>([]);
  const pieces = useMemo(() => {
    const now = game.board().flat().filter(Boolean).map((p) => ({ type: p!.type, color: p!.color, square: p!.square }));
    const used = new Set<string>();
    const out: { id: string; type: string; color: string; square: string }[] = [];
    let counter = prev.current.length ? Math.max(...prev.current.map((p) => Number(p.id.split('-')[1]) || 0)) + 1 : 0;
    for (const p of now) {
      const same = prev.current.find((q) => q.square === p.square && q.type === p.type && q.color === p.color && !used.has(q.id));
      if (same) { used.add(same.id); out.push({ ...p, id: same.id }); }
      else out.push({ ...p, id: '' });
    }
    for (const p of out) {
      if (p.id) continue;
      const [px, pz] = toXZ(p.square);
      const candidates = prev.current.filter((q) => !used.has(q.id) && q.color === p.color && (q.type === p.type || (q.type === 'p' && 'qrbn'.includes(p.type))));
      candidates.sort((a, b) => {
        const [ax, az] = toXZ(a.square), [bx, bz] = toXZ(b.square);
        return Math.hypot(ax - px, az - pz) - Math.hypot(bx - px, bz - pz);
      });
      const c = candidates[0];
      if (c) { used.add(c.id); p.id = c.id; } else p.id = `p-${counter++}`;
    }
    prev.current = out;
    return out;
  }, [game]);

  const click = (square: string) => {
    if (sel && targets.includes(square)) {
      const piece = game.get(sel as Square);
      const promo = piece?.type === 'p' && (square[1] === '8' || square[1] === '1') ? 'q' : '';
      onMove(sel + square + promo);
      setSel(null);
      return;
    }
    const p = game.get(square as Square);
    setSel(p && p.color === myColor ? square : null);
  };

  const kingSq = check ? game.board().flat().find((p) => p && p.type === 'k' && p.color === game.turn())?.square : null;
  const lastSquares = lastMove ? [lastMove.slice(0, 2), lastMove.slice(2, 4)] : [];

  return (
    <group>
      {/* frame */}
      <mesh position={[0, -0.16, 0]} receiveShadow>
        <boxGeometry args={[9.2, 0.3, 9.2]} />
        <meshPhysicalMaterial color="#1a1030" metalness={0.4} roughness={0.35} clearcoat={1} />
      </mesh>
      <mesh position={[0, -0.02, 0]}>
        <boxGeometry args={[8.5, 0.04, 8.5]} />
        <meshStandardMaterial color="#a855f7" emissive="#a855f7" emissiveIntensity={0.9} />
      </mesh>
      {Array.from({ length: 64 }, (_, i) => {
        const f = i % 8, r = Math.floor(i / 8);
        const sq = FILES[f] + (r + 1);
        const [x, z] = toXZ(sq);
        const light = (f + r) % 2 === 1;
        const isTarget = targets.includes(sq);
        const isLast = lastSquares.includes(sq);
        const color = sq === kingSq ? '#ef4444' : sq === sel ? '#22d3ee' : isLast ? (light ? '#f7e27a' : '#c9ad3c') : light ? '#e7e2f7' : '#5b4bb8';
        return (
          <group key={sq} position={[x, 0, z]}>
            <mesh receiveShadow onClick={(e) => { e.stopPropagation(); click(sq); }}>
              <boxGeometry args={[1, 0.05, 1]} />
              <meshStandardMaterial color={color} roughness={0.35} metalness={0.1} emissive={sq === kingSq ? '#ef4444' : '#000'} emissiveIntensity={sq === kingSq ? 0.6 : 0} />
            </mesh>
            {isTarget && (
              <mesh position={[0, 0.04, 0]} rotation={[-Math.PI / 2, 0, 0]}>
                <ringGeometry args={[0.16, 0.26, 32]} />
                <meshBasicMaterial color="#22d3ee" toneMapped={false} />
              </mesh>
            )}
          </group>
        );
      })}
      {pieces.map((p) => (
        <AnimatedPiece key={p.id} id={p.id} type={p.type} white={p.color === 'w'} square={p.square} onClick={() => click(p.square)} />
      ))}
    </group>
  );
}

export default function ChessBoard3D(props: BoardProps) {
  const black = props.mySide === 1;
  return (
    <Canvas shadows dpr={[1, 1.75]} camera={{ position: [0, 10.5, black ? -7.5 : 7.5], fov: 45 }} gl={{ toneMappingExposure: 0.85 }}>
      <color attach="background" args={['#07071a']} />
      <ambientLight intensity={0.25} />
      <directionalLight position={[4, 10, 5]} intensity={1.1} castShadow shadow-mapSize={[1024, 1024]} />
      <pointLight position={[-6, 4, -4]} intensity={30} color="#22d3ee" />
      <pointLight position={[6, 4, 4]} intensity={25} color="#ec4899" />
      <Environment resolution={128}>
        <Lightformer form="rect" intensity={1.2} position={[0, 6, 0]} rotation-x={Math.PI / 2} scale={[10, 10, 1]} />
        <Lightformer form="rect" intensity={1.5} position={[-6, 2, 0]} scale={[2, 6, 1]} color="#a855f7" />
      </Environment>
      <Board {...props} />
      <ContactShadows position={[0, -0.32, 0]} opacity={0.5} scale={14} blur={2.4} far={4} />
      <OrbitControls enablePan={false} minDistance={7} maxDistance={16} maxPolarAngle={Math.PI / 2.3} target={[0, 0, 0]} />
      <EffectComposer multisampling={0}>
        <Bloom intensity={0.6} luminanceThreshold={0.6} mipmapBlur />
      </EffectComposer>
    </Canvas>
  );
}
