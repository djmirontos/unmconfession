import { Ionicons } from '@expo/vector-icons';
import { useEffect } from 'react';
import { AccessibilityInfo, Pressable, Text, View } from 'react-native';
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from 'react-native-reanimated';

import { useMinuteClock } from '@/hooks/useMinuteClock';
import { useTheme } from '@/hooks/useTheme';
import type { PollOption } from '@/lib/posts';
import { formatPollEnd } from '@/lib/time';

type Props = {
  options: readonly PollOption[];
  myVote: string | null;
  endsAt: string | null;
  /**
   * Omit for a read-only poll (My Posts): rows are not tappable and show vote counts.
   * Returns false when nothing was sent (guests get the sign-in sheet).
   */
  onVote?: (optionId: string) => boolean;
};

const votesLabel = (n: number) => `${n} ${n === 1 ? 'vote' : 'votes'}`;
const percent = (votes: number, total: number) => (total > 0 ? Math.round((votes / total) * 100) : 0);

/** Options with percentage bars. With onVote the rows are a radio group while the poll runs; without it, read-only. */
export function PollResults({ options, myVote, endsAt, onVote }: Props) {
  return onVote ? (
    <LivePoll options={options} myVote={myVote} endsAt={endsAt} onVote={onVote} />
  ) : (
    <ReadOnlyPoll options={options} myVote={myVote} endsAt={endsAt} />
  );
}

function ReadOnlyPoll({ options, myVote, endsAt }: Omit<Props, 'onVote'>) {
  const { colors } = useTheme();
  const total = options.reduce((sum, o) => sum + o.votes, 0);
  const end = endsAt ? formatPollEnd(endsAt) : null;

  return (
    <View className="gap-2">
      {options.map((option) => {
        const pct = percent(option.votes, total);
        const mine = option.id === myVote;
        return (
          <Pressable
            key={option.id}
            disabled
            accessibilityRole="text"
            accessibilityLabel={`${option.label}, ${pct} percent, ${votesLabel(option.votes)}${mine ? ', your vote' : ''}`}
            className={`h-11 justify-center overflow-hidden rounded-xl border bg-surface2 ${mine ? 'border-accent' : 'border-hairline'}`}
          >
            <View
              style={{ width: `${pct}%` }}
              className={`absolute bottom-0 left-0 top-0 ${mine ? 'bg-accent/30' : 'bg-hairline'}`}
            />
            <View className="flex-row items-center gap-2 px-3">
              {mine ? <Ionicons name="checkmark-circle" size={16} color={colors.accent} /> : null}
              <Text numberOfLines={1} className={`flex-1 text-sm text-text ${mine ? 'font-bold' : ''}`}>
                {option.label}
              </Text>
              <Text className="text-sm font-bold text-text">
                {`${option.votes} · `}
                {pct}%
              </Text>
            </View>
          </Pressable>
        );
      })}
      <Text className="text-xs text-text-dim">
        {votesLabel(total)}
        {end ? ` · ${end.label}` : ''}
      </Text>
    </View>
  );
}

function LivePoll({ options, myVote, endsAt, onVote }: Props & { onVote: (optionId: string) => boolean }) {
  // The shared minute clock runs only while this poll is still open.
  const clock = useMinuteClock(!!endsAt && !formatPollEnd(endsAt).ended);
  const end = endsAt ? formatPollEnd(endsAt, clock) : null;
  const closed = end?.ended ?? false;
  const total = options.reduce((sum, o) => sum + o.votes, 0);
  const top = options.reduce((max, o) => Math.max(max, o.votes), 0);

  const vote = (option: PollOption) => {
    if (closed || option.id === myVote || !onVote(option.id)) return;
    const votes = option.votes + 1;
    const newTotal = myVote ? total : total + 1;
    AccessibilityInfo.announceForAccessibility(
      `Voted for ${option.label}. ${votesLabel(votes)}, ${percent(votes, newTotal)} percent.`,
    );
  };

  return (
    <View className="gap-2">
      <View accessibilityRole="radiogroup" className="gap-2">
        {options.map((option) => (
          <PollOptionRow
            key={option.id}
            option={option}
            pct={percent(option.votes, total)}
            mine={option.id === myVote}
            leading={closed && top > 0 && option.votes === top}
            closed={closed}
            onPress={() => vote(option)}
          />
        ))}
      </View>
      <View>
        <Text className="text-xs text-text-dim">
          {votesLabel(total)}
          {end ? ` · ${end.label}` : ''}
        </Text>
        {end && !closed ? <Text className="text-xs text-text-dim">You can change your vote until then.</Text> : null}
      </View>
    </View>
  );
}

type RowProps = {
  option: PollOption;
  pct: number;
  mine: boolean;
  /** Ended polls: the option(s) with the most votes. */
  leading: boolean;
  closed: boolean;
  onPress: () => void;
};

function PollOptionRow({ option, pct, mine, leading, closed, onPress }: RowProps) {
  const { colors } = useTheme();
  const reduceMotion = useReducedMotion();
  const width = useSharedValue(pct);
  useEffect(() => {
    width.value = reduceMotion ? pct : withTiming(pct, { duration: 250 });
  }, [pct, reduceMotion, width]);
  const barStyle = useAnimatedStyle(() => ({ width: `${width.value}%` }));

  const bar = mine ? 'bg-accent/30' : leading ? 'bg-accent/15' : 'bg-hairline';
  return (
    <Pressable
      onPress={onPress}
      disabled={closed}
      accessibilityRole="radio"
      accessibilityState={{ selected: mine, disabled: closed }}
      accessibilityLabel={`${option.label}, ${votesLabel(option.votes)}, ${pct} percent${mine ? ', selected' : ''}${leading ? ', leading' : ''}`}
      className={`h-11 justify-center overflow-hidden rounded-xl border bg-surface2 ${mine ? 'border-accent' : 'border-hairline'} ${closed ? '' : 'active:opacity-80'}`}
    >
      <Animated.View style={barStyle} className={`absolute bottom-0 left-0 top-0 ${bar}`} />
      <View className="flex-row items-center gap-2 px-3">
        {mine ? <Ionicons name="checkmark-circle" size={16} color={colors.accent} /> : null}
        <Text numberOfLines={1} className={`flex-1 text-sm text-text ${mine || leading ? 'font-bold' : ''}`}>
          {option.label}
        </Text>
        <Text className={`text-sm font-bold ${leading ? 'text-accent' : 'text-text'}`}>
          {`${option.votes} · ${pct}%`}
        </Text>
      </View>
    </Pressable>
  );
}
