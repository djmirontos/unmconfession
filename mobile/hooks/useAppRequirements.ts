import { useEffect, useRef } from 'react';

import { useAppActive } from '@/hooks/useAppActive';
import { fetchRequirement, readCachedRequirement, writeCachedRequirement } from '@/lib/appRequirements';
import { installedVersion } from '@/lib/config';
import { logError } from '@/lib/log';
import { isUpdateRequired, resolveRequirement } from '@/lib/versionGate';
import { useAppRequirementStore } from '@/stores/appRequirementStore';
import { useAuthStore } from '@/stores/authStore';

const MIN_INTERVAL_MS = 5 * 60 * 1000;

/**
 * Call once, from the root layout. Applies the cached requirement right away, then fetches
 * at start and on each return to the foreground (at most once every 5 minutes, counted per
 * attempt so being offline does not retry in a loop). Waits until the stored session has
 * been read so the RPC does not race the token restore.
 */
export function useAppRequirementsSync(): void {
  const restored = useAuthStore((s) => s.restored);
  const appActive = useAppActive();
  const lastAttemptAt = useRef<number | null>(null);
  const inFlight = useRef(false);
  const haveFresh = useRef(false);

  useEffect(() => {
    void readCachedRequirement().then((cached) => {
      if (cached && !haveFresh.current) useAppRequirementStore.getState().setRequirement(cached);
    });
  }, []);

  useEffect(() => {
    if (!restored || !appActive || inFlight.current) return;
    const now = Date.now();
    if (lastAttemptAt.current !== null && now - lastAttemptAt.current < MIN_INTERVAL_MS) return;
    lastAttemptAt.current = now;
    inFlight.current = true;

    void (async () => {
      const fetched = await fetchRequirement();
      if (fetched.kind === 'ok') {
        haveFresh.current = true;
        await writeCachedRequirement(fetched.requirement);
      }
      const { requirement, setRequirement } = useAppRequirementStore.getState();
      // The store already holds the cached or last fresh value.
      setRequirement(resolveRequirement(fetched, requirement ?? (await readCachedRequirement())));
    })()
      .catch((error: unknown) => logError('appRequirements.sync', error))
      .finally(() => {
        inFlight.current = false;
      });
  }, [restored, appActive]);
}

/** Whether the installed version is below the enforced minimum, plus where to update. */
export function useForceUpdate() {
  const requirement = useAppRequirementStore((s) => s.requirement);
  const installed = installedVersion();
  const required = !!requirement && installed !== null && isUpdateRequired(installed, requirement.minAppVersion);
  return { required, requirement, installed };
}
