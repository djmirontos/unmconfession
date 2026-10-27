import AsyncStorage from '@react-native-async-storage/async-storage';

import { logError, logInfo } from '@/lib/log';
import { supabase } from '@/lib/supabase';
import {
  type AppRequirement,
  parseCachedRequirement,
  parseRequirementRows,
  type RequirementFetch,
} from '@/lib/versionGate';

// Not sensitive (public settings), so plain AsyncStorage.
const CACHE_KEY = 'unm-app-requirements';
const TIMEOUT_MS = 8000;

/** Never throws: a network, server or shape problem is { kind: 'error' }. Works for guests. */
export async function fetchRequirement(): Promise<RequirementFetch> {
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, TIMEOUT_MS);
  try {
    const { data, error } = await supabase.rpc('get_app_requirements').abortSignal(controller.signal);
    if (timedOut) {
      logInfo('rpc.get_app_requirements', 'timed out');
      return { kind: 'timeout' };
    }
    if (error) {
      logError('rpc.get_app_requirements', error);
      return { kind: 'error' };
    }
    const requirement = parseRequirementRows(data);
    if (!requirement) {
      logInfo('rpc.get_app_requirements', 'unexpected response shape');
      return { kind: 'error' };
    }
    logInfo('rpc.get_app_requirements', 'ok');
    return { kind: 'ok', requirement };
  } catch (error) {
    if (timedOut) return { kind: 'timeout' };
    logError('rpc.get_app_requirements', error);
    return { kind: 'error' };
  } finally {
    clearTimeout(timer);
  }
}

export async function readCachedRequirement(): Promise<AppRequirement | null> {
  try {
    return parseCachedRequirement(await AsyncStorage.getItem(CACHE_KEY));
  } catch (error) {
    logError('appRequirements.readCache', error);
    return null;
  }
}

export async function writeCachedRequirement(requirement: AppRequirement): Promise<void> {
  try {
    await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(requirement));
  } catch (error) {
    logError('appRequirements.writeCache', error);
  }
}
