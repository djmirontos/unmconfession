import { useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, Switch, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ErrorState } from '@/components/feed/ListStates';
import { BackHeader } from '@/components/layout/BackHeader';
import { SettingsGroup } from '@/components/profile/SettingsRow';
import { Button } from '@/components/ui/Button';
import { ChipGroup } from '@/components/ui/ChipGroup';
import { FormMessage } from '@/components/ui/FormMessage';
import { Skeleton } from '@/components/ui/Skeleton';
import { TextField } from '@/components/ui/TextField';
import { useMyProfileDetails, useSaveProfileDetails } from '@/hooks/useProfileDetails';
import { useTheme } from '@/hooks/useTheme';
import { getErrorMessage, getProfileDetailsErrorMessage } from '@/lib/errors';
import { DETAIL_LIMITS, detailsChanged, type MyProfileDetails, validateDetails, YEAR_LEVELS } from '@/lib/profileDetails';
import { useToastStore } from '@/stores/toastStore';

const HELP = "Only signed-in members can see this, and only while the switch is on. Please don't share contact info or links.";
const YEAR_OPTIONS = [{ value: '', label: 'Not set' }, ...YEAR_LEVELS.map((y) => ({ value: y, label: y }))] as const;
// Android pans only far enough to show the focused box: keep Save visible below About me.
const SAVE_REACH = Platform.OS === 'android' ? 80 : 0;

type Draft = { show: boolean; college: string; course: string; yearLevel: string; hobbies: string; about: string };

const toDraft = (d: MyProfileDetails): Draft => ({
  show: d.show,
  college: d.college ?? '',
  course: d.course ?? '',
  yearLevel: d.yearLevel ?? '',
  hobbies: d.hobbies ?? '',
  about: d.about ?? '',
});

const fromDraft = (d: Draft): MyProfileDetails => ({ ...d, yearLevel: d.yearLevel || null });

function ShowSwitch({ value, disabled, onChange }: { value: boolean; disabled: boolean; onChange: (on: boolean) => void }) {
  const { colors } = useTheme();
  return (
    <View className="min-h-16 flex-row items-center gap-3 px-4 py-3">
      <View className="flex-1 gap-0.5">
        <Text className="text-base font-bold text-text">Show on my profile</Text>
        <Text className="text-sm text-text-dim">{value ? 'Signed-in members can see your details.' : 'Hidden. Nobody else sees them.'}</Text>
      </View>
      <Switch
        value={value}
        onValueChange={onChange}
        disabled={disabled}
        accessibilityLabel="Show on my profile"
        trackColor={{ false: colors.hairline, true: colors.accent }}
        thumbColor={colors.surface1}
        ios_backgroundColor={colors.hairline}
      />
    </View>
  );
}

/** Profile → About you: optional details, hidden until the switch is on. */
export default function AboutYouScreen() {
  const insets = useSafeAreaInsets();
  const showToast = useToastStore((s) => s.show);
  const details = useMyProfileDetails();
  const save = useSaveProfileDetails();
  const scrollRef = useRef<ScrollView>(null);
  // null until the first edit: the form shows the saved details; once edited, a refetch never overwrites typing.
  const [edited, setEdited] = useState<Draft | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const draft = edited ?? (details.data ? toDraft(details.data) : null);

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => {
    if (!draft) return;
    setEdited({ ...draft, [key]: value });
    setFormError(null);
  };

  const fieldErrors = draft ? validateDetails(fromDraft(draft)) : {};
  const changed = !!draft && !!details.data && detailsChanged(details.data, fromDraft(draft));
  const canSave = changed && !save.isPending && Object.keys(fieldErrors).length === 0;

  const submit = () => {
    if (!draft || !canSave) return;
    setFormError(null);
    save.mutate(fromDraft(draft), {
      onSuccess: () => showToast('Profile details saved'),
      onError: (error) => setFormError(getProfileDetailsErrorMessage(error)),
    });
  };

  const revealSave = () => setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 120);

  let body;
  if (!draft) {
    body = details.isError ? (
      <ErrorState message={getErrorMessage(details.error)} onRetry={() => void details.refetch()} />
    ) : (
      <View className="gap-3" accessibilityLabel="Loading" accessibilityRole="progressbar">
        <Skeleton height={64} className="rounded-2xl" />
        <Skeleton height={72} className="rounded-xl" />
        <Skeleton height={72} className="rounded-xl" />
        <Skeleton height={128} className="rounded-xl" />
      </View>
    );
  } else {
    const busy = save.isPending;
    const counter = (field: keyof typeof DETAIL_LIMITS) => ({ length: draft[field].length, max: DETAIL_LIMITS[field] });
    body = (
      <>
        <SettingsGroup title="Visibility">
          <ShowSwitch value={draft.show} disabled={busy} onChange={(on) => set('show', on)} />
        </SettingsGroup>
        <Text className="px-1 text-sm text-text-dim">{HELP}</Text>
        <TextField
          label="College or department"
          placeholder="e.g. College of Engineering"
          value={draft.college}
          onChangeText={(t) => set('college', t)}
          maxLength={DETAIL_LIMITS.college}
          counter={counter('college')}
          error={fieldErrors.college}
          editable={!busy}
          returnKeyType="done"
          autoCorrect={false}
        />
        <TextField
          label="Course"
          placeholder="e.g. BS Computer Science"
          value={draft.course}
          onChangeText={(t) => set('course', t)}
          maxLength={DETAIL_LIMITS.course}
          counter={counter('course')}
          error={fieldErrors.course}
          editable={!busy}
          returnKeyType="done"
          autoCorrect={false}
        />
        <View className="gap-1.5">
          <Text className="text-xs font-bold uppercase tracking-widest text-text-dim">Year level</Text>
          <ChipGroup options={YEAR_OPTIONS} value={draft.yearLevel} onChange={(v) => set('yearLevel', v)} accessibilityLabel="Year level" disabled={busy} />
          {fieldErrors.yearLevel ? <Text className="text-sm text-danger">{fieldErrors.yearLevel}</Text> : null}
        </View>
        <TextField
          label="Hobbies"
          placeholder="Gaming, basketball"
          value={draft.hobbies}
          onChangeText={(t) => set('hobbies', t)}
          maxLength={DETAIL_LIMITS.hobbies}
          counter={counter('hobbies')}
          error={fieldErrors.hobbies}
          editable={!busy}
          returnKeyType="done"
          autoCapitalize="none"
        />
        <TextField
          label="About me"
          placeholder="A short line about you"
          value={draft.about}
          onChangeText={(t) => set('about', t)}
          multiline
          maxLength={DETAIL_LIMITS.about}
          counter={counter('about')}
          error={fieldErrors.about}
          editable={!busy}
          keyboardGap={SAVE_REACH}
          onFocus={revealSave}
        />
        <FormMessage tone="error" message={formError} />
        <Button
          label="Save"
          onPress={submit}
          loading={busy}
          disabled={!canSave}
          accessibilityHint={changed ? undefined : 'Nothing has changed yet'}
        />
      </>
    );
  }

  return (
    <View className="flex-1 bg-bg" style={{ paddingTop: insets.top }}>
      <BackHeader title="About you" />
      <KeyboardAvoidingView className="flex-1" behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          ref={scrollRef}
          keyboardShouldPersistTaps="handled"
          contentContainerClassName="gap-4 p-4"
          contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
        >
          {body}
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}
