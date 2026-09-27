'use client';
import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import RoomView from './RoomView';

// Rooms live at /room?code=XXXX so the site can be exported as static files.
function Room() {
  const code = (useSearchParams().get('code') ?? '').trim().toUpperCase();
  return <RoomView key={code} code={code} />;
}

export default function RoomPage() {
  return <Suspense><Room /></Suspense>;
}
