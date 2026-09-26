'use client';
import { useMemo, useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Environment, Lightformer } from '@react-three/drei';
import { Bloom, EffectComposer } from '@react-three/postprocessing';
import * as THREE from 'three';

function StarField({ speed }: { speed: React.RefObject<number> }) {
  const N = 1500;
  const geo = useMemo(() => {
    const g = new THREE.BufferGeometry();
    const p = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) {
      p[i * 3] = (Math.random() - 0.5) * 60;
      p[i * 3 + 1] = (Math.random() - 0.5) * 60;
      p[i * 3 + 2] = -Math.random() * 40;
    }
    g.setAttribute('position', new THREE.BufferAttribute(p, 3));
    return g;
  }, []);
  useFrame((_, dt) => {
    const pos = geo.attributes.position as THREE.BufferAttribute;
    const v = (speed.current ?? 0.5) * dt;
    for (let i = 0; i < N; i++) {
      let y = pos.getY(i) - v * 12;
      if (y < -30) y += 60;
      pos.setY(i, y);
    }
    pos.needsUpdate = true;
  });
  return (
    <points geometry={geo}>
      <pointsMaterial size={0.12} color="#c4b5fd" transparent opacity={0.85} sizeAttenuation />
    </points>
  );
}

function Ship({ phase, mult }: { phase: React.RefObject<string>; mult: React.RefObject<number> }) {
  const g = useRef<THREE.Group>(null);
  const flame = useRef<THREE.Mesh>(null);
  const boom = useRef<THREE.Points>(null);
  const boomT = useRef(0);
  const boomGeo = useMemo(() => {
    const n = 400;
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(n * 3);
    const vel = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const d = new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize().multiplyScalar(2 + Math.random() * 6);
      vel.set([d.x, d.y, d.z], i * 3);
    }
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.userData.vel = vel;
    return geo;
  }, []);
  useFrame(({ clock }, dt) => {
    const ship = g.current;
    if (!ship) return;
    const ph = phase.current;
    const t = clock.elapsedTime;
    if (ph === 'running') {
      boomT.current = 0;
      ship.visible = true;
      const m = mult.current ?? 1;
      ship.position.y = THREE.MathUtils.lerp(ship.position.y, Math.min(2.5, -2 + Math.log(m) * 2.2), 0.05);
      ship.position.x = Math.sin(t * 1.3) * 0.3;
      ship.rotation.z = Math.sin(t * 1.3) * -0.12;
      if (flame.current) flame.current.scale.set(1, 1 + Math.sin(t * 40) * 0.2 + Math.min(1.5, m / 10), 1);
    } else if (ph === 'result') {
      if (boomT.current === 0) {
        const pos = boomGeo.attributes.position as THREE.BufferAttribute;
        for (let i = 0; i < pos.count; i++) pos.setXYZ(i, ship.position.x, ship.position.y, 0);
      }
      boomT.current += dt;
      ship.visible = false;
      const pos = boomGeo.attributes.position as THREE.BufferAttribute;
      const vel = boomGeo.userData.vel as Float32Array;
      for (let i = 0; i < pos.count; i++) pos.setXYZ(i, pos.getX(i) + vel[i * 3] * dt, pos.getY(i) + vel[i * 3 + 1] * dt, pos.getZ(i) + vel[i * 3 + 2] * dt);
      pos.needsUpdate = true;
      if (boom.current) (boom.current.material as THREE.PointsMaterial).opacity = Math.max(0, 1 - boomT.current / 1.8);
    } else {
      ship.visible = true;
      boomT.current = 0;
      ship.position.y = THREE.MathUtils.lerp(ship.position.y, -2.4, 0.08);
      ship.position.x = 0;
      ship.rotation.z = 0;
      if (flame.current) flame.current.scale.set(1, 0.3 + Math.sin(t * 20) * 0.05, 1);
      if (boom.current) (boom.current.material as THREE.PointsMaterial).opacity = 0;
    }
  });
  return (
    <>
      <group ref={g} position={[0, -2.4, 0]}>
        <mesh>
          <capsuleGeometry args={[0.38, 1.1, 8, 24]} />
          <meshPhysicalMaterial color="#e5e7eb" metalness={0.7} roughness={0.2} clearcoat={1} />
        </mesh>
        <mesh position={[0, 0.95, 0]}>
          <coneGeometry args={[0.36, 0.6, 32]} />
          <meshStandardMaterial color="#ec4899" emissive="#ec4899" emissiveIntensity={0.8} />
        </mesh>
        <mesh position={[0, 0.3, 0.36]}>
          <circleGeometry args={[0.14, 24]} />
          <meshStandardMaterial color="#22d3ee" emissive="#22d3ee" emissiveIntensity={2} />
        </mesh>
        {[0, 1, 2].map((i) => (
          <mesh key={i} position={[Math.sin((i * Math.PI * 2) / 3) * 0.38, -0.55, Math.cos((i * Math.PI * 2) / 3) * 0.38]} rotation={[0, (i * Math.PI * 2) / 3, 0]}>
            <boxGeometry args={[0.06, 0.5, 0.4]} />
            <meshStandardMaterial color="#a855f7" emissive="#a855f7" emissiveIntensity={0.7} />
          </mesh>
        ))}
        <mesh ref={flame} position={[0, -1.25, 0]} rotation={[Math.PI, 0, 0]}>
          <coneGeometry args={[0.28, 1.1, 24]} />
          <meshBasicMaterial color="#fbbf24" toneMapped={false} />
        </mesh>
        <pointLight position={[0, -1.4, 0]} color="#f59e0b" intensity={20} distance={6} />
      </group>
      <points ref={boom} geometry={boomGeo}>
        <pointsMaterial size={0.14} color="#fb923c" transparent opacity={0} toneMapped={false} blending={THREE.AdditiveBlending} depthWrite={false} />
      </points>
    </>
  );
}

export default function CrashScene({ phase, multiplier }: { phase: string; multiplier: number }) {
  const phaseRef = useRef(phase);
  phaseRef.current = phase;
  const multRef = useRef(multiplier);
  multRef.current = multiplier;
  const speed = useRef(0.4);
  speed.current = phase === 'running' ? 0.8 + Math.log(multiplier) * 2.5 : 0.25;
  return (
    <Canvas dpr={[1, 1.75]} camera={{ position: [0, 0, 9], fov: 50 }}>
      <color attach="background" args={['#050414']} />
      <ambientLight intensity={0.5} />
      <directionalLight position={[3, 5, 5]} intensity={1.4} />
      <pointLight position={[-5, 3, 3]} intensity={30} color="#a855f7" />
      <Environment resolution={64}>
        <Lightformer form="rect" intensity={2} position={[0, 4, 4]} scale={[6, 3, 1]} />
      </Environment>
      <StarField speed={speed} />
      <Ship phase={phaseRef} mult={multRef} />
      <EffectComposer multisampling={0}>
        <Bloom intensity={1.2} luminanceThreshold={0.3} mipmapBlur />
      </EffectComposer>
    </Canvas>
  );
}
