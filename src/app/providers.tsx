'use client';
import type { ReactNode } from 'react';
import { AuthProvider } from '@/lib/auth';
import { PresenceProvider } from '@/lib/presence';
import { ToastProvider } from '@/components/ui';

export function Providers({ children }: { children: ReactNode }) {
  return (
    <ToastProvider>
      <AuthProvider>
        <PresenceProvider>{children}</PresenceProvider>
      </AuthProvider>
    </ToastProvider>
  );
}
