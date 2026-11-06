import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router/js-tabs';
import type { ComponentProps } from 'react';
import { type ColorValue, View } from 'react-native';

import { useChatEnabled } from '@/hooks/useChatEnabled';
import { useChatUnread } from '@/hooks/useChats';
import { useRequireAuth } from '@/hooks/useRequireAuth';
import { formatBadge, useUnreadNotifications } from '@/hooks/useUnreadNotifications';
import { useTheme } from '@/hooks/useTheme';
import { chatBadge } from '@/lib/chat';
import { useToastStore } from '@/stores/toastStore';

type IconName = ComponentProps<typeof Ionicons>['name'];

// While chat is not on for this viewer (off, staff-only, guests), Chats is a placeholder: its tab
// only says so and never opens. useChatEnabled is the only switch.
const CHATS_COMING_SOON = 'Chats are coming soon';

function tabIcon(active: IconName, inactive: IconName) {
  function TabIcon({ focused, color, size }: { focused: boolean; color: ColorValue; size: number }) {
    return <Ionicons name={focused ? active : inactive} size={size} color={color} />;
  }
  return TabIcon;
}

// Profile tab: a small accent dot while there are unread notifications.
function ProfileTabIcon({ focused, color, size }: { focused: boolean; color: ColorValue; size: number }) {
  const unread = useUnreadNotifications();
  return (
    <View>
      <Ionicons name={focused ? 'person' : 'person-outline'} size={size} color={color} />
      {unread > 0 ? (
        <View className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full border border-surface1 bg-accent" />
      ) : null}
    </View>
  );
}

export default function TabsLayout() {
  const { colors } = useTheme();
  const requireAuth = useRequireAuth();
  const chatOn = useChatEnabled().enabled;
  const chatUnread = useChatUnread();
  const badge = chatOn ? chatBadge(chatUnread.data) : undefined;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.textDim,
        tabBarStyle: { backgroundColor: colors.surface1, borderTopColor: colors.hairline },
        tabBarLabelStyle: { fontWeight: '700' },
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Feed', tabBarIcon: tabIcon('home', 'home-outline') }} />
      {chatOn ? (
        <Tabs.Screen
          name="chats"
          options={{
            title: 'Chats',
            tabBarIcon: tabIcon('chatbubbles', 'chatbubbles-outline'),
            tabBarAccessibilityLabel: badge ? `Chats, ${badge} new` : 'Chats',
            tabBarBadge: badge ? formatBadge(badge) : undefined,
            tabBarBadgeStyle: { backgroundColor: colors.accent, color: colors.onAccent, fontWeight: '700' },
          }}
        />
      ) : (
        <Tabs.Screen
          name="chats"
          options={{
            title: 'Chats',
            tabBarIcon: tabIcon('chatbubbles-outline', 'chatbubbles-outline'),
            tabBarAccessibilityLabel: 'Chats, coming soon',
            tabBarItemStyle: { opacity: 0.5 },
          }}
          listeners={{
            tabPress: (event) => {
              event.preventDefault();
              useToastStore.getState().show(CHATS_COMING_SOON);
            },
          }}
        />
      )}
      <Tabs.Screen
        name="create"
        options={{ title: 'Create', tabBarIcon: tabIcon('add-circle', 'add-circle-outline') }}
        listeners={{
          // Guests get the sign-in sheet instead of the composer.
          tabPress: (event) => {
            if (!requireAuth('post')) event.preventDefault();
          },
        }}
      />
      <Tabs.Screen
        name="market"
        options={{ title: 'Buy & Sell', tabBarIcon: tabIcon('pricetags', 'pricetags-outline') }}
      />
      <Tabs.Screen
        name="profile"
        options={{ title: 'Profile', tabBarIcon: ProfileTabIcon }}
      />
    </Tabs>
  );
}
