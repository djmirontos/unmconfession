import { type ReactNode, useMemo } from 'react';
import { Text, View } from 'react-native';

import { AuthorLine } from '@/components/feed/AuthorLine';
import { PostImages } from '@/components/feed/PostImages';
import { Avatar } from '@/components/profile/Avatar';
import { Skeleton } from '@/components/ui/Skeleton';
import { authorLabel, isDeletedAuthor } from '@/lib/authorLabel';
import type { ModContent } from '@/lib/moderation';
import { parseImages } from '@/lib/posts';

const CARD = 'gap-3 rounded-2xl border border-hairline bg-surface1 p-4';

const STATUS_NOTES: Record<string, string> = {
  removed: 'This was already removed.',
  rejected: 'This was rejected and is not visible.',
  pending: 'This is waiting for review and is not visible yet.',
};

/** Small uppercase heading of a moderation screen section. */
export function SectionTitle({ children }: { children: string }) {
  return (
    <Text accessibilityRole="header" className="px-1 text-xs font-bold uppercase tracking-widest text-text-dim">
      {children}
    </Text>
  );
}

/** A reported or held item in full: author, status note, title, body and photos. `children` go under the author. */
export function ModContentCard({ content, children }: { content: ModContent; children?: ReactNode }) {
  const images = useMemo(() => parseImages(content.images), [content.images]);
  const note = content.status ? STATUS_NOTES[content.status] : undefined;
  return (
    <View className={CARD}>
      {content.type === 'profile' || !content.createdAt ? (
        <View className="flex-row items-center gap-3">
          <Avatar avatarKey={content.avatarKey} userId={content.authorId} nickname={content.nickname} size={36} deleted={isDeletedAuthor(content.nickname)} />
          <Text numberOfLines={1} className="shrink text-base font-bold text-text">
            {authorLabel(content.nickname)}
          </Text>
        </View>
      ) : (
        <View className="flex-row">
          <AuthorLine authorId={content.authorId} nickname={content.nickname} avatarKey={content.avatarKey} time={content.createdAt} />
        </View>
      )}
      {children}
      {note ? <Text className="text-sm font-semibold text-danger">{note}</Text> : null}
      {content.title ? <Text className="text-lg font-bold text-text">{content.title}</Text> : null}
      {content.body ? (
        <Text selectable className="text-base leading-6 text-text">
          {content.body}
        </Text>
      ) : content.type === 'profile' ? (
        <Text className="text-sm text-text-dim">No profile details. The report may be about the picture or the nickname.</Text>
      ) : null}
      <PostImages images={images} />
    </View>
  );
}

export function ModDetailSkeleton({ label }: { label: string }) {
  return (
    <View className="gap-3 p-4" accessibilityLabel={label} accessibilityRole="progressbar">
      <Skeleton height={180} className="rounded-2xl" />
      <Skeleton height={72} className="rounded-2xl" />
      <Skeleton height={72} className="rounded-2xl" />
    </View>
  );
}
