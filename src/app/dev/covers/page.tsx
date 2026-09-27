'use client';
import dynamic from 'next/dynamic';
import { Suspense, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';

// Dev-only page that scripts/render-covers.mjs screenshots to produce public/covers/*.
const CoverScene = dynamic(() => import('@/components/three/covers'), { ssr: false });

function Cover() {
  const id = useSearchParams().get('id') ?? 'tetris';
  const transparent = useSearchParams().has('transparent');
  useEffect(() => {
    if (!transparent) return;
    document.documentElement.style.background = 'transparent';
    document.body.style.background = 'transparent';
  }, [transparent]);
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 100 }}>
      <CoverScene id={id} />
    </div>
  );
}

export default function CoversPage() {
  if (process.env.NODE_ENV !== 'development') return null;
  return <Suspense><Cover /></Suspense>;
}
