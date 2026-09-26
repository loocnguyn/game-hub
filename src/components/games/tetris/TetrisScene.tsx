'use client';
import { useEffect, useMemo, useRef } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Environment, Lightformer, Stars } from '@react-three/drei';
import { Bloom, EffectComposer, Vignette } from '@react-three/postprocessing';
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { H, W, type TetrisEngine, type TetrisEvent } from '@shared/tetris.ts';

export const PIECE_COLORS: Record<number, string> = {
  1: '#22d3ee', // I
  2: '#facc15', // O
  3: '#c084fc', // T
  4: '#4ade80', // S
  5: '#f87171', // Z
  6: '#60a5fa', // J
  7: '#fb923c', // L
  8: '#64748b', // garbage
};
const LEVEL_TINTS = ['#a855f7', '#22d3ee', '#ec4899', '#22c55e', '#f59e0b', '#3b82f6', '#ef4444', '#14b8a6'];
const SHOWN_ROWS = 22; // 20 visible rows + 2 buffer rows peeking above the well
const FIRST_ROW = H - SHOWN_ROWS;
const MAX = W * SHOWN_ROWS + 8;

/** World position of a matrix cell (x right, y down in the matrix). */
const world = (x: number, y: number): [number, number, number] => [x - (W - 1) / 2, H - 1 - y - (20 - 1) / 2, 0];

function Blocks({ engine }: { engine: React.RefObject<TetrisEngine | null> }) {
  const geo = useMemo(() => new RoundedBoxGeometry(0.92, 0.92, 0.92, 3, 0.12), []);
  const mats = useMemo(() => {
    const m: Record<number, THREE.MeshStandardMaterial> = {};
    for (const [id, c] of Object.entries(PIECE_COLORS)) {
      m[Number(id)] = new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: Number(id) === 8 ? 0.15 : 0.55, metalness: 0.3, roughness: 0.25 });
    }
    return m;
  }, []);
  const ghostMat = useMemo(() => new THREE.MeshStandardMaterial({ color: '#ffffff', transparent: true, opacity: 0.14, emissive: '#ffffff', emissiveIntensity: 0.2 }), []);
  const meshes = useRef<Record<number, THREE.InstancedMesh | null>>({});
  const ghost = useRef<THREE.InstancedMesh>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);

  useFrame(() => {
    const eng = engine.current;
    const counts: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0, 7: 0, 8: 0 };
    const put = (id: number, x: number, y: number, scale = 1) => {
      const m = meshes.current[id];
      if (!m) return;
      dummy.position.set(...world(x, y));
      dummy.scale.setScalar(scale);
      dummy.updateMatrix();
      m.setMatrixAt(counts[id]++, dummy.matrix);
    };
    if (eng) {
      for (let y = FIRST_ROW; y < H; y++) for (let x = 0; x < W; x++) {
        const v = eng.board[y * W + x];
        if (v) put(v, x, y);
      }
      if (eng.cur && !eng.over) {
        const id = { I: 1, O: 2, T: 3, S: 4, Z: 5, J: 6, L: 7 }[eng.cur.type];
        for (const [x, y] of eng.cells()) if (y >= FIRST_ROW) put(id, x, y);
        // ghost
        const gy = eng.ghostY();
        let gi = 0;
        if (ghost.current) {
          for (const [x, y] of eng.cells({ ...eng.cur, y: gy })) {
            if (y < FIRST_ROW) continue;
            dummy.position.set(...world(x, y));
            dummy.scale.setScalar(0.96);
            dummy.updateMatrix();
            ghost.current.setMatrixAt(gi++, dummy.matrix);
          }
          ghost.current.count = gi;
          ghost.current.instanceMatrix.needsUpdate = true;
        }
      } else if (ghost.current) ghost.current.count = 0;
    }
    for (const id of Object.keys(counts).map(Number)) {
      const m = meshes.current[id];
      if (!m) continue;
      m.count = counts[id];
      m.instanceMatrix.needsUpdate = true;
    }
  });

  return (
    <group>
      {Object.keys(PIECE_COLORS).map((id) => (
        <instancedMesh key={id} ref={(r) => { meshes.current[Number(id)] = r; }} args={[geo, mats[Number(id)], MAX]} frustumCulled={false} />
      ))}
      <instancedMesh ref={ghost} args={[geo, ghostMat, 4]} frustumCulled={false} />
    </group>
  );
}

function Well({ tint }: { tint: string }) {
  const mat = useMemo(() => new THREE.MeshStandardMaterial({ color: tint, emissive: tint, emissiveIntensity: 2.2, toneMapped: false }), [tint]);
  const hw = W / 2 + 0.08, hh = 10.08;
  const grid = useMemo(() => {
    const pts: number[] = [];
    for (let x = 0; x <= W; x++) pts.push(x - W / 2, -10, 0, x - W / 2, 10, 0);
    for (let y = 0; y <= 20; y++) pts.push(-W / 2, y - 10, 0, W / 2, y - 10, 0);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    return g;
  }, []);
  return (
    <group>
      <mesh position={[0, 0, -0.62]}>
        <planeGeometry args={[W + 0.2, 20.2]} />
        <meshStandardMaterial color="#070716" roughness={0.9} transparent opacity={0.92} />
      </mesh>
      <lineSegments geometry={grid} position={[0, 0, -0.58]}>
        <lineBasicMaterial color="#ffffff" transparent opacity={0.05} />
      </lineSegments>
      <mesh position={[-hw, 0, 0]} material={mat}><boxGeometry args={[0.08, hh * 2, 0.08]} /></mesh>
      <mesh position={[hw, 0, 0]} material={mat}><boxGeometry args={[0.08, hh * 2, 0.08]} /></mesh>
      <mesh position={[0, -hh, 0]} material={mat}><boxGeometry args={[hw * 2 + 0.08, 0.08, 0.08]} /></mesh>
      {/* danger line at the top of the visible matrix */}
      <mesh position={[0, 10.02, -0.3]}>
        <boxGeometry args={[W, 0.02, 0.02]} />
        <meshBasicMaterial color="#ef4444" transparent opacity={0.35} />
      </mesh>
    </group>
  );
}

interface Particle { p: THREE.Vector3; v: THREE.Vector3; life: number; color: THREE.Color }

function Particles({ bursts }: { bursts: React.RefObject<{ rows: number[]; strong: boolean }[]> }) {
  const MAXP = 900;
  const geo = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(MAXP * 3), 3));
    g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(MAXP * 3), 3));
    return g;
  }, []);
  const parts = useRef<Particle[]>([]);
  useFrame((_, dt) => {
    const queued = bursts.current;
    while (queued && queued.length) {
      const b = queued.shift()!;
      for (const row of b.rows) {
        for (let i = 0; i < (b.strong ? 60 : 32); i++) {
          const x = Math.random() * W - 0.5;
          const [wx, wy] = world(x, row);
          const c = new THREE.Color().setHSL(Math.random(), 0.9, 0.65);
          parts.current.push({
            p: new THREE.Vector3(wx, wy, 0.3),
            v: new THREE.Vector3((Math.random() - 0.5) * 12, (Math.random() - 0.2) * 10, Math.random() * 6),
            life: 0.7 + Math.random() * 0.6,
            color: c,
          });
        }
      }
    }
    const pos = geo.attributes.position as THREE.BufferAttribute;
    const col = geo.attributes.color as THREE.BufferAttribute;
    parts.current = parts.current.filter((q) => (q.life -= dt) > 0).slice(-MAXP);
    parts.current.forEach((q, i) => {
      q.v.y -= 18 * dt;
      q.p.addScaledVector(q.v, dt);
      pos.setXYZ(i, q.p.x, q.p.y, q.p.z);
      const k = Math.min(1, q.life * 1.5);
      col.setXYZ(i, q.color.r * k, q.color.g * k, q.color.b * k);
    });
    geo.setDrawRange(0, parts.current.length);
    pos.needsUpdate = true;
    col.needsUpdate = true;
  });
  return (
    <points geometry={geo} frustumCulled={false}>
      <pointsMaterial size={0.2} vertexColors transparent depthWrite={false} blending={THREE.AdditiveBlending} toneMapped={false} />
    </points>
  );
}

function CameraRig({ shake }: { shake: React.RefObject<number> }) {
  const { camera, pointer } = useThree();
  useFrame((_, dt) => {
    const s = shake.current ?? 0;
    const jitterX = (Math.random() - 0.5) * s;
    const jitterY = (Math.random() - 0.5) * s;
    camera.position.x += (pointer.x * 1.2 + jitterX - camera.position.x) * Math.min(1, dt * 6);
    camera.position.y += (pointer.y * 0.8 - 0.5 + jitterY - camera.position.y) * Math.min(1, dt * 6);
    camera.lookAt(0, 0, 0);
    if (shake.current) shake.current = Math.max(0, s - dt * 2.2);
  });
  return null;
}

/** Turns engine events into visual effects (particles, camera shake). */
function EventPump({ events, bursts, shake }: {
  events: React.RefObject<TetrisEvent[]>;
  bursts: React.RefObject<{ rows: number[]; strong: boolean }[]>;
  shake: React.RefObject<number>;
}) {
  useFrame(() => {
    const ev = events.current;
    if (!ev?.length) return;
    for (const e of ev.splice(0)) {
      if (e.t === 'clear') {
        bursts.current.push({ rows: e.rows, strong: e.lines === 4 || e.tspin });
        shake.current = Math.max(shake.current, e.lines === 4 || e.tspin ? 0.5 : 0.15);
      } else if (e.t === 'harddrop' && e.dist > 2) {
        shake.current = Math.max(shake.current, 0.12);
      } else if (e.t === 'garbage') {
        shake.current = Math.max(shake.current, 0.35);
      }
    }
  });
  return null;
}

export default function TetrisScene({
  engine, events, level,
}: { engine: React.RefObject<TetrisEngine | null>; events: React.RefObject<TetrisEvent[]>; level: number }) {
  const bursts = useRef<{ rows: number[]; strong: boolean }[]>([]);
  const shake = useRef(0);
  const tint = LEVEL_TINTS[(level - 1) % LEVEL_TINTS.length];

  useEffect(() => () => { bursts.current = []; }, []);

  return (
    <Canvas dpr={[1, 1.75]} camera={{ position: [0, -0.5, 25], fov: 50 }} gl={{ antialias: true }}>
      <color attach="background" args={['#04040c']} />
      <ambientLight intensity={0.5} />
      <directionalLight position={[6, 10, 12]} intensity={1.3} />
      <pointLight position={[-8, 4, 6]} intensity={60} color={tint} />
      <pointLight position={[8, -6, 6]} intensity={40} color="#22d3ee" />
      <Environment resolution={64}>
        <Lightformer form="rect" intensity={2} position={[0, 5, 8]} scale={[10, 4, 1]} />
        <Lightformer form="rect" intensity={1.5} position={[-6, 0, 4]} scale={[2, 10, 1]} color={tint} />
      </Environment>
      <Stars radius={50} depth={30} count={1500} factor={2.5} fade speed={0.4} />
      <group position={[0, 0, 0]}>
        <Well tint={tint} />
        <Blocks engine={engine} />
        <Particles bursts={bursts} />
      </group>
      <EventPump events={events} bursts={bursts} shake={shake} />
      <CameraRig shake={shake} />
      <EffectComposer multisampling={0}>
        <Bloom intensity={1.1} luminanceThreshold={0.35} luminanceSmoothing={0.25} mipmapBlur />
        <Vignette offset={0.25} darkness={0.7} eskil={false} />
      </EffectComposer>
    </Canvas>
  );
}

