import { logError } from '@/lib/log';
import { type AskDecision, type AskTrigger, decidePushAsk } from '@/lib/pushPermission';
import {
  pushHasRuntimePrompt,
  pushSupported,
  readAskMemory,
  readPushPermission,
  registerThisDevice,
  requestPushPermission,
  writeAskMemory,
} from '@/lib/pushRegistration';
import { useAuthStore } from '@/stores/authStore';
import { usePushPromptStore } from '@/stores/pushPromptStore';

/**
 * Applies the ask policy (lib/pushPermission.ts) for the signed-in member: registers when allowed,
 * opens the explainer, or shows the system dialog when they asked for it (Settings "Enable").
 * Returns what was decided ('blocked': only the phone's settings can turn notifications on). Never throws.
 */
export async function askForPush(trigger: AskTrigger): Promise<AskDecision> {
  const userId = useAuthStore.getState().session?.user.id ?? null;
  if (!userId || !pushSupported()) return 'nothing';
  try {
    const [permission, memory] = await Promise.all([readPushPermission(), readAskMemory(userId)]);
    const decision = decidePushAsk({ runtimePrompt: pushHasRuntimePrompt(), permission, memory, trigger });
    if (decision === 'register') await registerThisDevice(userId);
    if (decision === 'explain') {
      await writeAskMemory(userId, { ...memory, explainerAsks: memory.explainerAsks + 1 });
      usePushPromptStore.getState().show();
    }
    if (decision === 'request' && (await requestPushPermission()).granted) await registerThisDevice(userId);
    return decision;
  } catch (error) {
    logError('push.ask', error);
    return 'nothing';
  }
}

/** The explainer's buttons: "Allow notifications" shows the system dialog; "Not now" is remembered. */
export async function answerPushExplainer(allow: boolean): Promise<void> {
  const userId = useAuthStore.getState().session?.user.id ?? null;
  if (!userId) return;
  try {
    if (allow) {
      if ((await requestPushPermission()).granted) await registerThisDevice(userId);
      return;
    }
    const memory = await readAskMemory(userId);
    await writeAskMemory(userId, { ...memory, declined: true });
  } catch (error) {
    logError('push.answer', error);
  }
}
