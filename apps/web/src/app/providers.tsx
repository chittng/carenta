'use client';

import { type QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { type ReactNode } from 'react';

import { Toaster } from '@/components/ui/sonner';
import { makeQueryClient } from '@/lib/query-client';

let browserQueryClient: QueryClient | undefined;

function getQueryClient(): QueryClient {
  // A fresh client per server render keeps visitors' data apart; the browser keeps one.
  if (typeof window === 'undefined') return makeQueryClient();
  browserQueryClient ??= makeQueryClient();
  return browserQueryClient;
}

export function Providers({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={getQueryClient()}>
      {children}
      {/* On phones toasts sit above the bottom tab bar (4rem + safe area). */}
      <Toaster
        richColors
        closeButton
        mobileOffset={{ bottom: 'calc(4.5rem + env(safe-area-inset-bottom))' }}
      />
    </QueryClientProvider>
  );
}
