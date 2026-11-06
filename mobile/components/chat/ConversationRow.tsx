import { Ionicons } from '@expo/vector-icons';
import { memo } from 'react';
import { Pressable, Text, View } from 'react-native';

import { CountBadge } from '@/components/notifications/NotificationBell';
import { Avatar } from '@/components/profile/Avatar';
import { Skeleton } from '@/components/ui/Skeleton';
import { useTheme } from '@/hooks/useTheme';
import { type Conversation, conversationPreview } from '@/lib/chat';
import { formatRelative } from '@/lib/time';

const AVATAR = 48;

/** The avatar with a small green dot, only when the server says they are online right now. */
export function ChatAvatar({ userId, nickname, avatarKey, online, size = AVATAR }: { userId: string; nickname: string; avatarKey: string | null; online: boolean; size?: number }) {
  return (
    <View>
      <Avatar avatarKey={avatarKey} userId={userId} nickname={nickname} size={size} />
      {online ? (
        <View
          className="absolute bottom-0 right-0 h-3.5 w-3.5 rounded-full border-2 border-bg bg-success"
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
        />
      ) : null}
    </View>
  );
}

type Props = { conversation: Conversation; myId: string; now: number | undefined; onOpen: (id: string) => void };

/** One chat in the list. A request still waiting is shown muted and does not open. */
export const ConversationRow = memo(function ConversationRow({ conversation: c, myId, now, onOpen }: Props) {
  const { colors } = useTheme();
  const pending = c.status === 'pending_sent';
  const unread = !pending && c.unread > 0;
  const online = c.isOnline === true;
  const preview = conversationPreview(c, myId);
  const time = c.lastAt ? formatRelative(c.lastAt, now) : '';
  const label = [
    c.otherNickname,
    online ? 'online' : null,
    pending ? 'request sent, waiting for a reply' : preview,
    unread ? `${c.unread} unread` : null,
    c.muted ? 'muted' : null,
    time,
  ]
    .filter(Boolean)
    .join(', ');

  const content = (
    <>
      <ChatAvatar userId={c.otherId} nickname={c.otherNickname} avatarKey={c.otherAvatarKey} online={online} />
      <View className="min-w-0 flex-1 gap-0.5">
        <View className="flex-row items-center gap-2">
          <Text numberOfLines={1} className={`shrink text-base text-text ${unread ? 'font-extrabold' : 'font-semibold'}`}>
            {c.otherNickname}
          </Text>
          {c.muted ? <Ionicons name="notifications-off-outline" size={14} color={colors.textDim} /> : null}
          <View className="flex-1" />
          <Text className={`text-xs ${unread ? 'font-bold text-accent' : 'text-text-dim'}`}>{time}</Text>
        </View>
        <View className="flex-row items-center gap-2">
          <Text
            numberOfLines={1}
            className={`flex-1 text-sm ${pending ? 'italic text-text-dim' : unread ? 'font-bold text-text' : 'text-text-dim'}`}
          >
            {preview}
          </Text>
          {unread ? <CountBadge count={c.unread} /> : null}
        </View>
      </View>
    </>
  );

  if (pending) {
    return (
      <View accessible accessibilityLabel={label} className="min-h-[72px] flex-row items-center gap-3 px-4 py-2 opacity-60">
        {content}
      </View>
    );
  }
  return (
    <Pressable
      onPress={() => onOpen(c.id)}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint="Opens the chat"
      className="min-h-[72px] flex-row items-center gap-3 px-4 py-2 active:bg-surface2"
    >
      {content}
    </Pressable>
  );
});

/** "Requests (N)" at the top of the list. */
export function RequestsRow({ count, onPress }: { count: number; onPress: () => void }) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Chat requests, ${count} waiting`}
      className="min-h-14 flex-row items-center gap-3 border-b border-hairline px-4 py-2 active:bg-surface2"
    >
      <View className="h-12 w-12 items-center justify-center rounded-full bg-accent-dim">
        <Ionicons name="mail-unread-outline" size={22} color={colors.accent} />
      </View>
      <Text className="flex-1 text-base font-bold text-text">Requests ({count})</Text>
      <Ionicons name="chevron-forward" size={18} color={colors.textDim} />
    </Pressable>
  );
}

export function ConversationSkeleton() {
  return (
    <View className="flex-row items-center gap-3 px-4 py-3">
      <Skeleton width={AVATAR} height={AVATAR} className="rounded-full" />
      <View className="flex-1 gap-2">
        <Skeleton width="45%" height={14} />
        <Skeleton width="80%" height={12} />
      </View>
    </View>
  );
}
