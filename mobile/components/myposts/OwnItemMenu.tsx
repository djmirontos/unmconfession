import { useRouter } from 'expo-router';

import { ActionSheet, type SheetAction } from '@/components/ui/ActionSheet';
import { useDeleteOwnItem } from '@/hooks/useDeleteOwnItem';
import type { MyItem } from '@/lib/myPosts';
import { canEdit } from '@/lib/ownItems';

type Props = {
  /** The item whose menu is open; null = closed. */
  item: MyItem | null;
  onClose: () => void;
  /** After a successful delete (e.g. leave the item's screen). */
  onDeleted?: () => void;
};

/** "⋯" menu for the author's own post or listing: Edit (when allowed) and Delete. */
export function OwnItemMenu({ item, onClose, onDeleted }: Props) {
  const router = useRouter();
  const confirmDelete = useDeleteOwnItem();

  const actions: SheetAction[] = [];
  if (item && canEdit(item)) {
    actions.push({
      label: 'Edit',
      icon: 'create-outline',
      onPress: () => router.push({ pathname: '/edit', params: { source: item.source, id: item.id } }),
    });
  }
  if (item) {
    actions.push({ label: 'Delete', icon: 'trash-outline', destructive: true, onPress: () => confirmDelete(item, onDeleted) });
  }

  return <ActionSheet visible={item !== null} actions={actions} onClose={onClose} />;
}
