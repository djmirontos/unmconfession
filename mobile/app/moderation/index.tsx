import { useRouter } from 'expo-router';
import { type ReactNode, useCallback, useState } from 'react';
import { RefreshControl, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BackHeader } from '@/components/layout/BackHeader';
import { SettingsGroup, SettingsRow } from '@/components/profile/SettingsRow';
import { Button } from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/Skeleton';
import { useModerationCounts } from '@/hooks/useModerationCounts';
import { useModerationStats } from '@/hooks/useModerationStats';
import { useOpenReportCount } from '@/hooks/useOpenReportCount';
import { useRecentSignups } from '@/hooks/useRecentSignups';
import { useStaffGuard } from '@/hooks/useStaffGuard';
import { useTheme } from '@/hooks/useTheme';
import { badgeStyle } from '@/lib/badges';
import { getModerationErrorMessage } from '@/lib/errors';
import { formatCount, formatSignupTime, heldBreakdown, type ModerationStats } from '@/lib/moderation';

/** A section that failed to load: the friendly message and Retry, kept small so the other sections stay visible. */
function SectionError({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  return (
    <View className="items-start gap-2 rounded-2xl border border-hairline bg-surface1 p-4">
      <Text className="text-sm text-text">{getModerationErrorMessage(error)}</Text>
      <Button label="Retry" variant="secondary" icon="refresh" onPress={onRetry} />
    </View>
  );
}

function SectionEmpty({ text }: { text: string }) {
  return (
    <View className="rounded-2xl border border-hairline bg-surface1 p-4">
      <Text className="text-sm text-text-dim">{text}</Text>
    </View>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View className="gap-2">
      <Text accessibilityRole="header" className="px-1 text-xs font-bold uppercase tracking-widest text-text-dim">
        {title}
      </Text>
      {children}
    </View>
  );
}

function RowsSkeleton({ count, label }: { count: number; label: string }) {
  return (
    <View className="gap-2" accessibilityLabel={label} accessibilityRole="progressbar">
      {Array.from({ length: count }, (_, i) => (
        <Skeleton key={i} height={56} className="rounded-2xl" />
      ))}
    </View>
  );
}

// Two cards per row; the fifth spans the width.
const CARD_STYLE = { flexBasis: '45%', flexGrow: 1 } as const;

function StatCard({ label, value }: { label: string; value: number }) {
  const shown = formatCount(value);
  return (
    <View accessible accessibilityLabel={`${label}, ${shown}`} style={CARD_STYLE} className="gap-1 rounded-2xl border border-hairline bg-surface1 p-4">
      <Text className="text-2xl font-bold text-text">{shown}</Text>
      <Text className="text-sm text-text-dim">{label}</Text>
    </View>
  );
}

function Overview({ stats }: { stats: ModerationStats }) {
  return (
    <View className="flex-row flex-wrap gap-3">
      <StatCard label="Total members" value={stats.totalMembers} />
      <StatCard label="New in 24 h" value={stats.signups24h} />
      <StatCard label="New in 7 days" value={stats.signups7d} />
      <StatCard label="Engaged members" value={stats.engagedMembers} />
      <StatCard label="Active in last 7 days" value={stats.active7d} />
    </View>
  );
}

/** Staff hub: open reports, member numbers, members by badge and the latest sign-ups. Nickname, dates and counts only. */
export default function ModerationScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { colors } = useTheme();
  const isStaff = useStaffGuard();
  const openCount = useOpenReportCount();
  const stats = useModerationStats();
  const signups = useRecentSignups();
  const held = useModerationCounts();
  const [pulling, setPulling] = useState(false);

  const onRefresh = useCallback(() => {
    setPulling(true);
    void Promise.allSettled([openCount.refetch(), held.refetch(), stats.refetch(), signups.refetch()]).finally(() => setPulling(false));
  }, [openCount, held, stats, signups]);

  if (!isStaff) return <View className="flex-1 bg-bg" />;

  let reports;
  if (openCount.data !== undefined) {
    reports = (
      <SettingsGroup>
        <SettingsRow
          icon="flag-outline"
          label="Open reports"
          value={formatCount(openCount.data)}
          onPress={() => router.push('/moderation/reports')}
          first
        />
      </SettingsGroup>
    );
  } else if (openCount.isError) {
    reports = <SectionError error={openCount.error} onRetry={() => void openCount.refetch()} />;
  } else {
    reports = <RowsSkeleton count={1} label="Loading open reports" />;
  }

  let review;
  if (held.data) {
    const breakdown = heldBreakdown(held.data);
    review = (
      <>
        <SettingsGroup>
          <SettingsRow
            icon="hourglass-outline"
            label="Held for review"
            value={formatCount(held.data.total)}
            accessibilityLabel={`Held for review, ${formatCount(held.data.total)}. ${breakdown}`}
            onPress={() => router.push('/moderation/held')}
            first
          />
        </SettingsGroup>
        <Text className="px-1 text-xs text-text-dim">{breakdown}</Text>
      </>
    );
  } else if (held.isError) {
    review = <SectionError error={held.error} onRetry={() => void held.refetch()} />;
  } else {
    review = <RowsSkeleton count={1} label="Loading held items" />;
  }

  let overview;
  let badges;
  if (stats.data) {
    overview = <Overview stats={stats.data} />;
    badges =
      stats.data.badgeCounts.length > 0 ? (
        <SettingsGroup>
          {stats.data.badgeCounts.map((b, i) => (
            <SettingsRow key={b.code} icon={badgeStyle(b.code).icon} label={b.name} value={formatCount(b.count)} first={i === 0} />
          ))}
        </SettingsGroup>
      ) : (
        <SectionEmpty text="No badges yet." />
      );
  } else if (stats.isError) {
    overview = <SectionError error={stats.error} onRetry={() => void stats.refetch()} />;
    badges = <SectionError error={stats.error} onRetry={() => void stats.refetch()} />;
  } else {
    overview = (
      <View className="flex-row flex-wrap gap-3" accessibilityLabel="Loading overview" accessibilityRole="progressbar">
        {Array.from({ length: 5 }, (_, i) => (
          <View key={i} style={CARD_STYLE}>
            <Skeleton height={84} className="rounded-2xl" />
          </View>
        ))}
      </View>
    );
    badges = <RowsSkeleton count={4} label="Loading badges" />;
  }

  let latest;
  if (signups.data) {
    latest =
      signups.data.length > 0 ? (
        <SettingsGroup>
          {signups.data.map((s, i) => (
            <SettingsRow key={s.userId} icon="person-outline" label={s.nickname} value={formatSignupTime(s.createdAt)} first={i === 0} />
          ))}
        </SettingsGroup>
      ) : (
        <SectionEmpty text="No members yet." />
      );
  } else if (signups.isError) {
    latest = <SectionError error={signups.error} onRetry={() => void signups.refetch()} />;
  } else {
    latest = <RowsSkeleton count={5} label="Loading latest sign-ups" />;
  }

  return (
    <View className="flex-1 bg-bg" style={{ paddingTop: insets.top }}>
      <BackHeader title="Moderation" />
      <ScrollView
        contentContainerClassName="gap-6 p-4"
        contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
        refreshControl={
          <RefreshControl
            refreshing={pulling}
            onRefresh={onRefresh}
            tintColor={colors.accent}
            colors={[colors.accent]}
            progressBackgroundColor={colors.surface1}
          />
        }
      >
        <Section title="Reports">{reports}</Section>
        <Section title="Review">{review}</Section>
        <Section title="Overview">
          {overview}
          <Text className="px-1 text-xs text-text-dim">Engaged: posted, listed, commented or reacted at least once.</Text>
        </Section>
        <Section title="Members by badge">{badges}</Section>
        <Section title="Latest sign-ups">{latest}</Section>
      </ScrollView>
    </View>
  );
}
