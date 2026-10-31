import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { logError, logInfo } from '@/lib/log';
import { type AskMemory, hasRuntimePrompt, parseAskMemory, type PermissionSnapshot } from '@/lib/pushPermission';
import { supabase } from '@/lib/supabase';

// Push side effects: permission, the Android channel, the Expo token and its registration.
// Logs carry a short label only, never the token or a user id (lib/log.ts redacts as well).

/** Same id as the expo-notifications plugin's defaultChannel and the database's channelId. */
const CHANNEL_ID = 'default';
const INDIGO = '#4F46E5';

// Foreground: shown as a banner and in the list, silent (no sound, no badge).
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

const androidApiLevel = (): number | null => (Platform.OS === 'android' && typeof Platform.Version === 'number' ? Platform.Version : null);

/** Android 13+ and iOS show a system prompt; Android 12 and older do not. */
export const pushHasRuntimePrompt = (): boolean => hasRuntimePrompt(Platform.OS, androidApiLevel());

/** Push needs a real phone (no simulator or emulator tokens). */
export const pushSupported = (): boolean => Device.isDevice && (Platform.OS === 'android' || Platform.OS === 'ios');

export async function readPushPermission(): Promise<PermissionSnapshot> {
  const p = await Notifications.getPermissionsAsync();
  return { granted: p.granted, status: p.status, canAskAgain: p.canAskAgain };
}

/** The Android channel must exist before the permission prompt (Android 13+) and before the token. */
async function ensureChannel(): Promise<void> {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
    name: 'General',
    importance: Notifications.AndroidImportance.HIGH,
    lightColor: INDIGO,
  });
}

/** The system dialog. Never called when the permission is denied for good (see lib/pushPermission.ts). */
export async function requestPushPermission(): Promise<PermissionSnapshot> {
  await ensureChannel();
  const p = await Notifications.requestPermissionsAsync();
  return { granted: p.granted, status: p.status, canAskAgain: p.canAskAgain };
}

function projectId(): string | null {
  const fromEas = Constants.easConfig?.projectId;
  if (fromEas) return fromEas;
  // app.json extra.eas.projectId, read without trusting its shape.
  const extra: unknown = Constants.expoConfig?.extra;
  if (typeof extra !== 'object' || extra === null || !('eas' in extra)) return null;
  const eas: unknown = extra.eas;
  if (typeof eas !== 'object' || eas === null || !('projectId' in eas)) return null;
  return typeof eas.projectId === 'string' ? eas.projectId : null;
}

// This session's registration: once per member per app session (updated_at refreshes each launch).
let registeredFor: string | null = null;
let currentToken: string | null = null;
let inFlight: Promise<void> | null = null;

/** Registers this phone's token for `userId` if allowed; at most once per session. Never throws. */
export function registerThisDevice(userId: string): Promise<void> {
  if (registeredFor === userId) return Promise.resolve();
  if (inFlight) return inFlight;
  inFlight = (async () => {
    try {
      if (!pushSupported()) return;
      if (!(await readPushPermission()).granted) return;
      await ensureChannel();
      const id = projectId();
      if (!id) {
        logError('push.register', new Error('no EAS projectId'));
        return;
      }
      const token = (await Notifications.getExpoPushTokenAsync({ projectId: id })).data;
      const platform = Platform.OS === 'ios' ? 'ios' : 'android';
      const { error } = await supabase.rpc('register_push_token', { p_token: token, p_platform: platform });
      if (error) throw error;
      registeredFor = userId;
      currentToken = token;
      logInfo('push.register', 'ok');
    } catch (error) {
      logError('push.register', error);
    } finally {
      inFlight = null;
    }
  })();
  return inFlight;
}

/**
 * Sign-out: forget this phone for the member. Started before the session is cleared (the request
 * already carries the token) and never awaited, so sign-out is never held up. Never throws.
 */
export function unregisterThisDevice(): void {
  const token = currentToken;
  registeredFor = null;
  currentToken = null;
  if (!token) return;
  void (async () => {
    try {
      const { error } = await supabase.rpc('unregister_push_token', { p_token: token });
      if (error) throw error;
    } catch (error) {
      logError('push.unregister', error);
    }
  })();
}

const askKey = (userId: string) => `push-ask:v1:${userId}`;

/** How often the explainer was shown to this member on this phone, and whether they said "Not now". */
export async function readAskMemory(userId: string): Promise<AskMemory> {
  try {
    return parseAskMemory(await AsyncStorage.getItem(askKey(userId)));
  } catch {
    return parseAskMemory(null);
  }
}

export async function writeAskMemory(userId: string, memory: AskMemory): Promise<void> {
  try {
    await AsyncStorage.setItem(askKey(userId), JSON.stringify(memory));
  } catch (error) {
    logError('push.askMemory', error);
  }
}
