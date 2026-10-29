import AsyncStorage from '@react-native-async-storage/async-storage';
import * as aesjs from 'aes-js';
import { getRandomBytes } from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';

import { logError, logInfo } from '@/lib/log';

/**
 * Supabase auth storage, encrypted (Supabase's "LargeSecureStore" pattern for React Native).
 * SecureStore values are limited to about 2 KB and a session is larger, so every write makes a
 * fresh 256-bit AES key, keeps it in SecureStore and keeps the AES-CTR ciphertext in AsyncStorage
 * under the same name. A new key per write means a CTR counter is never reused with a key.
 */

// SecureStore keys allow only letters, digits, '.', '-' and '_'.
const secureKey = (key: string) => key.replace(/[^\w.-]/g, '_');

// aes-js 3.1.2 decodes 4-byte UTF-8 (emoji) wrongly, so the value is made ASCII first.
function encrypt(keyBytes: Uint8Array, value: string): string {
  const cipher = new aesjs.ModeOfOperation.ctr(keyBytes, new aesjs.Counter(1));
  return aesjs.utils.hex.fromBytes(cipher.encrypt(aesjs.utils.utf8.toBytes(encodeURIComponent(value))));
}

function decrypt(keyHex: string, encrypted: string): string {
  const cipher = new aesjs.ModeOfOperation.ctr(aesjs.utils.hex.toBytes(keyHex), new aesjs.Counter(1));
  return decodeURIComponent(aesjs.utils.utf8.fromBytes(cipher.decrypt(aesjs.utils.hex.toBytes(encrypted))));
}

// The key of the previous write. setItem writes the new key before the new ciphertext, so if the app
// is killed in between, the stored ciphertext still opens with this one.
const prevKey = (key: string) => `${secureKey(key)}.prev`;

// Writes run one at a time, so two writes never pair one write's key with the other's ciphertext.
let queue: Promise<unknown> = Promise.resolve();
function serial<T>(task: () => Promise<T>): Promise<T> {
  const run = queue.then(task, task);
  queue = run.catch(() => undefined);
  return run;
}

/** A Keystore read can fail for a moment (busy, device just unlocked): retried, then thrown, never treated as no session. */
async function readSecure(name: string): Promise<string | null> {
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await SecureStore.getItemAsync(name);
    } catch (error) {
      if (attempt >= 2) throw error;
      await new Promise((resolve) => setTimeout(resolve, 150 * 2 ** attempt));
    }
  }
}

/** The decrypted session, or null if this key does not open it. Supabase always stores JSON. */
function open(keyHex: string, encrypted: string): string | null {
  try {
    const value = decrypt(keyHex, encrypted);
    JSON.parse(value);
    return value;
  } catch {
    return null;
  }
}

async function remove(key: string): Promise<void> {
  await AsyncStorage.removeItem(key);
  for (const name of [secureKey(key), prevKey(key)]) {
    try {
      await SecureStore.deleteItemAsync(name);
    } catch (error) {
      logError('sessionStorage.remove', error);
    }
  }
}

const removeItem = (key: string) => serial(() => remove(key));

/**
 * A value that cannot be opened (no key after a restore or reinstall, the plain-text session from
 * before this storage existed) counts as no session: it is removed and the app continues as a guest.
 * A Keystore read that keeps failing is thrown instead, so the session stays for the next try.
 * Never logs values.
 */
const getItem = (key: string) =>
  serial(async (): Promise<string | null> => {
    const encrypted = await AsyncStorage.getItem(key);
    if (encrypted === null) return null;
    const keyHex = await readSecure(secureKey(key));
    const current = keyHex === null ? null : open(keyHex, encrypted);
    if (current !== null) return current;
    const prevHex = await readSecure(prevKey(key));
    const previous = prevHex === null ? null : open(prevHex, encrypted);
    if (previous !== null && prevHex !== null) {
      await SecureStore.setItemAsync(secureKey(key), prevHex).catch((error: unknown) => logError('sessionStorage.repair', error));
      return previous;
    }
    logInfo('sessionStorage', 'Unreadable stored session removed.');
    await remove(key).catch((error: unknown) => logError('sessionStorage.remove', error));
    return null;
  });

const setItem = (key: string, value: string) =>
  serial(async (): Promise<void> => {
    const keyBytes = getRandomBytes(32);
    const encrypted = encrypt(keyBytes, value);
    const oldHex = await SecureStore.getItemAsync(secureKey(key)).catch(() => null);
    if (oldHex !== null) await SecureStore.setItemAsync(prevKey(key), oldHex);
    await SecureStore.setItemAsync(secureKey(key), aesjs.utils.hex.fromBytes(keyBytes));
    await AsyncStorage.setItem(key, encrypted);
  });

export const encryptedSessionStorage = { getItem, setItem, removeItem };

/** Supabase keeps the session under sb-<project>-auth-token (and a PKCE verifier next to it). */
export const SUPABASE_SESSION_KEY = /^sb-.+-auth-token/;
