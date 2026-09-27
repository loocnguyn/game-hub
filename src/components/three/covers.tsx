'use client';
// Cover art for the game library. Each scene is rendered once in dev by scripts/render-covers.mjs and
// saved to public/covers, so the hub shows plain images instead of running a WebGL scene per card.
import * as THREE from 'three';
import { Canvas, useFrame, useThree, type ThreeElements } from '@react-three/fiber';
import { ContactShadows, Environment, Lightformer, RoundedBox } from '@react-three/drei';
import { Bloom, EffectComposer, Vignette } from '@react-three/postprocessing';
import { Suspense, useEffect, useMemo, useRef, type ReactNode } from 'react';
import { ChessPiece3D, Die3D, NEON, XiangqiDisc } from './shared';

type V3 = [number, number, number];
type G = ThreeElements['group'];

// ---------------------------------------------------------------- canvas textures
function canvasTex(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d')!);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

/** Text centred on a transparent square, for tile faces. */
function useTextTex(text: string, color: string, font = '800 150px "Segoe UI", Arial, sans-serif') {
  return useMemo(
    () => canvasTex(256, 256, (g) => {
      g.fillStyle = color;
      g.font = font;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText(text, 128, 138);
    }),
    [text, color, font],
  );
}

const SUIT_RED: Record<string, boolean> = { '♥': true, '♦': true, '♠': false, '♣': false };

function useCardTex(rank: string, suit: string) {
  return useMemo(
    () => canvasTex(500, 700, (g) => {
      g.beginPath();
      g.roundRect(6, 6, 488, 688, 38);
      g.fillStyle = '#fbfaf5';
      g.fill();
      g.lineWidth = 5;
      g.strokeStyle = '#d9d3c3';
      g.stroke();
      g.fillStyle = SUIT_RED[suit] ? '#c3122c' : '#15151b';
      g.textAlign = 'center';
      const corner = () => {
        g.textBaseline = 'alphabetic';
        g.font = 'bold 118px Georgia, "Times New Roman", serif';
        g.fillText(rank, 86, 138);
        g.font = '92px "Segoe UI Symbol", serif';
        g.fillText(suit, 86, 232);
      };
      corner();
      g.save();
      g.translate(500, 700);
      g.rotate(Math.PI);
      corner();
      g.restore();
      g.textBaseline = 'middle';
      g.font = '300px "Segoe UI Symbol", serif';
      g.fillText(suit, 250, 380);
    }),
    [rank, suit],
  );
}

function useCardBackTex(color = '#8f1d2c') {
  return useMemo(
    () => canvasTex(500, 700, (g) => {
      g.beginPath();
      g.roundRect(6, 6, 488, 688, 38);
      g.fillStyle = '#fbfaf5';
      g.fill();
      g.beginPath();
      g.roundRect(34, 34, 432, 632, 22);
      g.fillStyle = color;
      g.fill();
      g.save();
      g.clip();
      g.strokeStyle = 'rgba(255,255,255,0.22)';
      g.lineWidth = 6;
      for (let i = -700; i < 700; i += 36) {
        g.beginPath();
        g.moveTo(i, 0);
        g.lineTo(i + 700, 700);
        g.stroke();
        g.beginPath();
        g.moveTo(i + 700, 0);
        g.lineTo(i, 700);
        g.stroke();
      }
      g.restore();
    }),
    [color],
  );
}

// ---------------------------------------------------------------- stage
function LookAt({ at }: { at: V3 }) {
  const { camera } = useThree();
  useEffect(() => {
    camera.lookAt(...at);
  }, [camera, at]);
  return null;
}

function Ready() {
  const n = useRef(0);
  useFrame(() => {
    n.current += 1;
    if (n.current === 45) (window as unknown as { __coverReady: boolean }).__coverReady = true;
  });
  return null;
}

interface StageProps {
  bg: string;
  floor?: string;
  rim: string;
  rim2?: string;
  bloom?: number;
  fog?: [number, number];
  shadowSize?: number;
  keyLight?: V3;
  keyIntensity?: number;
  children: ReactNode;
}

function Stage({ bg, floor, rim, rim2 = rim, bloom = 0.35, fog = [14, 30], shadowSize = 9, keyLight = [4, 9, 6], keyIntensity = 2.4, children }: StageProps) {
  return (
    <>
      <color attach="background" args={[bg]} />
      <fog attach="fog" args={[bg, fog[0], fog[1]]} />
      <ambientLight intensity={0.35} />
      <directionalLight
        position={keyLight}
        intensity={keyIntensity}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-bias={-0.0003}
        shadow-camera-left={-shadowSize}
        shadow-camera-right={shadowSize}
        shadow-camera-top={shadowSize}
        shadow-camera-bottom={-shadowSize}
      />
      <pointLight position={[-6, 4, -4]} intensity={90} distance={30} color={rim} />
      <pointLight position={[6, 3, -5]} intensity={60} distance={30} color={rim2} />
      <Environment resolution={256}>
        <Lightformer form="rect" intensity={2.2} position={[0, 6, 4]} scale={[10, 4, 1]} color="#ffffff" />
        <Lightformer form="rect" intensity={1.6} position={[-7, 2, 0]} rotation-y={Math.PI / 2} scale={[6, 4, 1]} color={rim} />
        <Lightformer form="rect" intensity={1.2} position={[7, 2, 0]} rotation-y={-Math.PI / 2} scale={[6, 4, 1]} color={rim2} />
      </Environment>
      {floor && (
        <>
          <mesh rotation-x={-Math.PI / 2} position-y={-0.001} receiveShadow>
            <planeGeometry args={[80, 80]} />
            <meshStandardMaterial color={floor} roughness={0.92} />
          </mesh>
          <ContactShadows position-y={0.002} opacity={0.55} scale={24} blur={2.6} far={5} resolution={1024} />
        </>
      )}
      {children}
      <EffectComposer multisampling={8}>
        <Bloom intensity={bloom} luminanceThreshold={0.7} luminanceSmoothing={0.2} mipmapBlur />
        <Vignette eskil={false} offset={0.25} darkness={0.7} />
      </EffectComposer>
    </>
  );
}

// ---------------------------------------------------------------- small props
function Block({ color, position, size = 0.94, emissive = 0.12 }: { color: string; position: V3; size?: number; emissive?: number }) {
  return (
    <RoundedBox args={[size, size, size]} radius={0.1} smoothness={4} position={position} castShadow receiveShadow>
      <meshPhysicalMaterial color={color} emissive={color} emissiveIntensity={emissive} roughness={0.18} metalness={0.05} clearcoat={1} clearcoatRoughness={0.08} />
    </RoundedBox>
  );
}

function Card({ rank, suit, back, ...props }: { rank?: string; suit?: string; back?: boolean } & G) {
  const face = useCardTex(rank ?? 'A', suit ?? '♠');
  const backTex = useCardBackTex();
  return (
    <group {...props}>
      <mesh castShadow receiveShadow>
        <planeGeometry args={[1, 1.4]} />
        <meshStandardMaterial map={back ? backTex : face} transparent alphaTest={0.5} roughness={0.45} side={THREE.DoubleSide} />
      </mesh>
    </group>
  );
}

function Felt({ color, size = [40, 40] }: { color: string; size?: [number, number] }) {
  return (
    <mesh rotation-x={-Math.PI / 2} receiveShadow>
      <planeGeometry args={size} />
      <meshStandardMaterial color={color} roughness={1} />
    </mesh>
  );
}

// ---------------------------------------------------------------- scenes
function TetrisCover() {
  // bottom row first; '.' is empty. Column 8 is left open for the falling I piece.
  const rows = ['JJJOOTTS.Z', 'LJSOOTSS.Z', 'LLSSITZZ.Z', 'LTTTIZZO.O', 'S.TI..OO..', 'SS........'];
  const cells: { c: string; x: number; y: number }[] = [];
  rows.forEach((r, y) => [...r].forEach((c, x) => c !== '.' && cells.push({ c, x, y })));
  return (
    <Stage bg="#0d1322" floor="#0b1020" rim="#38bdf8" rim2="#a78bfa" bloom={0.5}>
      <group position={[-4.5, 0.5, 0]}>
        {cells.map(({ c, x, y }) => <Block key={`${x}-${y}`} color={NEON[c as keyof typeof NEON]} position={[x, y, 0]} />)}
        {[5, 6, 7, 8].map((y) => <Block key={`i${y}`} color={NEON.I} emissive={0.45} position={[8, y + 0.3, 0]} />)}
        {[0, 1, 2, 3].map((y) => (
          <mesh key={`g${y}`} position={[8, y, 0]}>
            <boxGeometry args={[0.9, 0.9, 0.9]} />
            <meshBasicMaterial color={NEON.I} transparent opacity={0.08} />
          </mesh>
        ))}
      </group>
      {[-5.25, 5.25].map((x) => (
        <mesh key={x} position={[x, 5, 0]} castShadow receiveShadow>
          <boxGeometry args={[0.5, 10, 1.2]} />
          <meshStandardMaterial color="#1b2338" metalness={0.6} roughness={0.35} />
        </mesh>
      ))}
    </Stage>
  );
}

function ChessBoardSlab({ n = 8, size = 1 }: { n?: number; size?: number }) {
  const squares: { x: number; z: number; dark: boolean }[] = [];
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) squares.push({ x: (i - n / 2 + 0.5) * size, z: (j - n / 2 + 0.5) * size, dark: (i + j) % 2 === 1 });
  return (
    <group>
      <mesh position={[0, -0.12, 0]} receiveShadow castShadow>
        <boxGeometry args={[n * size + 0.5, 0.22, n * size + 0.5]} />
        <meshStandardMaterial color="#3a2417" roughness={0.5} />
      </mesh>
      {squares.map((s) => (
        <mesh key={`${s.x}-${s.z}`} position={[s.x, 0, s.z]} receiveShadow>
          <boxGeometry args={[size, 0.04, size]} />
          <meshPhysicalMaterial color={s.dark ? '#6b4428' : '#e6cfa3'} roughness={0.35} clearcoat={0.8} clearcoatRoughness={0.2} />
        </mesh>
      ))}
    </group>
  );
}

function ChessCover() {
  return (
    <Stage bg="#1a130e" floor="#140e0a" rim="#f59e0b" rim2="#fde68a" keyLight={[-3, 8, 5]} keyIntensity={1.7}>
      <group position={[0, 0.22, 0]}>
        <ChessBoardSlab />
        <ChessPiece3D type="k" white position={[0.5, 0.02, 0.5]} scale={0.72} />
        <ChessPiece3D type="q" white position={[1.5, 0.02, 1.5]} scale={0.66} />
        <ChessPiece3D type="n" white={false} position={[-0.5, 0.02, -1.5]} scale={0.66} rotation-y={0.5} />
        <ChessPiece3D type="b" white={false} position={[-1.5, 0.02, -0.5]} scale={0.64} />
        <ChessPiece3D type="p" white position={[-0.5, 0.02, 1.5]} scale={0.6} />
        <ChessPiece3D type="p" white position={[2.5, 0.02, 0.5]} scale={0.6} />
        <ChessPiece3D type="r" white={false} position={[2.5, 0.02, -2.5]} scale={0.64} />
        {/* a captured pawn lying on its side */}
        <ChessPiece3D type="p" white={false} position={[-2.9, 0.33, 2.3]} rotation={[0, 0.6, Math.PI / 2]} scale={0.6} />
      </group>
    </Stage>
  );
}

function useXiangqiBoardTex() {
  return useMemo(
    () => canvasTex(1000, 1100, (g) => {
      g.fillStyle = '#d9b07a';
      g.fillRect(0, 0, 1000, 1100);
      // subtle wood grain
      for (let i = 0; i < 90; i++) {
        g.strokeStyle = `rgba(120,72,30,${0.04 + Math.random() * 0.05})`;
        g.lineWidth = 1 + Math.random() * 3;
        g.beginPath();
        const y = Math.random() * 1100;
        g.moveTo(0, y);
        g.bezierCurveTo(300, y + 20 - Math.random() * 40, 700, y - 20 + Math.random() * 40, 1000, y);
        g.stroke();
      }
      g.strokeStyle = '#4a2a14';
      g.lineWidth = 5;
      const X = (c: number) => 100 + c * 100;
      const Y = (r: number) => 100 + r * 100;
      for (let r = 0; r < 10; r++) {
        g.beginPath();
        g.moveTo(X(0), Y(r));
        g.lineTo(X(8), Y(r));
        g.stroke();
      }
      for (let c = 0; c < 9; c++) {
        const edge = c === 0 || c === 8;
        g.beginPath();
        g.moveTo(X(c), Y(0));
        g.lineTo(X(c), Y(edge ? 9 : 4));
        g.stroke();
        if (!edge) {
          g.beginPath();
          g.moveTo(X(c), Y(5));
          g.lineTo(X(c), Y(9));
          g.stroke();
        }
      }
      for (const [r0, r1] of [[0, 2], [7, 9]]) {
        g.beginPath();
        g.moveTo(X(3), Y(r0));
        g.lineTo(X(5), Y(r1));
        g.moveTo(X(5), Y(r0));
        g.lineTo(X(3), Y(r1));
        g.stroke();
      }
      g.lineWidth = 9;
      g.strokeRect(X(0) - 18, Y(0) - 18, 836, 936);
      g.fillStyle = '#5a3418';
      g.font = '64px KaiTi, STKaiti, "SimSun", serif';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText('楚 河', X(2), Y(4.5));
      g.fillText('漢 界', X(6), Y(4.5));
    }),
    [],
  );
}

function XiangqiCover() {
  const tex = useXiangqiBoardTex();
  // (col 0..8, row 0..9) -> world; board is 10 x 11 units with 1 unit per grid step
  const at = (c: number, r: number): V3 => [c - 4, 0.14, r - 4.5];
  return (
    <Stage bg="#1d0e0b" floor="#170b09" rim="#ef4444" rim2="#fbbf24" keyLight={[3, 9, 4]}>
      <mesh position={[0, -0.06, 0]} castShadow receiveShadow>
        <boxGeometry args={[10, 0.12, 11]} />
        <meshStandardMaterial attach="material-0" color="#8b5a2b" />
        <meshStandardMaterial attach="material-1" color="#8b5a2b" />
        <meshStandardMaterial attach="material-2" map={tex} roughness={0.55} />
        <meshStandardMaterial attach="material-3" color="#8b5a2b" />
        <meshStandardMaterial attach="material-4" color="#8b5a2b" />
        <meshStandardMaterial attach="material-5" color="#8b5a2b" />
      </mesh>
      <XiangqiDisc char="帥" red position={at(4, 8)} scale={0.95} />
      <XiangqiDisc char="車" red position={at(1, 6)} scale={0.95} />
      <XiangqiDisc char="炮" red position={at(6, 7)} scale={0.95} />
      <XiangqiDisc char="兵" red position={at(4, 5)} scale={0.95} />
      <XiangqiDisc char="將" red={false} position={at(4, 1)} scale={0.95} />
      <XiangqiDisc char="馬" red={false} position={at(2, 3)} scale={0.95} />
      <XiangqiDisc char="砲" red={false} position={at(5, 3)} scale={0.95} />
      {/* a piece mid-move, lifted off the board */}
      <XiangqiDisc char="車" red={false} position={[1.1, 1.1, -0.2]} rotation={[0.5, 0.2, -0.3]} scale={0.95} />
    </Stage>
  );
}

function XMark({ color, ...props }: { color: string } & G) {
  return (
    <group {...props}>
      {[Math.PI / 4, -Math.PI / 4].map((r) => (
        <RoundedBox key={r} args={[0.78, 0.14, 0.16]} radius={0.06} rotation-y={r} castShadow>
          <meshPhysicalMaterial color={color} roughness={0.25} clearcoat={1} emissive={color} emissiveIntensity={0.15} />
        </RoundedBox>
      ))}
    </group>
  );
}
function OMark({ color, ...props }: { color: string } & G) {
  return (
    <mesh {...props} rotation-x={-Math.PI / 2} castShadow>
      <torusGeometry args={[0.3, 0.08, 24, 64]} />
      <meshPhysicalMaterial color={color} roughness={0.25} clearcoat={1} emissive={color} emissiveIntensity={0.15} />
    </mesh>
  );
}

function useGridTex(cols: number, rows: number, bg: string, line: string, px = 80) {
  return useMemo(
    () => canvasTex(cols * px, rows * px, (g) => {
      g.fillStyle = bg;
      g.fillRect(0, 0, cols * px, rows * px);
      g.strokeStyle = line;
      g.lineWidth = 3;
      for (let c = 0; c <= cols; c++) {
        g.beginPath();
        g.moveTo(c * px, 0);
        g.lineTo(c * px, rows * px);
        g.stroke();
      }
      for (let r = 0; r <= rows; r++) {
        g.beginPath();
        g.moveTo(0, r * px);
        g.lineTo(cols * px, r * px);
        g.stroke();
      }
    }),
    [cols, rows, bg, line, px],
  );
}

function CaroCover() {
  const tex = useGridTex(14, 10, '#cbc2ab', '#958b75');
  const cell = (c: number, r: number): V3 => [c - 6.5, 0.1, r - 4.5];
  const xs: [number, number][] = [[4, 2], [5, 3], [6, 4], [7, 5], [8, 6], [6, 6], [3, 5]];
  const os: [number, number][] = [[5, 4], [7, 3], [6, 5], [9, 7], [4, 6], [8, 4]];
  return (
    <Stage bg="#0e1822" floor="#0b141c" rim="#38bdf8" rim2="#fb7185" keyLight={[-4, 9, 5]} keyIntensity={1.5}>
      <mesh position={[0, 0.02, 0]} receiveShadow>
        <boxGeometry args={[14, 0.04, 10]} />
        <meshStandardMaterial attach="material-2" map={tex} roughness={0.8} />
        <meshStandardMaterial attach="material-0" color="#d8d0bf" />
        <meshStandardMaterial attach="material-1" color="#d8d0bf" />
        <meshStandardMaterial attach="material-3" color="#d8d0bf" />
        <meshStandardMaterial attach="material-4" color="#d8d0bf" />
        <meshStandardMaterial attach="material-5" color="#d8d0bf" />
      </mesh>
      {xs.map(([c, r]) => <XMark key={`x${c}${r}`} color="#2563eb" position={cell(c, r)} />)}
      {os.map(([c, r]) => <OMark key={`o${c}${r}`} color="#e11d48" position={cell(c, r)} />)}
      {/* the winning five */}
      <mesh position={[-0.5, 0.2, -0.5]} rotation={[0, -Math.PI / 4, 0]}>
        <boxGeometry args={[5.9, 0.03, 0.12]} />
        <meshBasicMaterial color="#facc15" />
      </mesh>
    </Stage>
  );
}

function DotsCover() {
  const cols = 5;
  const rows = 4;
  const s = 1.3;
  const p = (c: number, r: number): V3 => [(c - (cols - 1) / 2) * s, 0.12, (r - (rows - 1) / 2) * s];
  const A = '#14b8a6';
  const B = '#f59e0b';
  // edges: [c, r, horizontal?, owner]
  const edges: [number, number, boolean, string][] = [
    [0, 0, true, A], [1, 0, true, B], [2, 0, true, A], [0, 1, true, A], [1, 1, true, B], [3, 2, true, B], [0, 3, true, A], [1, 3, true, B], [2, 3, true, A],
    [0, 0, false, B], [1, 0, false, A], [2, 0, false, B], [3, 1, false, A], [0, 2, false, B], [1, 2, false, A], [4, 1, false, B], [3, 2, false, B], [4, 2, false, A],
  ];
  const boxes: [number, number, string][] = [[0, 0, A], [1, 0, B], [3, 2, B]];
  return (
    <Stage bg="#0c1a17" floor="#0a1512" rim="#14b8a6" rim2="#f59e0b" keyLight={[3, 9, 5]}>
      <RoundedBox args={[cols * s + 0.6, 0.12, rows * s + 0.6]} radius={0.05} position={[0, 0, 0]} receiveShadow>
        <meshStandardMaterial color="#e9e4d6" roughness={0.85} />
      </RoundedBox>
      {Array.from({ length: cols * rows }, (_, i) => (
        <mesh key={i} position={p(i % cols, Math.floor(i / cols))} castShadow>
          <sphereGeometry args={[0.1, 24, 16]} />
          <meshStandardMaterial color="#1f2937" roughness={0.3} metalness={0.4} />
        </mesh>
      ))}
      {edges.map(([c, r, h, col], i) => {
        const [x, y, z] = p(c, r);
        return (
          <RoundedBox key={i} args={h ? [s - 0.26, 0.1, 0.12] : [0.12, 0.1, s - 0.26]} radius={0.04} position={h ? [x + s / 2, y, z] : [x, y, z + s / 2]} castShadow>
            <meshPhysicalMaterial color={col} roughness={0.3} clearcoat={0.8} />
          </RoundedBox>
        );
      })}
      {boxes.map(([c, r, col]) => {
        const [x, , z] = p(c, r);
        return (
          <mesh key={`${c}${r}`} position={[x + s / 2, 0.075, z + s / 2]} receiveShadow>
            <boxGeometry args={[s - 0.3, 0.02, s - 0.3]} />
            <meshStandardMaterial color={col} transparent opacity={0.45} />
          </mesh>
        );
      })}
      {/* a bar being placed */}
      <RoundedBox args={[s - 0.26, 0.1, 0.12]} radius={0.04} position={[1.3 * 1.5, 0.9, 0.4]} rotation={[0.3, 0.4, 0.2]} castShadow>
        <meshPhysicalMaterial color={A} roughness={0.3} clearcoat={0.8} emissive={A} emissiveIntensity={0.3} />
      </RoundedBox>
    </Stage>
  );
}

function House({ color = '#16a34a', hotel = false, ...props }: { color?: string; hotel?: boolean } & G) {
  const w = hotel ? 0.55 : 0.3;
  return (
    <group {...props}>
      <mesh position={[0, 0.12, 0]} castShadow>
        <boxGeometry args={[w, 0.24, 0.3]} />
        <meshStandardMaterial color={color} roughness={0.4} />
      </mesh>
      <mesh position={[0, 0.33, 0]} rotation-y={Math.PI / 4} scale={[w / 0.3, 1, 1]} castShadow>
        <coneGeometry args={[0.24, 0.2, 4]} />
        <meshStandardMaterial color={color} roughness={0.4} />
      </mesh>
    </group>
  );
}

function MonopolyCover() {
  const colors = ['#8b5cf6', '#8b5cf6', '#0ea5e9', '#0ea5e9', '#0ea5e9', '#ec4899', '#ec4899', '#f97316'];
  return (
    <Stage bg="#0f1d17" floor="#0c1712" rim="#22c55e" rim2="#facc15" keyLight={[-4, 9, 4]} keyIntensity={1.5}>
      <mesh position={[0, 0.03, 0]} receiveShadow>
        <boxGeometry args={[14, 0.06, 14]} />
        <meshStandardMaterial color="#a8c6ad" roughness={0.9} />
      </mesh>
      {colors.map((c, i) => (
        <group key={i} position={[-4.6 + i * 1.15, 0.06, 2.6]}>
          <mesh position={[0, 0.02, 0]} receiveShadow>
            <boxGeometry args={[1.08, 0.04, 1.7]} />
            <meshStandardMaterial color="#f4efe2" roughness={0.8} />
          </mesh>
          <mesh position={[0, 0.05, -0.62]} receiveShadow>
            <boxGeometry args={[1.08, 0.03, 0.4]} />
            <meshStandardMaterial color={c} roughness={0.6} />
          </mesh>
        </group>
      ))}
      <House scale={1.5} position={[-4.85, 0.1, 1.95]} />
      <House scale={1.5} position={[-4.35, 0.1, 1.95]} />
      <House scale={1.5} position={[-3.45, 0.1, 1.95]} />
      <House scale={1.5} hotel color="#dc2626" position={[1.15, 0.1, 1.95]} />
      <House scale={1.5} hotel color="#dc2626" position={[2.3, 0.1, 1.95]} />
      <Die3D value={5} position={[-0.8, 0.45, 0.2]} rotation={[0, 0.5, 0]} scale={0.9} />
      <Die3D value={6} position={[0.5, 0.45, -0.3]} rotation={[0, -0.3, 0]} scale={0.9} />
      {/* player token */}
      <group position={[2.6, 0.08, -0.6]}>
        <mesh castShadow>
          <cylinderGeometry args={[0.28, 0.34, 0.12, 40]} />
          <meshStandardMaterial color="#d9b54a" metalness={0.55} roughness={0.3} />
        </mesh>
        <mesh position={[0, 0.45, 0]} castShadow>
          <cylinderGeometry args={[0.2, 0.22, 0.8, 40]} />
          <meshStandardMaterial color="#d9b54a" metalness={0.55} roughness={0.3} />
        </mesh>
        <mesh position={[0, 0.86, 0]} castShadow>
          <cylinderGeometry args={[0.38, 0.38, 0.05, 40]} />
          <meshStandardMaterial color="#d9b54a" metalness={0.55} roughness={0.3} />
        </mesh>
      </group>
    </Stage>
  );
}

function TienLenCover() {
  const hand: [string, string][] = [['2', '♠'], ['2', '♣'], ['2', '♦'], ['2', '♥']];
  return (
    <Stage bg="#240d10" rim="#f97316" rim2="#fda4af" keyLight={[2, 9, 4]} fog={[12, 26]}>
      <Felt color="#5c1a22" />
      <group position={[0, 0.02, 0.6]} rotation-x={-Math.PI / 2}>
        {hand.map(([r, s], i) => {
          const a = (i - 1.5) * 0.28;
          return (
            <group key={i} rotation-z={-a} position={[0, -1.1, i * 0.012]}>
              <Card rank={r} suit={s} position={[0, 1.1, 0]} />
            </group>
          );
        })}
      </group>
      <Card back position={[-2.6, 0.02, -1.4]} rotation={[-Math.PI / 2, 0, 0.4]} />
      <Card back position={[-2.4, 0.03, -1.3]} rotation={[-Math.PI / 2, 0, 0.1]} />
      <Card rank="3" suit="♠" position={[2.5, 0.02, -1.2]} rotation={[-Math.PI / 2, 0, -0.3]} />
      <Card rank="K" suit="♥" position={[2.9, 0.03, -0.9]} rotation={[-Math.PI / 2, 0, -0.6]} />
    </Stage>
  );
}

function useChipTex(color: string) {
  return useMemo(() => {
    const top = canvasTex(256, 256, (g) => {
      g.fillStyle = color;
      g.beginPath();
      g.arc(128, 128, 128, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#f8f5ec';
      for (let i = 0; i < 8; i++) {
        g.save();
        g.translate(128, 128);
        g.rotate((i * Math.PI) / 4);
        g.fillRect(-14, -128, 28, 30);
        g.restore();
      }
      g.strokeStyle = 'rgba(255,255,255,0.8)';
      g.setLineDash([10, 8]);
      g.lineWidth = 5;
      g.beginPath();
      g.arc(128, 128, 76, 0, Math.PI * 2);
      g.stroke();
    });
    const side = canvasTex(256, 16, (g) => {
      g.fillStyle = color;
      g.fillRect(0, 0, 256, 16);
      g.fillStyle = '#f8f5ec';
      for (let i = 0; i < 8; i++) g.fillRect(i * 32 + 4, 0, 12, 16);
    });
    return { top, side };
  }, [color]);
}

function Chip({ color, ...props }: { color: string } & G) {
  const { top, side } = useChipTex(color);
  return (
    <group {...props}>
      <mesh castShadow receiveShadow>
        <cylinderGeometry args={[0.5, 0.5, 0.11, 64]} />
        <meshStandardMaterial attach="material-0" map={side} roughness={0.5} />
        <meshStandardMaterial attach="material-1" map={top} roughness={0.45} />
        <meshStandardMaterial attach="material-2" map={top} roughness={0.45} />
      </mesh>
    </group>
  );
}

function ChipStack({ color, n, ...props }: { color: string; n: number } & G) {
  return (
    <group {...props}>
      {Array.from({ length: n }, (_, i) => <Chip key={i} color={color} position={[Math.sin(i * 2.1) * 0.03, 0.06 + i * 0.115, Math.cos(i * 1.7) * 0.03]} rotation-y={i * 0.7} />)}
    </group>
  );
}

function PokerCover() {
  return (
    <Stage bg="#08201a" rim="#10b981" rim2="#e2b75a" keyLight={[-3, 9, 4]} fog={[12, 26]}>
      <Felt color="#0f4d3a" />
      <Card rank="A" suit="♠" position={[-0.7, 0.03, 0.9]} rotation={[-Math.PI / 2, 0, 0.18]} />
      <Card rank="K" suit="♠" position={[0.2, 0.05, 1.0]} rotation={[-Math.PI / 2, 0, -0.12]} />
      <ChipStack color="#b91c1c" n={9} position={[1.9, 0, -0.4]} />
      <ChipStack color="#111827" n={6} position={[2.9, 0, 0.3]} />
      <ChipStack color="#1d4ed8" n={12} position={[1.0, 0, -1.5]} />
      <ChipStack color="#b91c1c" n={4} position={[2.4, 0, -1.6]} />
      <Chip color="#047857" position={[-2.2, 0.06, -0.6]} />
      <Chip color="#111827" position={[-1.7, 0.18, -0.9]} rotation={[0.35, 0, 0.2]} />
    </Stage>
  );
}

const MINE_NUM_COLORS: Record<number, string> = { 1: '#2563eb', 2: '#16a34a', 3: '#dc2626', 4: '#7c3aed' };

function NumberTile({ n, position }: { n: number; position: V3 }) {
  const tex = useTextTex(n ? String(n) : '', MINE_NUM_COLORS[n] ?? '#000');
  return (
    <group position={position}>
      <mesh position={[0, 0.04, 0]} receiveShadow>
        <boxGeometry args={[0.96, 0.08, 0.96]} />
        <meshStandardMaterial color="#cfd5de" roughness={0.8} />
      </mesh>
      {n > 0 && (
        <mesh position={[0, 0.081, 0]} rotation-x={-Math.PI / 2}>
          <planeGeometry args={[0.9, 0.9]} />
          <meshBasicMaterial map={tex} transparent toneMapped={false} />
        </mesh>
      )}
    </group>
  );
}

function Mine(props: G) {
  const dirs = useMemo(() => {
    const out: THREE.Euler[] = [];
    const v = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1], [0.7, 0.7, 0], [-0.7, 0.7, 0], [0, 0.7, 0.7], [0, 0.7, -0.7]];
    for (const [x, y, z] of v) {
      const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(x, y, z).normalize());
      out.push(new THREE.Euler().setFromQuaternion(q));
    }
    return out;
  }, []);
  return (
    <group {...props}>
      <mesh castShadow>
        <sphereGeometry args={[0.28, 32, 24]} />
        <meshStandardMaterial color="#111318" metalness={0.6} roughness={0.35} />
      </mesh>
      {dirs.map((r, i) => (
        <mesh key={i} rotation={r}>
          <cylinderGeometry args={[0.03, 0.05, 0.8, 12]} />
          <meshStandardMaterial color="#111318" metalness={0.6} roughness={0.35} />
        </mesh>
      ))}
      <mesh position={[-0.1, 0.12, 0.2]}>
        <sphereGeometry args={[0.06, 16, 12]} />
        <meshBasicMaterial color="#ffffff" />
      </mesh>
    </group>
  );
}

function Flag(props: G) {
  const cloth = useMemo(() => {
    const s = new THREE.Shape();
    s.moveTo(0, 0);
    s.lineTo(0.42, -0.14);
    s.lineTo(0, -0.28);
    s.closePath();
    return new THREE.ShapeGeometry(s);
  }, []);
  return (
    <group {...props}>
      <mesh position={[0, 0.05, 0]} castShadow>
        <cylinderGeometry args={[0.2, 0.24, 0.08, 32]} />
        <meshStandardMaterial color="#1f2937" />
      </mesh>
      <mesh position={[0, 0.4, 0]} castShadow>
        <cylinderGeometry args={[0.025, 0.025, 0.7, 12]} />
        <meshStandardMaterial color="#1f2937" />
      </mesh>
      <mesh geometry={cloth} position={[0.02, 0.74, 0]} castShadow>
        <meshStandardMaterial color="#dc2626" side={THREE.DoubleSide} emissive="#dc2626" emissiveIntensity={0.2} />
      </mesh>
    </group>
  );
}

function MinesweeperCover() {
  const W = 9;
  const H = 7;
  // 0..4 = revealed number, -1 = covered, -2 = covered with flag, -3 = mine
  const grid = [
    [-1, -1, -1, -1, -1, -1, -1, -1, -1],
    [-1, -1, 1, 1, 1, -1, -2, -1, -1],
    [-1, 1, 1, 0, 1, 2, 2, -1, -1],
    [-1, 1, 0, 0, 0, 1, -3, 3, -1],
    [-1, 2, 1, 0, 0, 1, 2, -2, -1],
    [-1, -2, 1, 0, 1, 1, 1, -1, -1],
    [-1, -1, -1, 1, -1, -1, -1, -1, -1],
  ];
  return (
    <Stage bg="#10141b" floor="#0d1117" rim="#60a5fa" rim2="#f87171" keyLight={[-3, 9, 5]}>
      {grid.flatMap((row, r) =>
        row.map((v, c) => {
          const pos: V3 = [c - (W - 1) / 2, 0, r - (H - 1) / 2];
          if (v >= 0) return <NumberTile key={`${r}-${c}`} n={v} position={pos} />;
          if (v === -3)
            return (
              <group key={`${r}-${c}`} position={pos}>
                <mesh position={[0, 0.04, 0]} receiveShadow>
                  <boxGeometry args={[0.96, 0.08, 0.96]} />
                  <meshStandardMaterial color="#ef4444" roughness={0.6} />
                </mesh>
                <Mine position={[0, 0.45, 0]} />
              </group>
            );
          return (
            <group key={`${r}-${c}`} position={pos}>
              <RoundedBox args={[0.94, 0.32, 0.94]} radius={0.06} position={[0, 0.16, 0]} castShadow receiveShadow>
                <meshStandardMaterial color="#5b6577" roughness={0.55} />
              </RoundedBox>
              {v === -2 && <Flag position={[0, 0.32, 0]} />}
            </group>
          );
        }),
      )}
    </Stage>
  );
}

const TILE_COLORS: Record<number, [string, string]> = {
  2: ['#eee4da', '#776e65'], 4: ['#ede0c8', '#776e65'], 8: ['#f2b179', '#fff'], 16: ['#f59563', '#fff'], 32: ['#f67c5f', '#fff'],
  64: ['#f65e3b', '#fff'], 128: ['#edcf72', '#fff'], 256: ['#edcc61', '#fff'], 512: ['#edc850', '#fff'], 1024: ['#edc53f', '#fff'], 2048: ['#edc22e', '#fff'],
};

function Tile2048({ v, position, lift = 0 }: { v: number; position: V3; lift?: number }) {
  const [bg, fg] = TILE_COLORS[v];
  const font = v >= 1000 ? '900 82px "Segoe UI Black", "Arial Black", sans-serif' : v >= 100 ? '900 104px "Segoe UI Black", "Arial Black", sans-serif' : '900 138px "Segoe UI Black", "Arial Black", sans-serif';
  const tex = useTextTex(String(v), fg, font);
  return (
    <group position={[position[0], position[1] + lift, position[2]]}>
      <RoundedBox args={[0.92, 0.3, 0.92]} radius={0.08} position={[0, 0.15, 0]} castShadow receiveShadow>
        <meshPhysicalMaterial color={bg} roughness={0.35} clearcoat={0.6} emissive={v === 2048 ? '#edc22e' : '#000'} emissiveIntensity={v === 2048 ? 0.35 : 0} />
      </RoundedBox>
      <mesh position={[0, 0.301, 0]} rotation-x={-Math.PI / 2}>
        <planeGeometry args={[0.9, 0.9]} />
        <meshBasicMaterial map={tex} transparent toneMapped={false} />
      </mesh>
    </group>
  );
}

function G2048Cover() {
  const board = [
    [2, 4, 8, 2],
    [16, 32, 64, 4],
    [512, 256, 128, 8],
    [1024, 0, 16, 2],
  ];
  const at = (c: number, r: number): V3 => [(c - 1.5) * 1.02, 0.12, (r - 1.5) * 1.02];
  return (
    <Stage bg="#1d150c" floor="#171009" rim="#f59e0b" rim2="#fcd34d" keyLight={[-3, 9, 5]} bloom={0.45}>
      <RoundedBox args={[4.4, 0.24, 4.4]} radius={0.1} position={[0, 0.12, 0]} receiveShadow castShadow>
        <meshStandardMaterial color="#8f7a66" roughness={0.6} />
      </RoundedBox>
      {board.flatMap((row, r) => row.map((v, c) => (v ? <Tile2048 key={`${r}${c}`} v={v} position={at(c, r)} /> : null)))}
      <group position={at(1, 3)}>
        <group position-y={1.2} rotation={[0.35, 0.25, -0.2]}>
          <Tile2048 v={2048} position={[0, 0, 0]} />
        </group>
      </group>
    </Stage>
  );
}

function SudokuCover() {
  const puzzle = '530070000600195000098000060800060003400803001700020006060000280000419005000080079';
  const solved = '534678912672195348198342567859761423426853791713924856961537284287419635345286179';
  return (
    <Stage bg="#10122a" floor="#0c0e22" rim="#818cf8" rim2="#22d3ee" keyLight={[-3, 9, 6]}>
      <RoundedBox args={[9.9, 0.2, 9.9]} radius={0.08} position={[0, 0.1, 0]} receiveShadow castShadow>
        <meshStandardMaterial color="#1e2146" roughness={0.6} />
      </RoundedBox>
      {Array.from({ length: 81 }, (_, i) => {
        const r = Math.floor(i / 9);
        const c = i % 9;
        const given = puzzle[i] !== '0';
        const filled = given || (r + c * 2) % 3 === 0;
        const x = (c - 4) * 1.02 + (Math.floor(c / 3) - 1) * 0.08;
        const z = (r - 4) * 1.02 + (Math.floor(r / 3) - 1) * 0.08;
        return <SudokuCell key={i} position={[x, 0.2, z]} digit={filled ? solved[i] : ''} given={given} hot={r === 4 && c === 4} />;
      })}
    </Stage>
  );
}

function SudokuCell({ position, digit, given, hot }: { position: V3; digit: string; given: boolean; hot: boolean }) {
  const tex = useTextTex(digit, given ? '#1e1b4b' : '#4f46e5', '700 150px "Segoe UI", Arial, sans-serif');
  return (
    <group position={position}>
      <RoundedBox args={[0.96, 0.14, 0.96]} radius={0.04} position={[0, hot ? 0.3 : 0.07, 0]} castShadow receiveShadow>
        <meshStandardMaterial color={hot ? '#c7d2fe' : '#f5f5fa'} roughness={0.5} />
      </RoundedBox>
      {digit && (
        <mesh position={[0, (hot ? 0.3 : 0.07) + 0.071, 0]} rotation-x={-Math.PI / 2}>
          <planeGeometry args={[0.9, 0.9]} />
          <meshBasicMaterial map={tex} transparent toneMapped={false} />
        </mesh>
      )}
    </group>
  );
}

function Bowl(props: G) {
  const geo = useMemo(() => {
    const pts = [[0, 0], [1.4, 0], [2.0, 0.12], [2.3, 0.45], [2.4, 0.7], [2.28, 0.72], [2.18, 0.5], [1.9, 0.24], [1.3, 0.14], [0, 0.14]].map(([x, y]) => new THREE.Vector2(x, y));
    const g = new THREE.LatheGeometry(pts, 96);
    g.computeVertexNormals();
    return g;
  }, []);
  return (
    <mesh geometry={geo} {...props} castShadow receiveShadow>
      <meshStandardMaterial color="#c9a14a" metalness={1} roughness={0.28} side={THREE.DoubleSide} />
    </mesh>
  );
}

function SicboCover() {
  return (
    <Stage bg="#220b0f" floor="#2a0d12" rim="#f43f5e" rim2="#fbbf24" keyLight={[-2, 9, 4]}>
      <Bowl />
      <Die3D value={6} position={[-0.55, 0.62, 0.25]} rotation={[0, 0.4, 0]} scale={0.95} />
      <Die3D value={5} position={[0.6, 0.62, 0.35]} rotation={[0, -0.3, 0]} scale={0.95} />
      <Die3D value={4} position={[0.05, 0.62, -0.7]} rotation={[0, 0.9, 0]} scale={0.95} />
    </Stage>
  );
}

const WHEEL = [0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10, 5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26];

function useWheelTex() {
  return useMemo(
    () => canvasTex(1024, 1024, (g) => {
      const c = 512;
      g.fillStyle = '#5a3217';
      g.beginPath();
      g.arc(c, c, 512, 0, Math.PI * 2);
      g.fill();
      const seg = (Math.PI * 2) / WHEEL.length;
      WHEEL.forEach((n, i) => {
        const a0 = i * seg - Math.PI / 2;
        g.beginPath();
        g.moveTo(c, c);
        g.arc(c, c, 470, a0, a0 + seg);
        g.closePath();
        g.fillStyle = n === 0 ? '#15803d' : i % 2 ? '#b91c1c' : '#141414';
        g.fill();
        g.save();
        g.translate(c, c);
        g.rotate(a0 + seg / 2 + Math.PI / 2);
        g.fillStyle = '#f5f0e1';
        g.font = 'bold 38px Georgia, serif';
        g.textAlign = 'center';
        g.fillText(String(n), 0, -420);
        g.restore();
      });
      g.strokeStyle = '#d4af37';
      g.lineWidth = 4;
      for (let i = 0; i < WHEEL.length; i++) {
        const a = i * seg - Math.PI / 2;
        g.beginPath();
        g.moveTo(c + Math.cos(a) * 300, c + Math.sin(a) * 300);
        g.lineTo(c + Math.cos(a) * 470, c + Math.sin(a) * 470);
        g.stroke();
      }
      const grad = g.createRadialGradient(c, c, 40, c, c, 330);
      grad.addColorStop(0, '#8a5a2b');
      grad.addColorStop(1, '#4a2911');
      g.fillStyle = grad;
      g.beginPath();
      g.arc(c, c, 330, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = '#d4af37';
      g.lineWidth = 8;
      g.beginPath();
      g.arc(c, c, 330, 0, Math.PI * 2);
      g.stroke();
    }),
    [],
  );
}

function RouletteCover() {
  const tex = useWheelTex();
  const gold = <meshStandardMaterial color="#d4af37" metalness={1} roughness={0.22} />;
  return (
    <Stage bg="#0a1712" floor="#0b2a1e" rim="#22c55e" rim2="#fbbf24" keyLight={[-3, 10, 4]}>
      <group position={[0, 0, 0]} rotation-y={0.3}>
        <mesh position={[0, 0.25, 0]} castShadow receiveShadow>
          <cylinderGeometry args={[3.4, 3.2, 0.5, 96]} />
          <meshStandardMaterial color="#3b1f0d" roughness={0.35} metalness={0.1} />
        </mesh>
        <mesh position={[0, 0.52, 0]} rotation-x={-Math.PI / 2} receiveShadow>
          <circleGeometry args={[3.2, 96]} />
          <meshStandardMaterial map={tex} roughness={0.4} />
        </mesh>
        <mesh position={[0, 0.55, 0]} rotation-x={Math.PI / 2} castShadow>
          <torusGeometry args={[3.3, 0.12, 20, 128]} />
          {gold}
        </mesh>
        {/* turret */}
        <mesh position={[0, 0.8, 0]} castShadow>
          <coneGeometry args={[0.55, 0.6, 48]} />
          {gold}
        </mesh>
        <mesh position={[0, 1.2, 0]} castShadow>
          <cylinderGeometry args={[0.06, 0.06, 0.5, 16]} />
          {gold}
        </mesh>
        {[0, 1, 2, 3].map((i) => (
          <group key={i} rotation-y={(i * Math.PI) / 2} position={[0, 1.2, 0]}>
            <mesh position={[0.45, 0, 0]} rotation-z={Math.PI / 2} castShadow>
              <cylinderGeometry args={[0.04, 0.04, 0.9, 12]} />
              {gold}
            </mesh>
            <mesh position={[0.9, 0, 0]} castShadow>
              <sphereGeometry args={[0.09, 16, 12]} />
              {gold}
            </mesh>
          </group>
        ))}
      </group>
      <mesh position={[1.1, 0.66, 2.35]} castShadow>
        <sphereGeometry args={[0.13, 32, 24]} />
        <meshPhysicalMaterial color="#ffffff" roughness={0.1} clearcoat={1} />
      </mesh>
    </Stage>
  );
}

function Rocket(props: G) {
  return (
    <group {...props}>
      <mesh castShadow>
        <cylinderGeometry args={[0.36, 0.4, 1.6, 48]} />
        <meshPhysicalMaterial color="#e8eaef" metalness={0.5} roughness={0.25} clearcoat={1} />
      </mesh>
      <mesh position={[0, 1.15, 0]} castShadow>
        <coneGeometry args={[0.36, 0.8, 48]} />
        <meshStandardMaterial color="#e11d48" roughness={0.35} />
      </mesh>
      <mesh position={[0, 0.3, 0.37]}>
        <circleGeometry args={[0.15, 32]} />
        <meshStandardMaterial color="#7dd3fc" emissive="#38bdf8" emissiveIntensity={0.8} />
      </mesh>
      {[0, 1, 2].map((i) => (
        <mesh key={i} position={[Math.sin((i * Math.PI * 2) / 3) * 0.42, -0.62, Math.cos((i * Math.PI * 2) / 3) * 0.42]} rotation-y={(i * Math.PI * 2) / 3} castShadow>
          <boxGeometry args={[0.07, 0.55, 0.42]} />
          <meshStandardMaterial color="#e11d48" roughness={0.35} />
        </mesh>
      ))}
      <mesh position={[0, -1.25, 0]} rotation-x={Math.PI}>
        <coneGeometry args={[0.3, 1.0, 32]} />
        <meshBasicMaterial color="#fbbf24" toneMapped={false} />
      </mesh>
      <mesh position={[0, -1.45, 0]} rotation-x={Math.PI}>
        <coneGeometry args={[0.18, 1.2, 32]} />
        <meshBasicMaterial color="#fff7d6" toneMapped={false} />
      </mesh>
    </group>
  );
}

function CrashCover() {
  const trail = useMemo(() => {
    const pts = [];
    for (let i = 0; i <= 40; i++) {
      const t = i / 40;
      pts.push(new THREE.Vector3(-6 + t * 8.2, -2.4 + Math.pow(t, 2.2) * 5.2, 0));
    }
    return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 120, 0.06, 12, false);
  }, []);
  const stars = useMemo(() => {
    const g = new THREE.BufferGeometry();
    const p = new Float32Array(900);
    for (let i = 0; i < 300; i++) {
      p[i * 3] = (Math.random() - 0.5) * 40;
      p[i * 3 + 1] = (Math.random() - 0.5) * 24;
      p[i * 3 + 2] = -6 - Math.random() * 10;
    }
    g.setAttribute('position', new THREE.BufferAttribute(p, 3));
    return g;
  }, []);
  return (
    <Stage bg="#120a24" rim="#a855f7" rim2="#f472b6" keyLight={[3, 6, 8]} bloom={0.9} fog={[20, 40]}>
      <points geometry={stars}>
        <pointsMaterial color="#ffffff" size={0.06} sizeAttenuation />
      </points>
      <mesh position={[-5.5, -5.2, -8]}>
        <sphereGeometry args={[5, 64, 48]} />
        <meshStandardMaterial color="#4c1d95" roughness={0.9} emissive="#2e1065" emissiveIntensity={0.4} />
      </mesh>
      <mesh geometry={trail}>
        <meshBasicMaterial color="#f472b6" toneMapped={false} />
      </mesh>
      <Rocket position={[2.5, 3.2, 0]} rotation={[0.2, 0.5, -0.62]} scale={0.85} />
    </Stage>
  );
}

function DungeonCover() {
  const flame = useRef<THREE.PointLight>(null);
  const rock = useMemo(() => {
    const g = new THREE.IcosahedronGeometry(1, 1);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const s = 1 + Math.sin(i * 12.9898) * 0.12;
      p.setXYZ(i, p.getX(i) * s * 1.3, p.getY(i) * s * 0.7, p.getZ(i) * s);
    }
    g.computeVertexNormals();
    return g;
  }, []);
  return (
    <Stage bg="#0b0a0c" floor="#151316" rim="#f97316" rim2="#64748b" keyLight={[-4, 8, 3]} keyIntensity={0.6} bloom={0.8} fog={[8, 22]}>
      <mesh geometry={rock} position={[0, 0.45, 0]} castShadow receiveShadow>
        <meshStandardMaterial color="#4b4a50" roughness={0.95} flatShading />
      </mesh>
      <group position={[0.1, 1.6, 0]} rotation={[0.05, 0.4, 0.1]}>
        <mesh castShadow>
          <boxGeometry args={[0.18, 2.4, 0.04]} />
          <meshStandardMaterial color="#e2e8f0" metalness={0.55} roughness={0.25} />
        </mesh>
        <mesh position={[0, 1.25, 0]} castShadow>
          <boxGeometry args={[0.9, 0.1, 0.12]} />
          <meshStandardMaterial color="#a16207" metalness={0.8} roughness={0.35} />
        </mesh>
        <mesh position={[0, 1.6, 0]} castShadow>
          <cylinderGeometry args={[0.06, 0.06, 0.6, 16]} />
          <meshStandardMaterial color="#3f2a14" roughness={0.8} />
        </mesh>
        <mesh position={[0, 1.95, 0]} castShadow>
          <sphereGeometry args={[0.1, 16, 12]} />
          <meshStandardMaterial color="#a16207" metalness={0.8} roughness={0.35} />
        </mesh>
      </group>
      <group position={[-2.4, 0, -1]}>
        <mesh position={[0, 1, 0]} castShadow>
          <cylinderGeometry args={[0.07, 0.09, 2, 12]} />
          <meshStandardMaterial color="#3f2a14" />
        </mesh>
        <mesh position={[0, 2.18, 0]} scale={[1, 1.7, 1]}>
          <sphereGeometry args={[0.13, 24, 16]} />
          <meshBasicMaterial color="#fdba74" toneMapped={false} />
        </mesh>
        <mesh position={[0, 2.12, 0]} scale={[1, 1.4, 1]}>
          <sphereGeometry args={[0.2, 24, 16]} />
          <meshBasicMaterial color="#ea580c" transparent opacity={0.55} toneMapped={false} />
        </mesh>
        <pointLight ref={flame} position={[0, 2.3, 0.2]} intensity={70} distance={14} color="#fb923c" castShadow />
      </group>
    </Stage>
  );
}

// ---------------------------------------------------------------- brand renders (transparent)
function LogoMark() {
  const cells: V3[] = [[-1, 0.5, 0], [0, 0.5, 0], [1, 0.5, 0], [0, -0.5, 0]];
  return (
    <>
      <ambientLight intensity={0.6} />
      <directionalLight position={[3, 6, 6]} intensity={2.4} />
      <Environment resolution={128}>
        <Lightformer form="rect" intensity={2.5} position={[0, 5, 5]} scale={[8, 4, 1]} />
        <Lightformer form="rect" intensity={1.2} position={[-5, 0, 2]} scale={[3, 6, 1]} color="#fde68a" />
      </Environment>
      <group rotation={[0.45, -0.6, 0]}>
        {cells.map((p, i) => <Block key={i} color="#f5b43c" emissive={0.05} position={p} />)}
      </group>
    </>
  );
}

function ChipMark() {
  return (
    <>
      <ambientLight intensity={0.7} />
      <directionalLight position={[3, 6, 5]} intensity={2.2} />
      <Environment resolution={128}>
        <Lightformer form="rect" intensity={2} position={[0, 5, 5]} scale={[8, 4, 1]} />
      </Environment>
      <Chip color="#c2410c" rotation={[1.0, 0, 0.25]} scale={1.8} />
    </>
  );
}

// ---------------------------------------------------------------- registry
interface CoverDef {
  scene: () => React.ReactElement;
  cam: V3;
  look: V3;
  fov?: number;
  transparent?: boolean;
}

export const COVERS: Record<string, CoverDef> = {
  tetris: { scene: TetrisCover, cam: [8, 7.8, 14.5], look: [0.4, 4.6, 0] },
  chess: { scene: ChessCover, cam: [4.2, 3.4, 5.4], look: [0, 0.6, 0], fov: 38 },
  xiangqi: { scene: XiangqiCover, cam: [3.6, 6.2, 7.2], look: [0, 0, 0.4], fov: 40 },
  caro: { scene: CaroCover, cam: [3.8, 6.2, 6.4], look: [0.4, 0, 0.2], fov: 42 },
  dots: { scene: DotsCover, cam: [3.4, 5.2, 5.6], look: [0.2, 0, 0], fov: 40 },
  monopoly: { scene: MonopolyCover, cam: [0.4, 3.8, 7.2], look: [-0.5, 0.2, 1.2], fov: 44 },
  tienlen: { scene: TienLenCover, cam: [0, 3.9, 3.4], look: [0, 0, 0.1], fov: 40 },
  poker: { scene: PokerCover, cam: [0.6, 3.6, 5.2], look: [0.6, 0.2, 0], fov: 40 },
  minesweeper: { scene: MinesweeperCover, cam: [4.2, 7.2, 7.2], look: [0.4, 0, 0.2], fov: 40 },
  '2048': { scene: G2048Cover, cam: [3.2, 5.6, 5.4], look: [0, 0.4, 0], fov: 40 },
  sudoku: { scene: SudokuCover, cam: [4.2, 5.4, 6.2], look: [0.8, 0, 0.8], fov: 44 },
  sicbo: { scene: SicboCover, cam: [0, 3.6, 4.4], look: [0, 0.5, 0], fov: 40 },
  roulette: { scene: RouletteCover, cam: [0, 6.4, 6.0], look: [0, 0.3, 0.3], fov: 42 },
  crash: { scene: CrashCover, cam: [0, 0.5, 11], look: [0, 0.5, 0], fov: 45 },
  dungeon: { scene: DungeonCover, cam: [2.6, 2.6, 5.4], look: [-0.2, 1.4, 0], fov: 42 },
  logo: { scene: LogoMark, cam: [0, 0, 7], look: [0, 0, 0], fov: 27, transparent: true },
  chip: { scene: ChipMark, cam: [0, 0, 7], look: [0, 0, 0], fov: 17, transparent: true },
};

export default function CoverScene({ id }: { id: string }) {
  const def = COVERS[id] ?? COVERS.tetris;
  const Scene = def.scene;
  return (
    <Canvas
      shadows
      dpr={1}
      camera={{ position: def.cam, fov: def.fov ?? 40 }}
      gl={{ antialias: true, alpha: !!def.transparent, preserveDrawingBuffer: true }}
    >
      <LookAt at={def.look} />
      <Suspense fallback={null}>
        <Scene />
        <Ready />
      </Suspense>
    </Canvas>
  );
}
