import { FlashList, type ListRenderItemInfo } from '@shopify/flash-list';
import { Image } from 'expo-image';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, Text, View } from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';

import { EmptyState, ErrorState, RefreshErrorBanner } from '@/components/feed/ListStates';
import { Avatar } from '@/components/profile/Avatar';
import { useOpenProfile } from '@/components/profile/ProfileLink';
import { Skeleton } from '@/components/ui/Skeleton';
import { useBottomInset } from '@/hooks/useBottomInset';
import { type Reactor, type ReactorType, useReactorCounts, useReactors } from '@/hooks/useReactors';
import { useTheme } from '@/hooks/useTheme';
import { getErrorMessage } from '@/lib/errors';
import { REACTIONS } from '@/lib/reactions';
import { buildReactorTabs, reactorAccessibilityLabel, reactorLabel } from '@/lib/reactors';
import { useAuthStore } from '@/stores/authStore';
import { type ReactorsTarget, useReactorsSheetStore } from '@/stores/reactorsSheetStore';

const NOTE = 'Signed-in members can see who reacted.';
const AVATAR = 40;
const ICON = 22;

const keyExtractor = (row: Reactor) => row.user_id;

function RowSkeleton() {
  return (
    <View className="min-h-14 flex-row items-center gap-3 px-2 py-2">
      <Skeleton width={AVATAR} height={AVATAR} className="rounded-full" />
      <Skeleton width="45%" height={14} />
    </View>
  );
}

function Tabs({ target, value, onChange }: { target: ReactorsTarget; value: ReactorType; onChange: (t: ReactorType) => void }) {
  const counts = useReactorCounts(target);
  if (!counts.data) return <View className="h-11" />;
  const tabs = buildReactorTabs(counts.data);
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerClassName="gap-2 px-1" accessibilityRole="radiogroup">
      {tabs.map((tab) => {
        const selected = tab.key === value;
        const label = tab.key === 'all' ? `All, ${tab.total}` : `${REACTIONS[tab.key].label}, ${tab.total}`;
        return (
          <Pressable
            key={tab.key}
            onPress={() => onChange(tab.key)}
            accessibilityRole="radio"
            accessibilityLabel={label}
            accessibilityState={{ selected }}
            className={`min-h-11 flex-row items-center gap-1.5 rounded-full border px-3 ${selected ? 'border-accent bg-accent-dim' : 'border-hairline bg-surface2'}`}
          >
            {tab.key === 'all' ? (
              <Text className="text-sm font-bold text-text">All</Text>
            ) : (
              <Image source={REACTIONS[tab.key].image} style={{ width: 18, height: 18 }} contentFit="contain" />
            )}
            <Text className="text-sm font-bold text-text-dim">{tab.total}</Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

function ReactorsList({ target, type, onOpenProfile }: { target: ReactorsTarget; type: ReactorType; onOpenProfile: (id: string) => void }) {
  const { colors } = useTheme();
  const viewerId = useAuthStore((s) => s.session?.user.id ?? null);
  const { query, rows } = useReactors(target, type);

  const renderItem = useCallback(
    ({ item }: ListRenderItemInfo<Reactor>) => {
      const name = reactorLabel(item, viewerId);
      return (
        <Pressable
          onPress={() => onOpenProfile(item.user_id)}
          accessibilityRole="button"
          accessibilityLabel={reactorAccessibilityLabel(name, REACTIONS[item.type].label)}
          className="min-h-14 flex-row items-center gap-3 rounded-xl px-2 py-2 active:bg-surface2"
        >
          <Avatar avatarKey={item.avatar_key} userId={item.user_id} nickname={item.nickname} size={AVATAR} />
          <Text numberOfLines={1} className="flex-1 text-base font-bold text-text">
            {name}
          </Text>
          <Image source={REACTIONS[item.type].image} style={{ width: ICON, height: ICON }} contentFit="contain" />
        </Pressable>
      );
    },
    [viewerId, onOpenProfile],
  );

  const onEndReached = useCallback(() => {
    if (query.hasNextPage && !query.isFetchingNextPage && !query.isFetchNextPageError) void query.fetchNextPage();
  }, [query]);

  if (!query.data) {
    return query.isError ? (
      <ErrorState message={getErrorMessage(query.error)} onRetry={() => void query.refetch()} />
    ) : (
      <View accessibilityLabel="Loading" accessibilityRole="progressbar">
        <RowSkeleton />
        <RowSkeleton />
        <RowSkeleton />
      </View>
    );
  }

  return (
    <FlashList
      data={rows}
      renderItem={renderItem}
      keyExtractor={keyExtractor}
      onEndReached={onEndReached}
      onEndReachedThreshold={0.5}
      ListEmptyComponent={<EmptyState icon="happy-outline" title="No reactions yet" />}
      ListFooterComponent={
        query.isFetchNextPageError ? (
          <View className="py-3">
            <RefreshErrorBanner onRetry={() => void query.fetchNextPage()} />
          </View>
        ) : query.isFetchingNextPage ? (
          <ActivityIndicator className="py-4" color={colors.accent} accessibilityLabel="Loading more" />
        ) : !query.hasNextPage && rows.length > 0 ? (
          <Text className="py-4 text-center text-sm text-text-dim">That&apos;s everyone.</Text>
        ) : null
      }
    />
  );
}

/** Bottom sheet: who reacted to a post or comment (avatar, nickname, their reaction). Mounted once at the root. */
export function ReactorsSheet() {
  const bottomInset = useBottomInset();
  const reduceMotion = useReducedMotion();
  const target = useReactorsSheetStore((s) => s.target);
  const close = useReactorsSheetStore((s) => s.close);
  const signedIn = useAuthStore((s) => s.session !== null);
  const openProfile = useOpenProfile();
  // The tab belongs to one opening: a new target starts on All.
  const [tab, setTab] = useState<{ key: string; type: ReactorType } | null>(null);
  const targetKey = target ? `${target.type}:${target.id}` : '';
  const type: ReactorType = tab && tab.key === targetKey ? tab.type : 'all';
  const shown = signedIn ? target : null;

  const onOpenProfile = useCallback(
    (userId: string) => {
      close();
      openProfile(userId);
    },
    [close, openProfile],
  );

  return (
    <Modal visible={shown !== null} transparent animationType={reduceMotion ? 'none' : 'slide'} onRequestClose={close} statusBarTranslucent>
      <View className="flex-1 justify-end">
        <Pressable className="absolute inset-0 bg-black/50" onPress={close} accessibilityRole="button" accessibilityLabel="Close reactions" />
        <View
          className="h-[75%] gap-3 rounded-t-3xl border-t border-hairline bg-surface1 px-4 pt-3"
          style={{ paddingBottom: bottomInset + 12 }}
          accessibilityViewIsModal
        >
          <View className="h-1 w-10 self-center rounded-full bg-hairline" />
          <View className="gap-0.5 px-2">
            <Text accessibilityRole="header" className="text-lg font-bold text-text">
              Reactions
            </Text>
            <Text className="text-xs text-text-dim">{NOTE}</Text>
          </View>
          {shown ? (
            <>
              <View>
                <Tabs target={shown} value={type} onChange={(t) => setTab({ key: targetKey, type: t })} />
              </View>
              <View className="flex-1">
                <ReactorsList key={`${targetKey}:${type}`} target={shown} type={type} onOpenProfile={onOpenProfile} />
              </View>
            </>
          ) : null}
        </View>
      </View>
    </Modal>
  );
}
