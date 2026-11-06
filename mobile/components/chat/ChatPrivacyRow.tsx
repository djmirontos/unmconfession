import { useRouter } from 'expo-router';

import { SettingsRow } from '@/components/profile/SettingsRow';
import { useChatEnabled } from '@/hooks/useChatEnabled';

/** Profile → Account → "Chat privacy". Rendered only while chat is on for this member. */
export function ChatPrivacyRow() {
  const router = useRouter();
  const { enabled } = useChatEnabled();
  if (!enabled) return null;
  return <SettingsRow icon="chatbubbles-outline" label="Chat privacy" onPress={() => router.push('/chat-privacy')} />;
}
