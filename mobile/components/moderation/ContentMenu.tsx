import { useRouter } from 'expo-router';
import { useState } from 'react';

import { ReportSheet } from '@/components/moderation/ReportSheet';
import { ActionSheet, type SheetAction } from '@/components/ui/ActionSheet';
import { useBlockUser } from '@/hooks/useBlockUser';
import { useRequireAuth } from '@/hooks/useRequireAuth';
import { useStaff } from '@/hooks/useStaff';
import { useStaffRemove } from '@/hooks/useStaffRemove';
import { isDeletedAuthor } from '@/lib/authorLabel';
import { atNickname } from '@/lib/blocks';
import { getStaffMenuActions, type ModTarget, parseModTarget, targetTypeLabel } from '@/lib/moderation';
import type { ReportTarget } from '@/lib/reports';
import { useAuthStore } from '@/stores/authStore';

export type ContentMenuTarget = {
  type: ReportTarget;
  id: string;
  authorId: string;
  nickname: string | null;
};

type Props = {
  /** Someone else's post, comment or listing whose menu is open; null = closed. */
  target: ContentMenuTarget | null;
  onClose: () => void;
  /** After a successful block (e.g. leave a screen that belonged to them). */
  onBlocked?: (authorId: string) => void;
  /** After a moderator removed it, or found it already handled (e.g. leave its detail screen). */
  onRemoved?: (target: ModTarget) => void;
};

/**
 * "⋯" menu for other members' content: Report and Block (no Block for a deleted author). Guests get the
 * sign-in sheet. Staff also get a Moderation group (Remove…, Open in moderation), shown only once
 * is_staff() has confirmed it: the menu never waits for or asks the server when it opens.
 */
export function ContentMenu({ target, onClose, onBlocked, onRemoved }: Props) {
  const router = useRouter();
  const requireAuth = useRequireAuth();
  const confirmBlock = useBlockUser();
  const { isStaff } = useStaff();
  const userId = useAuthStore((s) => s.session?.user.id ?? null);
  const staffRemove = useStaffRemove(onRemoved);
  const [reporting, setReporting] = useState<{ type: ReportTarget; id: string } | null>(null);

  const actions: SheetAction[] = [];
  if (target) {
    actions.push({
      label: 'Report',
      icon: 'flag-outline',
      onPress: () => {
        if (requireAuth('report')) setReporting({ type: target.type, id: target.id });
      },
    });
    // A deleted account can no longer post, so there is nobody to block; Report stays.
    if (!isDeletedAuthor(target.nickname)) {
      actions.push({
        label: `Block ${atNickname(target.nickname)}`,
        icon: 'ban-outline',
        destructive: true,
        onPress: () => {
          if (requireAuth('block')) confirmBlock({ id: target.authorId, nickname: target.nickname }, onBlocked);
        },
      });
    }

    const staffActions = getStaffMenuActions(target.type, isStaff, target.authorId === userId);
    const modTarget = parseModTarget(target.type, target.id);
    if (modTarget && staffActions.length > 0) {
      const noun = targetTypeLabel(modTarget.type).toLowerCase();
      if (staffActions.includes('open')) {
        actions.push({
          label: 'Open in moderation',
          icon: 'shield-half-outline',
          section: 'Moderation',
          onPress: () => router.push({ pathname: '/moderation/report/[type]/[id]', params: { type: modTarget.type, id: modTarget.id } }),
        });
      }
      if (staffActions.includes('remove')) {
        actions.push({
          label: 'Remove…',
          icon: 'trash-outline',
          destructive: true,
          section: 'Moderation',
          accessibilityLabel: `Remove ${noun} as moderator`,
          onPress: () => {
            if (!staffRemove.busy) staffRemove.start(modTarget);
          },
        });
      }
    }
  }

  return (
    <>
      <ActionSheet visible={target !== null} actions={actions} onClose={onClose} />
      <ReportSheet target={reporting} onClose={() => setReporting(null)} />
      {staffRemove.sheet}
    </>
  );
}
