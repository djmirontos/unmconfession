import { useSyncExternalStore } from 'react';

const TICK_MS = 60 * 1000;

// One shared interval for every live poll on screen: it runs only while at least
// one subscriber is mounted, so "Ends in" ticks and polls flip to Ended without per-card timers.
let now = Date.now();
let timer: ReturnType<typeof setInterval> | null = null;
const listeners = new Set<() => void>();

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  if (!timer) {
    now = Date.now();
    timer = setInterval(() => {
      now = Date.now();
      for (const l of listeners) l();
    }, TICK_MS);
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && timer) {
      clearInterval(timer);
      timer = null;
    }
  };
}

const noopSubscribe = () => () => {};
const getNow = () => now;
const getNothing = () => undefined;

/** Current time, updated at most once a minute while `enabled`; undefined (no subscription) otherwise. */
export function useMinuteClock(enabled: boolean): number | undefined {
  return useSyncExternalStore<number | undefined>(enabled ? subscribe : noopSubscribe, enabled ? getNow : getNothing);
}
