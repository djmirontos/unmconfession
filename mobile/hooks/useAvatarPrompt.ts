import AsyncStorage from '@react-native-async-storage/async-storage';
import { skipToken, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useRef, useState } from 'react';

import {
  type AvatarPromptState,
  type AvatarPromptStorage,
  avatarPromptVisible,
  readAvatarPrompt,
  SEEN_STATE,
  shouldShowAvatarPrompt,
  writePending,
  writeSeen,
} from '@/lib/avatarPrompt';
import { logError } from '@/lib/log';
import { queryClient as appQueryClient } from '@/lib/queryClient';
import { useAuthStore } from '@/stores/authStore';

const queryKey = (userId: string) => ['avatar-prompt', userId] as const;

// Writes never fail silently: a lost write would bring the card back.
const storage: AvatarPromptStorage = {
  get: (key) => AsyncStorage.getItem(key),
  set: (key, value) => AsyncStorage.setItem(key, value).catch((error: unknown) => logError('avatarPrompt.set', error)),
  remove: (key) => AsyncStorage.removeItem(key).catch((error: unknown) => logError('avatarPrompt.remove', error)),
};

/** A read finished after the account changed: thrown away, nothing shown. */
class StaleAccountError extends Error {}

async function readFor(userId: string): Promise<AvatarPromptState> {
  const state = await readAvatarPrompt(storage, userId);
  if (useAuthStore.getState().session?.user.id !== userId) throw new StaleAccountError('account changed');
  return state;
}

/**
 * Onboarding finished (the sign-up code accepted, or the first nickname saved): this member may see
 * the "Pick your avatar" card once. Called from app/(auth)/verify.tsx and app/choose-nickname.tsx only.
 */
export function markPending(userId: string): void {
  void writePending(storage, userId);
  // Any earlier read for this id (none expected) must not hide the card.
  appQueryClient.removeQueries({ queryKey: queryKey(userId) });
}

/**
 * The "Pick your avatar" card: only for a member who just finished onboarding, once. The first time
 * it shows it is stored as seen (and pending removed), but it stays up for this visit; dismissing it
 * or opening the picker hides it at once. Hidden until both keys are read, so it never flashes.
 */
export function useAvatarPrompt(userId: string | null) {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: queryKey(userId ?? ''),
    queryFn: userId ? () => readFor(userId) : skipToken,
    staleTime: Infinity,
  });
  const stored = query.data ?? null;

  // The member it is being shown to in this visit (kept after the once-shown write).
  const [showingFor, setShowingFor] = useState<string | null>(null);
  if (userId && stored && shouldShowAvatarPrompt(stored) && showingFor !== userId) setShowingFor(userId);

  // Once shown: seen for good and pending gone, so the next mount or app start does not show it again.
  const written = useRef<string | null>(null);
  useEffect(() => {
    if (!showingFor || written.current === showingFor) return;
    written.current = showingFor;
    queryClient.setQueryData(queryKey(showingFor), SEEN_STATE);
    void writeSeen(storage, showingFor);
  }, [showingFor, queryClient]);

  const markSeen = useCallback(() => {
    if (!userId) return;
    queryClient.setQueryData(queryKey(userId), SEEN_STATE);
    setShowingFor(null);
    void writeSeen(storage, userId);
  }, [userId, queryClient]);

  const showPrompt = avatarPromptVisible({ userId, member: userId !== null, stored, showingFor });
  return { showPrompt, markSeen };
}
