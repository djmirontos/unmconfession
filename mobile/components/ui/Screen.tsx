import type { ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

/** Safe-area, keyboard-aware scrolling container for form screens. */
export function Screen({ children }: { children: ReactNode }) {
  const insets = useSafeAreaInsets();
  return (
    <View className="flex-1 bg-bg" style={{ paddingTop: insets.top, paddingBottom: insets.bottom }}>
      <KeyboardAvoidingView className="flex-1" behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerClassName="grow gap-5 px-6 pb-8 pt-4">
          {children}
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}
