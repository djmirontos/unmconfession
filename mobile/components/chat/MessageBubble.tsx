import { Ionicons } from '@expo/vector-icons';
import { memo } from 'react';
import { type AccessibilityActionEvent, Pressable, Text, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { Extrapolation, interpolate, useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { useTheme } from '@/hooks/useTheme';
import { type ChatRow, replyPreview } from '@/lib/chat';

export type MessageRow = Extract<ChatRow, { kind: 'message' }>;

// Swipe right this far to reply; the bubble never moves further than MAX.
const TRIGGER = 56;
const MAX = 72;

const timeLabel = (ms: number) => new Date(ms).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });

type Props = {
  row: MessageRow;
  myId: string;
  otherNickname: string;
  onReply: (row: MessageRow) => void;
  onMenu: (row: MessageRow) => void;
  onFailedPress: (row: MessageRow) => void;
};

/**
 * One message: mine on the right in the accent colour, theirs on the left. Swipe right to reply
 * (gesture-handler + Reanimated; a vertical move first lets the list scroll), long press for the
 * menu. A deleted message is a stub; an unsent one shows "Sending…" or "Not sent".
 */
export const MessageBubble = memo(function MessageBubble({ row, myId, otherNickname, onReply, onMenu, onFailedPress }: Props) {
  const { colors } = useTheme();
  const reduceMotion = useReducedMotion();
  const x = useSharedValue(0);
  const canReply = row.status === 'sent' && !row.deleted && row.id !== null;

  const reply = () => onReply(row);
  const pan = Gesture.Pan()
    .enabled(canReply)
    .activeOffsetX(14)
    .failOffsetY([-12, 12])
    .onUpdate((e) => {
      x.set(Math.max(0, Math.min(e.translationX, MAX)));
    })
    .onEnd(() => {
      if (x.get() >= TRIGGER) scheduleOnRN(reply);
      x.set(withTiming(0, { duration: reduceMotion ? 0 : 160 }));
    });
  const bubbleStyle = useAnimatedStyle(() => ({ transform: [{ translateX: x.get() }] }));
  const iconStyle = useAnimatedStyle(() => ({ opacity: interpolate(x.get(), [0, TRIGGER], [0, 1], Extrapolation.CLAMP) }));

  const quote = replyPreview(row.reply, myId, otherNickname);
  const sender = row.mine ? 'You' : otherNickname;
  const time = timeLabel(row.at);
  const state = row.status === 'sending' ? 'sending' : row.status === 'failed' ? 'not sent, tap for options' : '';
  const a11y = [
    sender,
    quote ? `replying to ${quote.deleted ? 'a deleted message' : `${quote.label}: ${quote.text}`}` : null,
    row.deleted ? 'message deleted' : row.body,
    time,
    state,
  ]
    .filter(Boolean)
    .join(', ');

  const onAction = (e: AccessibilityActionEvent) => {
    if (e.nativeEvent.actionName === 'reply') reply();
    else if (e.nativeEvent.actionName === 'longpress') onMenu(row);
    else if (e.nativeEvent.actionName === 'activate' && row.status === 'failed') onFailedPress(row);
  };

  const corners = row.mine
    ? `${row.firstInGroup ? '' : 'rounded-tr-md'} ${row.lastInGroup ? '' : 'rounded-br-md'}`
    : `${row.firstInGroup ? '' : 'rounded-tl-md'} ${row.lastInGroup ? '' : 'rounded-bl-md'}`;
  const fill = row.deleted ? 'border border-hairline bg-transparent' : row.mine ? 'bg-accent' : 'border border-hairline bg-surface2';
  const textColor = row.mine && !row.deleted ? 'text-on-accent' : 'text-text';

  return (
    <View className={`px-3 ${row.firstInGroup ? 'pt-2' : 'pt-0.5'}`}>
      <Animated.View style={iconStyle} className="absolute bottom-0 left-4 top-0 justify-center" pointerEvents="none">
        <Ionicons name="arrow-undo" size={20} color={colors.textDim} />
      </Animated.View>
      <GestureDetector gesture={pan}>
        <Animated.View style={bubbleStyle} className={row.mine ? 'items-end' : 'items-start'}>
          <Pressable
            onPress={row.status === 'failed' ? () => onFailedPress(row) : undefined}
            onLongPress={row.status === 'sent' ? () => onMenu(row) : undefined}
            delayLongPress={350}
            accessible
            accessibilityLabel={a11y}
            accessibilityActions={
              row.status === 'failed'
                ? [{ name: 'activate', label: 'Retry or remove' }]
                : canReply
                  ? [
                      { name: 'reply', label: 'Reply' },
                      { name: 'longpress', label: 'More options' },
                    ]
                  : row.status === 'sent'
                    ? [{ name: 'longpress', label: 'More options' }]
                    : []
            }
            onAccessibilityAction={onAction}
            className={`min-h-11 max-w-[80%] justify-center rounded-2xl px-3 py-2 ${fill} ${corners} ${row.status === 'sending' ? 'opacity-70' : ''}`}
          >
            {quote ? (
              <View className={`mb-1.5 rounded-lg border-l-2 px-2 py-1 ${row.mine ? 'border-on-accent bg-black/10' : 'border-accent bg-surface1'}`}>
                {quote.label ? <Text className={`text-xs font-bold ${textColor}`}>{quote.label}</Text> : null}
                <Text numberOfLines={2} className={`text-sm ${quote.deleted ? 'italic' : ''} ${row.mine ? 'text-on-accent' : 'text-text-dim'}`}>
                  {quote.text}
                </Text>
              </View>
            ) : null}
            {row.deleted ? (
              <Text className="text-base italic text-text-dim">Message deleted</Text>
            ) : (
              <Text className={`text-base ${textColor}`}>{row.body}</Text>
            )}
          </Pressable>
          {row.status === 'failed' ? (
            <Text className="mt-0.5 px-1 text-xs font-bold text-danger">{row.error ? `Not sent. ${row.error}` : 'Not sent.'} Tap to retry or remove.</Text>
          ) : row.lastInGroup || row.status === 'sending' ? (
            <Text className="mt-0.5 px-1 text-[11px] text-text-dim">{row.status === 'sending' ? 'Sending…' : time}</Text>
          ) : null}
        </Animated.View>
      </GestureDetector>
    </View>
  );
});

/** "Today" / "Yesterday" / a date, between days. */
export function DayLine({ label }: { label: string }) {
  return (
    <View className="items-center py-3" accessibilityRole="header">
      <Text className="rounded-full bg-surface2 px-3 py-1 text-xs font-bold text-text-dim">{label}</Text>
    </View>
  );
}
