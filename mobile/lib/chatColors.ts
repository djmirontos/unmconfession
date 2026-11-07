// Every foreground/background colour pair used in components/chat/* and app/chat/* (chat screen,
// list rows, composer, bubbles, header, banners). Pure; tests/chatColors.test.mjs checks each pair
// against WCAG in both schemes. Keep this list in step with the classes in those files.
import type { ColorPair } from '@/lib/contrast';
import type { ThemeColors } from '@/theme/palettes';

export function chatColorPairs(c: ThemeColors): ColorPair[] {
  const text = (name: string, fg: string, bg: string): ColorPair => ({ name, fg, bg, kind: 'text' });
  const graphic = (name: string, fg: string, bg: string): ColorPair => ({ name, fg, bg, kind: 'graphic' });
  return [
    // Bubbles
    text('own bubble text', c.onChatOwn, c.chatOwn),
    text('other bubble text', c.text, c.chatOther),
    text('own bubble quote', c.onChatOwn, c.chatOwn),
    text('other bubble quote', c.text, c.chatOther),
    graphic('own quote bar', c.onChatOwn, c.chatOwn),
    graphic('other quote bar', c.chatAccent, c.chatOther),
    text('deleted stub', c.textDim, c.chatBg),
    text('time and "Sending…"', c.textDim, c.chatBg),
    text('"Not sent" line', c.danger, c.chatBg),
    text('day line', c.textDim, c.surface2),
    graphic('swipe-to-reply icon', c.textDim, c.chatBg),
    // Header
    text('header nickname', c.text, c.chatBg),
    text('header "Online"', c.textDim, c.chatBg),
    graphic('header back icon', c.text, c.chatBg),
    graphic('header menu icon', c.textDim, c.chatBg),
    graphic('online dot (chat)', c.success, c.chatBg),
    // Pending / new chat
    text('waiting banner text', c.text, c.surface2),
    graphic('waiting banner icon', c.chatAccent, c.surface2),
    text('new chat hint', c.textDim, c.chatBg),
    text('loading older / empty text', c.textDim, c.chatBg),
    // Composer
    text('composer input', c.text, c.surface2),
    text('composer placeholder', c.textDim, c.surface2),
    text('composer counter', c.textDim, c.surface1),
    text('composer counter over limit', c.danger, c.surface1),
    text('composer error and read-only reason', c.textDim, c.surface1),
    text('composer send error', c.danger, c.surface1),
    text('reply bar label', c.textDim, c.surface2),
    text('reply bar text', c.text, c.surface2),
    graphic('reply bar edge', c.chatAccent, c.surface2),
    graphic('reply bar close icon', c.textDim, c.surface2),
    graphic('send icon', c.onChatOwn, c.chatOwn),
    graphic('send icon (disabled)', c.textDim, c.surface2),
    // Chats list
    text('row nickname', c.text, c.bg),
    text('row preview', c.textDim, c.bg),
    text('row time', c.textDim, c.bg),
    text('row unread time', c.chatAccentText, c.bg),
    text('row "Request sent"', c.textDim, c.bg),
    text('unread badge', c.onChatOwn, c.chatOwn),
    text('requests row label', c.text, c.bg),
    graphic('requests row icon', c.chatAccent, c.chatAccentDim),
    graphic('muted icon', c.textDim, c.bg),
    graphic('online dot (list)', c.success, c.bg),
    graphic('chevron', c.textDim, c.bg),
    graphic('pull-to-refresh spinner', c.chatAccent, c.surface1),
    // The Message button on a profile keeps the app's amber accent.
    text('Message button label', c.onAccent, c.accent),
    graphic('Message button icon', c.onAccent, c.accent),
    // The new chat page.
    graphic('new chat icon', c.chatAccent, c.chatBg),
    // Reactions: badges under a bubble, the long-press bar and its actions.
    text('reaction badge count', c.text, c.surface2),
    text('my reaction badge count', c.text, c.chatAccentDim),
    graphic('my reaction badge outline', c.chatAccent, c.chatBg),
    graphic('reaction bar: my reaction outline', c.chatAccent, c.surface1),
    text('message action label', c.text, c.surface1),
    text('message action label (delete)', c.danger, c.surface1),
    graphic('message action icon', c.text, c.surface1),
    graphic('message action icon (delete)', c.danger, c.surface1),
  ];
}
