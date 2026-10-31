import { useCallback, useEffect, useState } from 'react';
import { AppState } from 'react-native';

import { logError } from '@/lib/log';
import type { PermissionSnapshot } from '@/lib/pushPermission';
import { pushSupported, readPushPermission } from '@/lib/pushRegistration';

/**
 * The phone's notification permission, read on mount and again whenever the app comes back to the
 * foreground (the member may have changed it in the phone's settings). null while unknown or
 * when push is not supported (simulator).
 */
export function usePushPermission() {
  const [permission, setPermission] = useState<PermissionSnapshot | null>(null);

  const refresh = useCallback(async () => {
    if (!pushSupported()) return;
    try {
      setPermission(await readPushPermission());
    } catch (error) {
      logError('push.permission', error);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void refresh();
    });
    return () => subscription.remove();
  }, [refresh]);

  return { permission, refresh };
}
