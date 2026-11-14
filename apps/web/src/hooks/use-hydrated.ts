import { useSyncExternalStore } from 'react';

const subscribe = () => () => undefined;

/**
 * False during the server render and the hydration pass, true afterwards. Lets a client
 * component branch on browser-only state (e.g. the session) without a hydration mismatch.
 */
export function useHydrated(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
}
