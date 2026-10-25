import { z } from 'zod';

import { logError, logInfo } from '@/lib/log';
import { supabase } from '@/lib/supabase';

/** Private to the signed-in user. Not in the persisted allowlist. */
export const mySettingsKey = (userId: string) => ['my-settings', userId] as const;

// The generated types call these non-null; both are null until the first nickname change.
const settingsSchema = z.object({
  notify_reactions: z.boolean(),
  notify_comments: z.boolean(),
  notify_replies: z.boolean(),
  nickname_changed_at: z.string().nullable(),
  nickname_next_change_at: z.string().nullable(),
});

export type MySettings = {
  notifyReactions: boolean;
  notifyComments: boolean;
  notifyReplies: boolean;
  /** When the nickname may be changed again; null = now. */
  nicknameNextChangeAt: string | null;
};

export type NotificationPref = 'notifyReactions' | 'notifyComments' | 'notifyReplies';

export async function fetchMySettings(): Promise<MySettings> {
  const { data, error } = await supabase.rpc('get_my_settings');
  if (error) {
    logError('rpc.get_my_settings', error);
    throw error;
  }
  const row = settingsSchema.parse(data[0]);
  return {
    notifyReactions: row.notify_reactions,
    notifyComments: row.notify_comments,
    notifyReplies: row.notify_replies,
    nicknameNextChangeAt: row.nickname_next_change_at,
  };
}

/** Changes one switch; the others stay as they are on the server. */
export async function setNotificationPref(pref: NotificationPref, on: boolean): Promise<void> {
  const args =
    pref === 'notifyReactions' ? { p_reactions: on } : pref === 'notifyComments' ? { p_comments: on } : { p_replies: on };
  const { error } = await supabase.rpc('set_notification_prefs', args);
  if (error) {
    logError('rpc.set_notification_prefs', error);
    throw error;
  }
  logInfo('rpc.set_notification_prefs', 'ok', { pref, on });
}

export async function changeNickname(nickname: string): Promise<void> {
  const { error } = await supabase.rpc('change_nickname', { p_nickname: nickname });
  if (error) {
    logError('rpc.change_nickname', error);
    throw error;
  }
  logInfo('rpc.change_nickname', 'ok');
}

/** Still inside the 30-day wait after the last nickname change. */
export function inNicknameCooldown(settings: MySettings | undefined, now = Date.now()): boolean {
  return !!settings?.nicknameNextChangeAt && Date.parse(settings.nicknameNextChangeAt) > now;
}
