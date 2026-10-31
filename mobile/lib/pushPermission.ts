// When to ask for push permission. Pure (no imports), so tests/pushNotifications.test.mjs runs it.
//
// Android 13+ and iOS have a system prompt; we ask through an in-app explainer first and show the
// system dialog only after "Allow notifications". The explainer appears at most twice, ever: right
// after onboarding, and (only if the member chose "Not now") once more after their first post or
// comment. A permanently denied permission never triggers the system dialog again.

export type PermissionSnapshot = { granted: boolean; status: 'granted' | 'denied' | 'undetermined'; canAskAgain: boolean };

/** Remembered per member on the device. */
export type AskMemory = { explainerAsks: number; declined: boolean };

export const EMPTY_ASK_MEMORY: AskMemory = { explainerAsks: 0, declined: false };
export const MAX_EXPLAINER_ASKS = 2;

/** Android 12 and older grant notifications at install (no prompt); Android 13 is API level 33. */
export function hasRuntimePrompt(platform: string, androidApiLevel: number | null): boolean {
  if (platform === 'ios') return true;
  if (platform === 'android') return (androidApiLevel ?? 0) >= 33;
  return false;
}

/** onboarded: signed in with a nickname. published: a post or comment went out. settings: "Enable" tapped. */
export type AskTrigger = 'onboarded' | 'published' | 'settings';

/**
 * register: allowed, register the token. explain: show the in-app explainer. request: show the
 * system dialog now (user asked for it). blocked: only the phone's settings can turn it on.
 * nothing: do nothing.
 */
export type AskDecision = 'register' | 'explain' | 'request' | 'blocked' | 'nothing';

export function decidePushAsk(input: {
  runtimePrompt: boolean;
  permission: PermissionSnapshot;
  memory: AskMemory;
  trigger: AskTrigger;
}): AskDecision {
  const { runtimePrompt, permission, memory, trigger } = input;
  if (permission.granted) return 'register';
  // No system prompt (Android 12 and older, turned off in settings) or denied for good.
  if (!runtimePrompt || (permission.status === 'denied' && !permission.canAskAgain)) {
    return trigger === 'settings' ? 'blocked' : 'nothing';
  }
  if (trigger === 'settings') return 'request';
  if (memory.explainerAsks >= MAX_EXPLAINER_ASKS) return 'nothing';
  if (trigger === 'onboarded') return memory.explainerAsks === 0 ? 'explain' : 'nothing';
  // published: the one gentle reminder, only after "Not now".
  return memory.declined && memory.explainerAsks === 1 ? 'explain' : 'nothing';
}

/** The banner in Settings: none (allowed), blocked (open phone settings) or not-asked ("Enable"). */
export function permissionBanner(runtimePrompt: boolean, permission: PermissionSnapshot): 'none' | 'blocked' | 'not-asked' {
  if (permission.granted) return 'none';
  if (!runtimePrompt || (permission.status === 'denied' && !permission.canAskAgain)) return 'blocked';
  return 'not-asked';
}

/** The stored memory, or the empty one for anything unreadable. */
export function parseAskMemory(raw: string | null): AskMemory {
  if (!raw) return EMPTY_ASK_MEMORY;
  try {
    const v: unknown = JSON.parse(raw);
    if (typeof v !== 'object' || v === null) return EMPTY_ASK_MEMORY;
    const o = v as Record<string, unknown>;
    const asks = typeof o.explainerAsks === 'number' && Number.isFinite(o.explainerAsks) ? Math.max(0, Math.floor(o.explainerAsks)) : 0;
    return { explainerAsks: asks, declined: o.declined === true };
  } catch {
    return EMPTY_ASK_MEMORY;
  }
}
