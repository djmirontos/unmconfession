import { useRouter } from 'expo-router';

import { ActionSheet, type SheetAction } from '@/components/ui/ActionSheet';
import { useDeleteOwnItem } from '@/hooks/useDeleteOwnItem';
import { useShareCard } from '@/hooks/useShareCard';
import type { MyItem } from '@/lib/myPosts';
import { canEdit } from '@/lib/ownItems';
import type { ShareItem } from '@/lib/share';

type Props = {
  /** The item whose menu is open; null = closed. */
  item: MyItem | null;
  onClose: () => void;
  /** After a successful delete (e.g. leave the item's screen). */
  onDeleted?: () => void;
  /** My Posts: offer Share for published items (detail screens have their own Share button). */
  withShare?: boolean;
};

/** "⋯" menu for the author's own post or listing: Share (published, My Posts), Edit (when allowed) and Delete. */
export function OwnItemMenu({ item, onClose, onDeleted, withShare = false }: Props) {
  const router = useRouter();
  const confirmDelete = useDeleteOwnItem();
  const share = useShareCard();

  const actions: SheetAction[] = [];
  if (withShare && item?.status === 'published') {
    const shareItem: ShareItem | null = item.feedPost
      ? { type: 'post', post: item.feedPost }
      : item.listingCard
        ? { type: 'listing', listing: item.listingCard }
        : null;
    if (shareItem) actions.push({ label: 'Share', icon: 'share-social-outline', onPress: () => void share(shareItem) });
  }
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
