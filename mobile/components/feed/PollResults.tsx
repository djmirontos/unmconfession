import { Ionicons } from '@expo/vector-icons';
import { Pressable, Text, View } from 'react-native';

import { useTheme } from '@/hooks/useTheme';
import type { PollOption } from '@/lib/posts';
import { formatPollEnd } from '@/lib/time';

type Props = {
  options: readonly PollOption[];
  myVote: string | null;
  endsAt: string | null;
  /** Omit for a read-only poll (My Posts): rows are not tappable and show vote counts. */
  onVote?: () => void;
};

/** Options with percentage bars. Voting arrives in a later module; onVote gates it. Without onVote it is read-only. */
export function PollResults({ options, myVote, endsAt, onVote }: Props) {
  const { colors } = useTheme();
  const total = options.reduce((sum, o) => sum + o.votes, 0);
  const end = endsAt ? formatPollEnd(endsAt) : null;

  return (
    <View className="gap-2">
      {options.map((option) => {
        const pct = total > 0 ? Math.round((option.votes / total) * 100) : 0;
        const mine = option.id === myVote;
        return (
          <Pressable
            key={option.id}
            onPress={onVote}
            disabled={end?.ended || !onVote}
            accessibilityRole={onVote ? 'button' : 'text'}
            accessibilityLabel={`${option.label}, ${pct} percent${onVote ? '' : `, ${option.votes} ${option.votes === 1 ? 'vote' : 'votes'}`}${mine ? ', your vote' : ''}`}
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
                {onVote ? '' : `${option.votes} · `}
                {pct}%
              </Text>
            </View>
          </Pressable>
        );
      })}
      <Text className="text-xs text-text-dim">
        {total} {total === 1 ? 'vote' : 'votes'}
        {end ? ` · ${end.label}` : ''}
      </Text>
    </View>
  );
}
