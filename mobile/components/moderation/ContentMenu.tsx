import { useState } from 'react';

import { ReportSheet } from '@/components/moderation/ReportSheet';
import { ActionSheet, type SheetAction } from '@/components/ui/ActionSheet';
import { useBlockUser } from '@/hooks/useBlockUser';
import { useRequireAuth } from '@/hooks/useRequireAuth';
import { isDeletedAuthor } from '@/lib/authorLabel';
import { atNickname } from '@/lib/blocks';
import type { ReportTarget } from '@/lib/reports';

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
};

/** "⋯" menu for other members' content: Report and Block (no Block for a deleted author). Guests get the sign-in sheet. */
export function ContentMenu({ target, onClose, onBlocked }: Props) {
  const requireAuth = useRequireAuth();
  const confirmBlock = useBlockUser();
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
  }

  return (
    <>
      <ActionSheet visible={target !== null} actions={actions} onClose={onClose} />
      <ReportSheet target={reporting} onClose={() => setReporting(null)} />
    </>
  );
}
