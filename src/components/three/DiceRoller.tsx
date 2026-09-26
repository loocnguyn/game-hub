'use client';
import { useEffect, useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { ContactShadows, Environment, Lightformer } from '@react-three/drei';
import * as THREE from 'three';
import { Die3D } from './shared';

/** One die that tumbles for `duration` ms each time `rollKey` changes, then settles with `value` on top. */
function RollingDie({ value, rollKey, x, duration }: { value: number; rollKey: number | string; x: number; duration: number }) {
  const ref = useRef<THREE.Group>(null);
  const start = useRef(0);
  const spin = useRef(new THREE.Vector3());
  useEffect(() => {
    start.current = performance.now();
    spin.current.set(6 + Math.random() * 6, 5 + Math.random() * 6, 4 + Math.random() * 5);
  }, [rollKey]);
  useFrame(() => {
    const g = ref.current;
    if (!g) return;
    const t = Math.min(1, (performance.now() - start.current) / duration);
    const ease = 1 - Math.pow(1 - t, 3);
    const left = 1 - ease;
    g.rotation.set(spin.current.x * left * Math.PI, spin.current.y * left * Math.PI, spin.current.z * left * Math.PI);
    g.position.y = 0.5 + Math.abs(Math.sin(t * Math.PI * 3)) * (1 - t) * 1.6;
    g.position.x = x + Math.sin(t * 7) * (1 - t) * 0.4;
  });
  return <group ref={ref} position={[x, 0.5, 0]}><Die3D value={value} /></group>;
}

export default function DiceRoller({ values, rollKey, duration = 1100, className }: { values: number[]; rollKey: number | string; duration?: number; className?: string }) {
  const spacing = 1.35;
  const offset = ((values.length - 1) * spacing) / 2;
  return (
    <div className={className}>
      <Canvas dpr={[1, 1.75]} camera={{ position: [0, 4.2, 4.6], fov: 40 }} shadows gl={{ alpha: true }}>
        <ambientLight intensity={0.7} />
        <directionalLight position={[3, 6, 3]} intensity={1.5} castShadow />
        <Environment resolution={64}>
          <Lightformer form="rect" intensity={2} position={[0, 5, 2]} scale={[6, 3, 1]} />
        </Environment>
        {values.map((v, i) => (
          <RollingDie key={i} value={v} rollKey={`${rollKey}-${i}`} x={i * spacing - offset} duration={duration + i * 120} />
        ))}
        <ContactShadows position={[0, 0, 0]} opacity={0.55} scale={8} blur={2} far={3} />
      </Canvas>
    </div>
  );
}
