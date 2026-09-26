'use client';
import { Canvas, useFrame, useThree, type ThreeElements } from '@react-three/fiber';
import { Environment, Float, Lightformer, Sparkles, Stars, PerformanceMonitor } from '@react-three/drei';
import { Bloom, EffectComposer, Vignette } from '@react-three/postprocessing';
import { Suspense, useRef, useState } from 'react';
import * as THREE from 'three';
import { ChessPiece3D, Die3D, Tetromino, XiangqiDisc } from './shared';

function Rig() {
  const { camera, pointer } = useThree();
  const target = useRef(new THREE.Vector3());
  useFrame((_, dt) => {
    target.current.set(pointer.x * 1.6, pointer.y * 0.9, 14);
    camera.position.lerp(target.current, 1 - Math.pow(0.001, dt));
    camera.lookAt(0, 0, 0);
  });
  return null;
}

function Spinner({ speed = 0.3, children, ...props }: { speed?: number; children: React.ReactNode } & ThreeElements['group']) {
  const ref = useRef<THREE.Group>(null);
  useFrame((_, dt) => {
    if (ref.current) {
      ref.current.rotation.y += dt * speed;
      ref.current.rotation.x += dt * speed * 0.35;
    }
  });
  return <group ref={ref} {...props}>{children}</group>;
}

function Rocket(props: ThreeElements['group']) {
  const flame = useRef<THREE.Mesh>(null);
  useFrame(({ clock }) => {
    if (flame.current) flame.current.scale.y = 1 + Math.sin(clock.elapsedTime * 30) * 0.15;
  });
  return (
    <group {...props}>
      <mesh castShadow>
        <cylinderGeometry args={[0.32, 0.36, 1.4, 32]} />
        <meshPhysicalMaterial color="#e5e7eb" metalness={0.6} roughness={0.2} clearcoat={1} />
      </mesh>
      <mesh position={[0, 1.0, 0]} castShadow>
        <coneGeometry args={[0.32, 0.7, 32]} />
        <meshStandardMaterial color="#ec4899" emissive="#ec4899" emissiveIntensity={0.6} />
      </mesh>
      <mesh position={[0, 0.25, 0.3]}>
        <circleGeometry args={[0.13, 24]} />
        <meshStandardMaterial color="#22d3ee" emissive="#22d3ee" emissiveIntensity={1.5} />
      </mesh>
      {[0, 1, 2].map((i) => (
        <mesh key={i} position={[Math.sin((i * Math.PI * 2) / 3) * 0.36, -0.55, Math.cos((i * Math.PI * 2) / 3) * 0.36]} rotation={[0, (i * Math.PI * 2) / 3, 0]}>
          <boxGeometry args={[0.06, 0.45, 0.35]} />
          <meshStandardMaterial color="#a855f7" emissive="#a855f7" emissiveIntensity={0.5} />
        </mesh>
      ))}
      <mesh ref={flame} position={[0, -1.05, 0]} rotation={[Math.PI, 0, 0]}>
        <coneGeometry args={[0.24, 0.8, 24]} />
        <meshBasicMaterial color="#fbbf24" transparent opacity={0.85} />
      </mesh>
    </group>
  );
}

function CaroMarks(props: ThreeElements['group']) {
  return (
    <group {...props}>
      <group position={[-0.7, 0, 0]}>
        <mesh rotation={[0, 0, Math.PI / 4]}><boxGeometry args={[1.1, 0.18, 0.18]} /><meshStandardMaterial color="#38bdf8" emissive="#38bdf8" emissiveIntensity={1.1} /></mesh>
        <mesh rotation={[0, 0, -Math.PI / 4]}><boxGeometry args={[1.1, 0.18, 0.18]} /><meshStandardMaterial color="#38bdf8" emissive="#38bdf8" emissiveIntensity={1.1} /></mesh>
      </group>
      <mesh position={[0.7, 0, 0]}><torusGeometry args={[0.4, 0.1, 20, 48]} /><meshStandardMaterial color="#f472b6" emissive="#f472b6" emissiveIntensity={1.1} /></mesh>
    </group>
  );
}

function Scene({ compact }: { compact?: boolean }) {
  const s = compact ? 0.8 : 1;
  return (
    <>
      <color attach="background" args={['#05050d']} />
      <fog attach="fog" args={['#05050d', 14, 34]} />
      <ambientLight intensity={0.35} />
      <directionalLight position={[5, 8, 6]} intensity={1.4} castShadow />
      <pointLight position={[-6, -2, 4]} intensity={40} color="#a855f7" />
      <pointLight position={[6, 3, 2]} intensity={30} color="#22d3ee" />
      <Environment resolution={128}>
        <Lightformer form="rect" intensity={3} position={[0, 5, -6]} scale={[12, 3, 1]} color="#a855f7" />
        <Lightformer form="rect" intensity={2} position={[-6, 0, 2]} scale={[3, 8, 1]} color="#22d3ee" />
        <Lightformer form="ring" intensity={2} position={[6, 2, 4]} scale={3} color="#f472b6" />
      </Environment>
      <Stars radius={60} depth={40} count={2500} factor={3} saturation={0} fade speed={0.6} />
      <Sparkles count={70} scale={[22, 12, 8]} size={2.4} speed={0.35} color="#c084fc" />

      <Float speed={1.4} rotationIntensity={0.7} floatIntensity={1.4}><Tetromino type="T" position={[-6.5 * s, 2.8, -1]} rotation={[0.3, 0.4, 0.2]} scale={0.8} /></Float>
      <Float speed={1.1} rotationIntensity={0.9} floatIntensity={1.2}><Tetromino type="I" position={[5.8 * s, -3.2, -2]} rotation={[0.2, -0.6, 0.9]} scale={0.8} /></Float>
      <Float speed={1.6} rotationIntensity={0.6} floatIntensity={1.6}><Tetromino type="L" position={[7.2 * s, 3.4, -4]} rotation={[-0.3, 0.5, -0.3]} scale={0.7} /></Float>
      <Float speed={1.3} rotationIntensity={0.8} floatIntensity={1.1}><Tetromino type="S" position={[-8 * s, -2.8, -3]} rotation={[0.5, 0.2, 0.4]} scale={0.7} /></Float>
      <Float speed={1.8} rotationIntensity={1} floatIntensity={1.3}><Tetromino type="O" position={[-2.5 * s, -4.6, -5]} scale={0.6} /></Float>
      <Float speed={1.2} rotationIntensity={0.7} floatIntensity={1.5}><Tetromino type="Z" position={[1.5 * s, 4.8, -6]} rotation={[0.2, 0.1, 0.5]} scale={0.6} /></Float>

      <Float speed={1} rotationIntensity={0.3} floatIntensity={1}>
        <Spinner speed={0.25}><ChessPiece3D type="k" white position={[3.2 * s, -0.6, 1]} scale={1.25} /></Spinner>
      </Float>
      <Float speed={1.2} rotationIntensity={0.4} floatIntensity={1.2}>
        <ChessPiece3D type="n" white={false} position={[-4.2 * s, -0.9, 0.5]} scale={1.15} rotation={[0.1, 0.8, 0]} />
      </Float>
      <Float speed={1.5} rotationIntensity={1.2} floatIntensity={1.3}>
        <XiangqiDisc char="帥" red position={[-3.4 * s, 3.4, -1.5]} rotation={[1.1, 0.2, 0.2]} scale={1.2} />
      </Float>
      <Float speed={1.4} rotationIntensity={1.2} floatIntensity={1.3}>
        <XiangqiDisc char="將" red={false} position={[4.4 * s, 2.2, -2.5]} rotation={[1.3, -0.3, -0.2]} scale={1.1} />
      </Float>
      <Float speed={2} rotationIntensity={2} floatIntensity={1.4}><Die3D value={6} position={[0.6 * s, -3.8, -1]} scale={0.8} rotation={[0.5, 0.6, 0.2]} /></Float>
      <Float speed={2.2} rotationIntensity={2} floatIntensity={1.4}><Die3D value={5} position={[2.0 * s, -4.4, -2]} scale={0.7} rotation={[0.9, 0.2, 0.7]} /></Float>
      <Float speed={1.3} rotationIntensity={0.5} floatIntensity={2}><Rocket position={[8.5 * s, 0.2, -3]} rotation={[0, 0, -0.5]} scale={0.9} /></Float>
      <Float speed={1.6} rotationIntensity={0.8} floatIntensity={1.2}><CaroMarks position={[-7 * s, 0.6, -4]} rotation={[0.2, 0.5, 0.1]} scale={0.8} /></Float>

      <Rig />
      <EffectComposer multisampling={0}>
        <Bloom intensity={0.9} luminanceThreshold={0.25} luminanceSmoothing={0.3} mipmapBlur />
        <Vignette eskil={false} offset={0.2} darkness={0.75} />
      </EffectComposer>
    </>
  );
}

export default function HeroScene({ compact }: { compact?: boolean }) {
  const [dpr, setDpr] = useState(1.5);
  return (
    <Canvas dpr={dpr} camera={{ position: [0, 0, 14], fov: 45 }} gl={{ antialias: true, powerPreference: 'high-performance' }}>
      <PerformanceMonitor onDecline={() => setDpr(1)} onIncline={() => setDpr(1.75)} />
      <Suspense fallback={null}>
        <Scene compact={compact} />
      </Suspense>
    </Canvas>
  );
}
