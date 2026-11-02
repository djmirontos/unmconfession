import { logError, logInfo } from '@/lib/log';
import { type LatestAppInfo, toLatestAppInfo } from '@/lib/softUpdate';
import { supabase } from '@/lib/supabase';

export { toLatestAppInfo };

const TIMEOUT_MS = 8000;

/** get_latest_app_info (guests included). Never throws: any failure, timeout or odd shape is null. */
export async function fetchLatestAppInfo(): Promise<LatestAppInfo | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const { data, error } = await supabase.rpc('get_latest_app_info').abortSignal(controller.signal);
    if (error) {
      logError('rpc.get_latest_app_info', error);
      return null;
    }
    const info = toLatestAppInfo(data);
    if (!info) logInfo('rpc.get_latest_app_info', 'unexpected response shape');
    return info;
  } catch (error) {
    logError('rpc.get_latest_app_info', error);
    return null;
  } finally {
    clearTimeout(timer);
  }
}
