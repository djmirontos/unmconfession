import AsyncStorage from '@react-native-async-storage/async-storage';

import { LISTING_SECTIONS, type Markers } from '@/lib/listingUpdates';
import { logError } from '@/lib/log';

/**
 * One record per account key on this phone: "unm-listing-updates:<userId>" or "…:guest". The user id
 * is in the key, so forgetDeletedAccount (lib/auth.ts) removes it with the other per-user keys.
 */
export const listingUpdatesStorageKey = (accountKey: string) => `unm-listing-updates:${accountKey}`;

/** Only string marks of the two known sections survive; anything else reads as "no marker". */
export function parseStoredMarkers(raw: string | null): Markers {
  if (!raw) return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return {};
    const out: Markers = {};
    for (const section of LISTING_SECTIONS) {
      const value = (parsed as Record<string, unknown>)[section];
      if (typeof value === 'string' && Number.isFinite(Date.parse(value))) out[section] = value;
    }
    return out;
  } catch {
    return {};
  }
}

/** Throws when storage cannot be read: "unknown" must never look like "no markers" (that would seed over them). */
export async function readMarkers(accountKey: string): Promise<Markers> {
  try {
    return parseStoredMarkers(await AsyncStorage.getItem(listingUpdatesStorageKey(accountKey)));
  } catch (error) {
    logError('listingUpdates.read', error);
    throw error;
  }
}

export async function writeMarkers(accountKey: string, markers: Markers): Promise<void> {
  try {
    await AsyncStorage.setItem(listingUpdatesStorageKey(accountKey), JSON.stringify(markers));
  } catch (error) {
    logError('listingUpdates.write', error);
  }
}
