import { Ionicons } from '@expo/vector-icons';
import { Pressable, Text } from 'react-native';

import { useRequireAuth } from '@/hooks/useRequireAuth';
import { useTheme } from '@/hooks/useTheme';
import { setAnswerUpvote } from '@/lib/answerUpvoteSync';
import type { ThreadComment } from '@/lib/comments';
import { OWN_ANSWER_MESSAGE } from '@/lib/errors';
import { upvoteA11yLabel } from '@/lib/upvotes';
import { useToastStore } from '@/stores/toastStore';

type Props = {
  comment: ThreadComment;
  /** My own answer: looks disabled, a tap only explains why. */
  own: boolean;
};

/** Upvote on a Q&A answer, in place of the reaction button. The count is always shown (0 too). */
export function UpvoteButton({ comment, own }: Props) {
  const { colors } = useTheme();
  const requireAuth = useRequireAuth();
  const showToast = useToastStore((s) => s.show);
  const voted = comment.myUpvote;

  const onPress = () => {
    if (!requireAuth('react')) return; // guests: sign-in sheet
    if (own) {
      showToast(OWN_ANSWER_MESSAGE);
      return;
    }
    setAnswerUpvote(comment.id, voted, !voted);
  };

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={upvoteA11yLabel(comment)}
      accessibilityState={{ selected: voted, disabled: own }}
      className={`min-h-11 flex-row items-center gap-1 self-start rounded-full px-2 active:bg-surface2 ${own ? 'opacity-50' : ''}`}
    >
      <Ionicons name={voted ? 'arrow-up-circle' : 'arrow-up-circle-outline'} size={18} color={voted ? colors.accent : colors.textDim} />
      <Text className={`text-xs font-bold ${voted ? 'text-accent' : 'text-text-dim'}`}>{comment.upvoteCount}</Text>
    </Pressable>
  );
}
