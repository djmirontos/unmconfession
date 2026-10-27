import AsyncStorage from '@react-native-async-storage/async-storage';

import { parseClosedIds } from '@/lib/announcementPick';
import { logError } from '@/lib/log';

// Per device on purpose (guests too; signing out keeps it). Not sensitive, so plain AsyncStorage.
const KEY = 'unm-closed-announcements';

export async function readClosedIds(): Promise<string[]> {
  try {
    return parseClosedIds(await AsyncStorage.getItem(KEY));
  } catch (error) {
    logError('closedAnnouncements.read', error);
    return [];
  }
}

export async function writeClosedIds(ids: readonly string[]): Promise<void> {
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify(ids));
  } catch (error) {
    logError('closedAnnouncements.write', error);
  }
}
