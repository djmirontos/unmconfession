import { randomUUID } from 'expo-crypto';
import { useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';

import { logError } from '@/lib/log';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';
import type { Tables } from '@/types/database';

type Table = 'feed_events' | 'comments' | 'notifications';
type ChangeEvent = 'INSERT' | 'UPDATE';

// A short trip to the background keeps the channel; after this it is closed
// and recreated on return (which counts as a resubscribe).
const BACKGROUND_GRACE_MS = 30 * 1000;
const RETRY_DELAYS_MS = [2000, 5000, 15000, 30000];

type Options<T extends Table> = {
  table: T;
  events: readonly ChangeEvent[];
  /** e.g. `post_id=eq.<uuid>`. Omit for the whole table. */
  filter?: string;
  /** False keeps the hook unsubscribed. */
  enabled?: boolean;
  /** Channel topic prefix (e.g. 'comments:post:<uuid>'); a random UUID is appended. Defaults to the table name. */
  topic?: string;
  onChange: (row: Tables<T>, event: ChangeEvent) => void;
  /**
   * Called on every SUBSCRIBED after the first one: a socket rejoin, a retry,
   * a return from a long background, or a sign-in/out. Events may have been
   * missed in between, so callers refetch.
   */
  onResubscribed?: () => void;
};

/**
 * postgres_changes subscription with a fresh UUID topic per channel. Rows reach
 * a viewer only if RLS lets them read the row. Errors and timeouts retry
 * quietly with backoff on a new channel.
 */
export function usePostgresChanges<T extends Table>({
  table,
  events,
  filter,
  enabled = true,
  topic,
  onChange,
  onResubscribed,
}: Options<T>): void {
  const handlers = useRef({ onChange, onResubscribed });
  useEffect(() => {
    handlers.current = { onChange, onResubscribed };
  });

  const userId = useAuthStore((s) => s.session?.user.id ?? null);
  const [live, setLive] = useState(true);
  // Bumped to force a new channel (retry, or back from a long background).
  const [generation, setGeneration] = useState(0);
  const everSubscribed = useRef(false);
  const failures = useRef(0);

  useEffect(() => {
    let backgroundAt: number | null = null;
    let pauseTimer: ReturnType<typeof setTimeout> | undefined;
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        clearTimeout(pauseTimer);
        const away = backgroundAt === null ? 0 : Date.now() - backgroundAt;
        backgroundAt = null;
        if (away > BACKGROUND_GRACE_MS) {
          setLive(true);
          setGeneration((g) => g + 1);
        }
      } else if (backgroundAt === null) {
        backgroundAt = Date.now();
        pauseTimer = setTimeout(() => setLive(false), BACKGROUND_GRACE_MS);
      }
    });
    return () => {
      clearTimeout(pauseTimer);
      sub.remove();
    };
  }, []);

  const eventsKey = events.join(',');

  useEffect(() => {
    if (!enabled || !live) return;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    const channel = supabase.channel(`${topic ?? table}:${randomUUID()}`);

    for (const event of eventsKey.split(',') as ChangeEvent[]) {
      channel.on<Tables<T>>(
        'postgres_changes',
        { event, schema: 'public', table, ...(filter ? { filter } : {}) },
        (payload) => {
          if (payload.eventType === 'DELETE') return;
          handlers.current.onChange(payload.new, payload.eventType);
        },
      );
    }

    channel.subscribe((status, error) => {
      if (status === 'SUBSCRIBED') {
        clearTimeout(retryTimer);
        failures.current = 0;
        if (everSubscribed.current) handlers.current.onResubscribed?.();
        everSubscribed.current = true;
      } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        logError(`realtime.${table}`, error ?? new Error(status), { status, attempt: failures.current + 1 });
        // The client also rejoins on its own; this is the fallback if it does not.
        clearTimeout(retryTimer);
        const delay = RETRY_DELAYS_MS[Math.min(failures.current, RETRY_DELAYS_MS.length - 1)];
        failures.current += 1;
        retryTimer = setTimeout(() => setGeneration((g) => g + 1), delay);
      }
    });

    return () => {
      clearTimeout(retryTimer);
      void supabase.removeChannel(channel);
    };
  }, [table, eventsKey, filter, enabled, topic, live, generation, userId]);
}
