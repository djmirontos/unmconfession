import AsyncStorage from '@react-native-async-storage/async-storage';

import { getStartedStorageKey, type GetStartedStored, parseGetStartedStored } from '@/lib/getStarted';
import { logError } from '@/lib/log';

// Per user and per phone. Not sensitive, so plain AsyncStorage. A failed read counts as "not dismissed".
export async function readGetStarted(userId: string): Promise<GetStartedStored> {
  try {
    return parseGetStartedStored(await AsyncStorage.getItem(getStartedStorageKey(userId)));
  } catch (error) {
    logError('getStarted.read', error);
    return 'none';
  }
}

export async function writeGetStarted(userId: string, value: Exclude<GetStartedStored, 'none'>): Promise<void> {
  try {
    await AsyncStorage.setItem(getStartedStorageKey(userId), value);
  } catch (error) {
    logError('getStarted.write', error);
  }
}
