'use client';
// Reusable procedural 3D pieces (no model downloads): tetrominoes, chess pieces, xiangqi discs, dice.
import * as THREE from 'three';
import { useMemo } from 'react';
import { RoundedBox } from '@react-three/drei';
import type { ThreeElements } from '@react-three/fiber';

export const NEON = {
  I: '#22d3ee', O: '#facc15', T: '#a855f7', S: '#22c55e', Z: '#ef4444', J: '#3b82f6', L: '#f97316', G: '#64748b',
};

const TETRO: Record<string, [number, number][]> = {
  I: [[0, 0], [1, 0], [2, 0], [3, 0]],
  O: [[0, 0], [1, 0], [0, 1], [1, 1]],
  T: [[0, 0], [1, 0], [2, 0], [1, 1]],
  S: [[1, 0], [2, 0], [0, 1], [1, 1]],
  Z: [[0, 0], [1, 0], [1, 1], [2, 1]],
  J: [[0, 0], [0, 1], [1, 1], [2, 1]],
  L: [[2, 0], [0, 1], [1, 1], [2, 1]],
};

export function NeonBlock({ color, position, size = 0.94, emissive = 0.55 }: { color: string; position: [number, number, number]; size?: number; emissive?: number }) {
  return (
    <RoundedBox args={[size, size, size]} radius={0.12} smoothness={3} position={position}>
      <meshStandardMaterial color={color} emissive={color} emissiveIntensity={emissive} metalness={0.35} roughness={0.22} />
    </RoundedBox>
  );
}

export function Tetromino({ type, ...props }: { type: keyof typeof TETRO } & ThreeElements['group']) {
  const cells = TETRO[type];
  const cx = cells.reduce((s, c) => s + c[0], 0) / 4;
  const cy = cells.reduce((s, c) => s + c[1], 0) / 4;
  const color = NEON[type as keyof typeof NEON];
  return (
    <group {...props}>
      {cells.map(([x, y], i) => <NeonBlock key={i} color={color} position={[x - cx, -(y - cy), 0]} />)}
    </group>
  );
}

// ---------- chess pieces (lathe profiles) ----------
function lathe(points: [number, number][], segments = 48) {
  const g = new THREE.LatheGeometry(points.map(([x, y]) => new THREE.Vector2(x, y)), segments);
  g.computeVertexNormals();
  return g;
}
const BASE: [number, number][] = [[0, 0], [0.62, 0], [0.62, 0.1], [0.52, 0.16], [0.5, 0.26], [0.36, 0.34]];
export const PROFILES: Record<string, [number, number][]> = {
  p: [...BASE, [0.24, 0.5], [0.2, 0.78], [0.3, 0.82], [0.22, 0.88], [0.3, 1.02], [0.3, 1.14], [0.2, 1.26], [0, 1.3]],
  r: [...BASE, [0.34, 0.6], [0.32, 1.05], [0.44, 1.1], [0.44, 1.38], [0.3, 1.38], [0.3, 1.3], [0, 1.3]],
  b: [...BASE, [0.24, 0.6], [0.2, 1.0], [0.32, 1.06], [0.22, 1.12], [0.3, 1.32], [0.2, 1.56], [0.08, 1.66], [0.1, 1.74], [0, 1.78]],
  q: [...BASE, [0.26, 0.7], [0.2, 1.2], [0.36, 1.26], [0.24, 1.34], [0.42, 1.74], [0.3, 1.8], [0.12, 1.84], [0.12, 1.92], [0, 1.96]],
  k: [...BASE, [0.28, 0.7], [0.22, 1.25], [0.38, 1.3], [0.26, 1.4], [0.4, 1.8], [0.32, 1.86], [0.12, 1.9], [0, 1.9]],
};

export function useLathe(type: string) {
  return useMemo(() => lathe(PROFILES[type] || PROFILES.p), [type]);
}

/** Knight silhouette extruded from a 2D path. */
export function useKnightGeometry() {
  return useMemo(() => {
    const s = new THREE.Shape();
    const pts: [number, number][] = [
      [-0.42, 0], [0.42, 0], [0.42, 0.14], [0.3, 0.2], [0.34, 0.5], [0.4, 0.9], [0.36, 1.2], [0.22, 1.42],
      [0.06, 1.56], [-0.02, 1.7], [-0.1, 1.54], [-0.3, 1.44], [-0.52, 1.18], [-0.56, 1.04], [-0.44, 0.96],
      [-0.2, 1.02], [-0.06, 0.86], [-0.3, 0.52], [-0.32, 0.2], [-0.42, 0.14],
    ];
    s.moveTo(pts[0][0], pts[0][1]);
    for (const [x, y] of pts.slice(1)) s.lineTo(x, y);
    s.closePath();
    const g = new THREE.ExtrudeGeometry(s, { depth: 0.46, bevelEnabled: true, bevelThickness: 0.1, bevelSize: 0.08, bevelSegments: 5, curveSegments: 12 });
    g.translate(0, 0, -0.23);
    g.computeVertexNormals();
    return g;
  }, []);
}

export function ChessPiece3D({ type, white, ...props }: { type: string; white: boolean } & ThreeElements['group']) {
  const lat = useLathe(type === 'n' ? 'p' : type);
  const knight = useKnightGeometry();
  const base = useMemo(() => lathe(BASE), []);
  const mat = useMemo(
    () => new THREE.MeshPhysicalMaterial({
      color: white ? '#e9e1d0' : '#23232f',
      roughness: white ? 0.38 : 0.22,
      metalness: white ? 0.05 : 0.35,
      clearcoat: 1,
      clearcoatRoughness: 0.15,
      sheen: 0.4,
    }),
    [white],
  );
  return (
    <group {...props}>
      {type === 'n' ? (
        <>
          <mesh geometry={base} material={mat} castShadow />
          <mesh geometry={knight} material={mat} position={[0, 0.3, 0]} scale={0.85} castShadow rotation={[0, white ? -Math.PI / 2 : Math.PI / 2, 0]} />
        </>
      ) : (
        <mesh geometry={lat} material={mat} castShadow />
      )}
      {type === 'k' && (
        <group position={[0, 2.02, 0]}>
          <mesh material={mat} castShadow><boxGeometry args={[0.08, 0.3, 0.08]} /></mesh>
          <mesh material={mat} position={[0, 0.04, 0]} castShadow><boxGeometry args={[0.24, 0.08, 0.08]} /></mesh>
        </group>
      )}
    </group>
  );
}

// ---------- canvas text textures ----------
const texCache = new Map<string, THREE.CanvasTexture>();
export function textTexture(text: string, fg: string, bg: string, ring = fg, size = 256) {
  const key = `${text}|${fg}|${bg}|${ring}|${size}`;
  const hit = texCache.get(key);
  if (hit) return hit;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d')!;
  g.fillStyle = bg;
  g.beginPath();
  g.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = ring;
  g.lineWidth = size * 0.04;
  g.beginPath();
  g.arc(size / 2, size / 2, size * 0.4, 0, Math.PI * 2);
  g.stroke();
  g.fillStyle = fg;
  g.font = `bold ${size * 0.5}px "KaiTi", "STKaiti", "Noto Serif SC", "SimSun", serif`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, size / 2, size / 2 + size * 0.02);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  texCache.set(key, t);
  return t;
}

export function XiangqiDisc({ char, red, ...props }: { char: string; red: boolean } & ThreeElements['group']) {
  const tex = useMemo(() => textTexture(char, red ? '#c1121f' : '#111827', '#f3e2bf', red ? '#c1121f' : '#111827'), [char, red]);
  return (
    <group {...props}>
      <mesh castShadow>
        <cylinderGeometry args={[0.46, 0.46, 0.2, 48]} />
        <meshPhysicalMaterial color="#e8cf9c" roughness={0.45} clearcoat={0.6} />
      </mesh>
      <mesh position={[0, 0.101, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[0.44, 48]} />
        <meshStandardMaterial map={tex} roughness={0.5} />
      </mesh>
    </group>
  );
}

export function Die3D({ value = 1, ...props }: { value?: number } & ThreeElements['group']) {
  const pips: Record<number, [number, number][]> = {
    1: [[0, 0]], 2: [[-1, -1], [1, 1]], 3: [[-1, -1], [0, 0], [1, 1]], 4: [[-1, -1], [1, -1], [-1, 1], [1, 1]],
    5: [[-1, -1], [1, -1], [0, 0], [-1, 1], [1, 1]], 6: [[-1, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [1, 1]],
  };
  // faces: +y=value, others fixed for looks
  const faces: { v: number; pos: [number, number, number]; rot: [number, number, number] }[] = [
    { v: value, pos: [0, 0.501, 0], rot: [-Math.PI / 2, 0, 0] },
    { v: 7 - value, pos: [0, -0.501, 0], rot: [Math.PI / 2, 0, 0] },
    { v: value === 2 || value === 5 ? 3 : 2, pos: [0, 0, 0.501], rot: [0, 0, 0] },
    { v: value === 2 || value === 5 ? 4 : 5, pos: [0, 0, -0.501], rot: [0, Math.PI, 0] },
    { v: value === 3 || value === 4 ? 1 : 3, pos: [0.501, 0, 0], rot: [0, Math.PI / 2, 0] },
    { v: value === 3 || value === 4 ? 6 : 4, pos: [-0.501, 0, 0], rot: [0, -Math.PI / 2, 0] },
  ];
  return (
    <group {...props}>
      <RoundedBox args={[1, 1, 1]} radius={0.16} smoothness={4} castShadow>
        <meshPhysicalMaterial color="#fbfbff" roughness={0.25} clearcoat={1} />
      </RoundedBox>
      {faces.map((f, i) => (
        <group key={i} position={f.pos} rotation={f.rot}>
          {pips[f.v].map(([x, y], j) => (
            <mesh key={j} position={[x * 0.26, y * 0.26, 0]}>
              <circleGeometry args={[f.v === 1 ? 0.13 : 0.085, 24]} />
              <meshStandardMaterial color={f.v === 1 ? '#dc2626' : '#111'} />
            </mesh>
          ))}
        </group>
      ))}
    </group>
  );
}
