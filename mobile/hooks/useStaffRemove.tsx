import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useState } from 'react';
import { Alert } from 'react-native';

import { RemoveReasonSheet } from '@/components/moderation/RemoveReasonSheet';
import { useRemoveContent } from '@/hooks/useRemoveContent';
import { getModerationActionError } from '@/lib/errors';
import { type ModTarget, type RemovalReason, removalReasonText, targetTypeLabel } from '@/lib/moderation';
import { afterModeratorRemove } from '@/lib/moderationCache';
import { useToastStore } from '@/stores/toastStore';

export type RemoveOutcome = 'removed' | 'already_handled';

/**
 * The moderator Remove flow, shared by the report detail screen and the "⋯" menu: reason sheet
 * (required) → confirm → mod_review 'remove'. The server closes the open reports and tells the
 * author, so nothing else is called. On success, or when another moderator got there first, the
 * item leaves every cached list, the moderation caches refresh, and `onDone` runs (e.g. go back).
 * Render `sheet` once; call `start(target)` to begin. Never starts for a profile.
 */
export function useStaffRemove(onDone?: (target: ModTarget, outcome: RemoveOutcome) => void) {
  const queryClient = useQueryClient();
  const showToast = useToastStore((s) => s.show);
  const remove = useRemoveContent();
  const [target, setTarget] = useState<ModTarget | null>(null);
  const [error, setError] = useState<string | null>(null);

  const start = useCallback((next: ModTarget) => {
    if (next.type === 'profile') return;
    setError(null);
    setTarget(next);
  }, []);

  const finish = (done: ModTarget, message: string, outcome: RemoveOutcome) => {
    setTarget(null);
    showToast(message);
    afterModeratorRemove(queryClient, done);
    onDone?.(done, outcome);
  };

  const confirm = (reason: RemovalReason) => {
    const current = target;
    if (!current || remove.isPending) return;
    const noun = targetTypeLabel(current.type).toLowerCase();
    Alert.alert(`Remove this ${noun}?`, `Reason: ${removalReasonText(reason) ?? ''}. The author is notified and the open reports are closed.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: () => {
          setError(null);
          remove.mutate(
            { target: current, reason },
            {
              onSuccess: () => finish(current, 'Removed', 'removed'),
              onError: (e) => {
                const outcome = getModerationActionError(e);
                if (outcome.kind === 'already_handled') finish(current, outcome.message, 'already_handled');
                else setError(outcome.message);
              },
            },
          );
        },
      },
    ]);
  };

  const sheet = (
    <RemoveReasonSheet
      // A fresh sheet (no reason picked) for each item.
      key={target ? `${target.type}:${target.id}` : 'closed'}
      noun={target ? targetTypeLabel(target.type).toLowerCase() : null}
      busy={remove.isPending}
      error={error}
      onClose={() => setTarget(null)}
      onContinue={confirm}
    />
  );

  return { start, sheet, busy: remove.isPending };
}
