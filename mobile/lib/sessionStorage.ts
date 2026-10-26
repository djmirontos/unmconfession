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

async function removeItem(key: string): Promise<void> {
  await AsyncStorage.removeItem(key);
  try {
    await SecureStore.deleteItemAsync(secureKey(key));
  } catch (error) {
    logError('sessionStorage.remove', error);
  }
}

/**
 * A value that cannot be read back (no key after a restore or reinstall, a Keystore error, the
 * plain-text session from before this storage existed) counts as no session: it is removed and
 * the app continues as a guest. Never logs values.
 */
async function getItem(key: string): Promise<string | null> {
  const encrypted = await AsyncStorage.getItem(key);
  if (encrypted === null) return null;
  try {
    const keyHex = await SecureStore.getItemAsync(secureKey(key));
    if (keyHex === null) throw new Error('missing key');
    const value = decrypt(keyHex, encrypted);
    // Supabase always stores JSON; a wrong key decrypts to bytes that do not parse.
    JSON.parse(value);
    return value;
  } catch {
    logInfo('sessionStorage', 'Unreadable stored session removed.');
    await removeItem(key).catch((error: unknown) => logError('sessionStorage.remove', error));
    return null;
  }
}

async function setItem(key: string, value: string): Promise<void> {
  const keyBytes = getRandomBytes(32);
  const encrypted = encrypt(keyBytes, value);
  await SecureStore.setItemAsync(secureKey(key), aesjs.utils.hex.fromBytes(keyBytes));
  await AsyncStorage.setItem(key, encrypted);
}

export const encryptedSessionStorage = { getItem, setItem, removeItem };

/** Supabase keeps the session under sb-<project>-auth-token (and a PKCE verifier next to it). */
export const SUPABASE_SESSION_KEY = /^sb-.+-auth-token/;
