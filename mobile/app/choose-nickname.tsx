import { useQueryClient } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import { AccessibilityInfo, Keyboard, Platform, Pressable, type ScrollView, Text, type TextInput, View } from 'react-native';

import { AuthHeader } from '@/components/auth/AuthHeader';
import { NicknameField } from '@/components/auth/NicknameField';
import { TermsCheckbox } from '@/components/auth/TermsCheckbox';
import { Button } from '@/components/ui/Button';
import { FormMessage } from '@/components/ui/FormMessage';
import { Screen } from '@/components/ui/Screen';
import { markPending } from '@/hooks/useAvatarPrompt';
import { ensureNicknameAvailable, nicknameAvailableKey } from '@/hooks/useNicknameAvailability';
import { profileQueryKey, useTermsAccepted } from '@/hooks/useProfile';
import { logOut } from '@/lib/auth';
import { CHOOSE_NICKNAME_COPY as COPY, type NicknameAvailability, saveCheck } from '@/lib/chooseNickname';
import { getErrorCode, getErrorMessage, getNicknameSuggestionError } from '@/lib/errors';
import { findAvailableNickname } from '@/lib/nicknameSuggestions';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';

// Android live regions already read new error texts; iOS needs an explicit announcement.
const announce = (message: string) => {
  if (Platform.OS === 'ios') AccessibilityInfo.announceForAccessibility(message);
};

/**
 * Required for accounts without a nickname (first Google sign-in). The root
 * layout keeps the user here until set_nickname succeeds and the profile refetches.
 * Google accounts also accept the Terms here (email sign-ups did so on the form).
 *
 * Save is never a dead button: a tap says what is missing (lib/chooseNickname saveCheck).
 * Android pans the window ("pan" keyboard mode) only far enough to show the field, so the box
 * and Save can sit under the keyboard: the keyboard's Done key runs Save, and Save, a filled
 * suggestion and the Terms reminder close the keyboard so both are on screen.
 */
export default function ChooseNicknameScreen() {
  const queryClient = useQueryClient();
  const userId = useAuthStore((s) => s.session?.user.id ?? null);
  // Unknown (loading or failed) counts as not accepted; the server ignores a repeat acceptance.
  const needsTerms = useTermsAccepted().data !== true;
  const [nickname, setNickname] = useState('');
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [fieldError, setFieldError] = useState<string | undefined>();
  const [termsError, setTermsError] = useState<string | undefined>();
  const [formError, setFormError] = useState<string | null>(null);
  const [phase, setPhase] = useState<'idle' | 'checking' | 'saving'>('idle');
  const [suggesting, setSuggesting] = useState(false);
  const [suggestMessage, setSuggestMessage] = useState<string | null>(null);
  const scrollRef = useRef<ScrollView>(null);
  const inputRef = useRef<TextInput>(null);
  const termsY = useRef(0);

  const busy = phase !== 'idle' || suggesting;

  const showFieldError = (message: string) => {
    setFieldError(message);
    announce(message);
    inputRef.current?.focus();
  };

  const showTermsError = (message: string) => {
    setTermsError(message);
    announce(message);
    Keyboard.dismiss();
    // After the keyboard has gone; a no-op when everything already fits on screen.
    requestAnimationFrame(() => scrollRef.current?.scrollTo({ y: Math.max(0, termsY.current - 24), animated: true }));
  };

  const save = async (name: string) => {
    if (!userId) return;
    setPhase('saving');
    try {
      const { error } = await supabase.rpc('set_nickname', {
        p_nickname: name,
        p_accept_terms: needsTerms && acceptedTerms,
      });
      if (error) throw error;
      // First nickname saved (a new Google member): the "Pick your avatar" card may show once on Profile.
      markPending(userId);
      await queryClient.invalidateQueries({ queryKey: profileQueryKey(userId) });
    } catch (error) {
      const code = getErrorCode(error);
      if (code?.startsWith('nickname_') && code !== 'nickname_locked') setFieldError(getErrorMessage(error));
      else if (code === 'terms_required') setTermsError(getErrorMessage(error));
      else setFormError(getErrorMessage(error));
    } finally {
      setPhase('idle');
    }
  };

  const handleSubmit = async () => {
    if (busy) return;
    setFormError(null);
    const input = { nickname, needsTerms, acceptedTerms };
    // The field's own live check, when it already has an answer for this name.
    const cached = queryClient.getQueryData<boolean>(nicknameAvailableKey(nickname.trim()));
    let availability: NicknameAvailability = cached === undefined ? 'unknown' : cached ? 'available' : 'unavailable';
    let step = saveCheck({ ...input, availability });
    if (step.kind === 'check') {
      setPhase('checking');
      try {
        availability = (await ensureNicknameAvailable(queryClient, step.nickname)) ? 'available' : 'unavailable';
      } catch {
        availability = 'error'; // as the field says: the server checks again on save
      }
      setPhase('idle');
      step = saveCheck({ ...input, availability });
    }
    switch (step.kind) {
      case 'nickname':
      case 'taken':
        return showFieldError(step.message);
      case 'terms':
        return showTermsError(step.message);
      case 'ready':
        return save(step.nickname);
      case 'check':
        return; // unreachable: availability is known after the check
    }
  };

  const suggest = async () => {
    if (busy) return;
    setSuggestMessage(null);
    setSuggesting(true);
    try {
      const name = await findAvailableNickname((candidate) => ensureNicknameAvailable(queryClient, candidate));
      if (name) {
        setNickname(name);
        setFieldError(undefined);
        Keyboard.dismiss();
      } else {
        setSuggestMessage(COPY.suggestNone);
        announce(COPY.suggestNone);
      }
    } catch (error) {
      const message = getNicknameSuggestionError(error);
      setSuggestMessage(message);
      announce(message);
    } finally {
      setSuggesting(false);
    }
  };

  return (
    <Screen scrollRef={scrollRef}>
      <AuthHeader title={COPY.title} subtitle={COPY.subtitle} canGoBack={false} />
      <FormMessage tone="error" message={formError} />
      <View className="gap-1">
        <NicknameField
          inputRef={inputRef}
          value={nickname}
          onChangeText={(text) => {
            setNickname(text);
            setFieldError(undefined);
            setSuggestMessage(null);
          }}
          error={fieldError}
          editable={!busy}
          onSubmitEditing={() => void handleSubmit()}
        />
        <View className="flex-row flex-wrap items-center justify-between gap-x-3">
          <Text accessibilityLiveRegion="polite" className="min-w-0 flex-1 text-sm text-text-dim">
            {suggestMessage ?? ''}
          </Text>
          <Pressable
            onPress={() => void suggest()}
            disabled={busy}
            accessibilityRole="button"
            accessibilityLabel={COPY.suggest}
            accessibilityHint="Fills in a free nickname you can keep or change"
            accessibilityState={{ disabled: busy, busy: suggesting }}
            className={`min-h-11 justify-center px-1 ${busy ? 'opacity-60' : ''}`}
          >
            <Text className="text-sm font-bold text-accent underline">{suggesting ? COPY.suggesting : COPY.suggest}</Text>
          </Pressable>
        </View>
      </View>
      {needsTerms ? (
        <View
          onLayout={(e) => {
            termsY.current = e.nativeEvent.layout.y;
          }}
        >
          <TermsCheckbox
            checked={acceptedTerms}
            onChange={(checked) => {
              setAcceptedTerms(checked);
              setTermsError(undefined);
            }}
            error={termsError}
          />
        </View>
      ) : null}
      <Button
        label={phase === 'checking' ? COPY.checking : COPY.save}
        onPress={() => void handleSubmit()}
        loading={phase === 'saving'}
        disabled={phase === 'checking' || suggesting}
      />
      <View className="items-center">
        <Pressable
          onPress={() => void logOut()}
          accessibilityRole="button"
          accessibilityLabel={COPY.cancel}
          accessibilityHint={COPY.cancelHelp}
          className="min-h-11 items-center justify-center px-3"
        >
          <Text className="text-sm text-text-dim underline">{COPY.cancel}</Text>
        </Pressable>
        <Text className="text-center text-xs text-text-dim" importantForAccessibility="no">
          {COPY.cancelHelp}
        </Text>
      </View>
      {/* Room below the last row, so it can be scrolled clear of the bottom edge with large fonts. */}
      <View className="h-16" />
    </Screen>
  );
}
