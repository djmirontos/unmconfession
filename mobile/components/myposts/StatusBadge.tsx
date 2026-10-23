import { Text, View } from 'react-native';

import type { ContentStatus } from '@/lib/myPosts';

const BADGE: Record<ContentStatus, { label: string; className: string; text: string }> = {
  published: { label: 'Published', className: 'border-success bg-success/10', text: 'text-success' },
  pending: { label: 'Pending review', className: 'border-accent bg-accent-dim', text: 'text-accent' },
  rejected: { label: 'Rejected', className: 'border-danger bg-danger/10', text: 'text-danger' },
  removed: { label: 'Removed', className: 'border-danger bg-danger/10', text: 'text-danger' },
};

export const statusLabel = (status: ContentStatus) => BADGE[status].label;

export function StatusBadge({ status }: { status: ContentStatus }) {
  const badge = BADGE[status];
  return (
    <View className={`self-start rounded-full border px-2.5 py-0.5 ${badge.className}`}>
      <Text className={`text-xs font-bold ${badge.text}`}>{badge.label}</Text>
    </View>
  );
}
