'use client';

import { useEffect } from 'react';
import { useAuthStore } from '@/stores/authStore';

/**
 * Initialize the auth store on app mount.
 *
 * Place this component once in the root layout (inside <body>).
 * It checks localStorage for an existing token, validates expiry,
 * and populates the store. Runs only once on mount.
 */
export function AuthInitializer() {
  const initialize = useAuthStore((s) => s.initialize);

  useEffect(() => {
    initialize();
  }, [initialize]);

  return null;
}
