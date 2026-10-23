import { Text, View } from 'react-native';

import { LostFoundNotice } from '@/components/create/LostFoundNotice';
import { PhotoAttachments } from '@/components/create/PhotoAttachments';
import { RecentDateChips } from '@/components/create/RecentDateChips';
import { SubmitFooter } from '@/components/create/SubmitFooter';
import { ChipGroup } from '@/components/ui/ChipGroup';
import { TextField } from '@/components/ui/TextField';
import { useCreateSubmit } from '@/hooks/useCreateSubmit';
import { useDraft } from '@/hooks/useDraft';
import { usePhotoAttachments } from '@/hooks/usePhotoAttachments';
import { useTouched } from '@/hooks/useTouched';
import { createListing } from '@/lib/create';
import { LIMITS, LOST_FOUND_TYPE_REQUIRED, LOST_FOUND_TYPES, lostFoundSchema } from '@/lib/createSchemas';
import { missingFields, type RequiredField } from '@/lib/missingFields';
import { validate } from '@/lib/validation';

const TYPE_OPTIONS = [
  { value: 'lost', label: 'I lost something' },
  { value: 'found', label: 'I found something' },
] as const;

export const LOST_FOUND_REQUIRED: readonly RequiredField<'lostFoundType' | 'title' | 'location' | 'eventDate'>[] = [
  { key: 'lostFoundType', label: 'Lost or Found' },
  { key: 'title', label: 'What' },
  { key: 'location', label: 'Where' },
  { key: 'eventDate', label: 'When' },
];

const LABELS = {
  lost: { where: 'Where did you lose it?', when: 'When did you lose it?' },
  found: { where: 'Where did you find it?', when: 'When did you find it?' },
  none: { where: 'Where', when: 'When' },
} as const;

export function LostFoundForm({ userId }: { userId: string }) {
  // lostFoundType '' = not chosen. Drafts saved before the toggle existed have no such key and restore as ''.
  const draft = useDraft(userId, 'lost_found', { lostFoundType: '', title: '', description: '', location: '', eventDate: '' });
  const photos = usePhotoAttachments();
  const touched = useTouched<'title' | 'description' | 'location' | 'eventDate'>();
  const { submit, submitting, error } = useCreateSubmit();
  const { lostFoundType, title, description, location, eventDate } = draft.values;
  const chosen = LOST_FOUND_TYPES.find((t) => t === lostFoundType) ?? null;
  const labels = LABELS[chosen ?? 'none'];
  const result = validate(lostFoundSchema, { lostFoundType, title, description, location, eventDate });
  const errors = result.errors ?? {};
  const locked = submitting;
  const missing = missingFields(LOST_FOUND_REQUIRED, { lostFoundType, title, location, eventDate }, errors);
  // Asked for as soon as the user starts filling in the form.
  const showTypeError =
    !chosen && (['title', 'location', 'eventDate', 'description'] as const).some((k) => touched.isTouched(k));

  const onSubmit = () => {
    if (!result.data) return;
    const input = { kind: 'lost_found' as const, ...result.data };
    void submit({
      photos,
      run: (images) => createListing(input, images),
      onSuccess: () => {
        draft.clear();
        photos.reset();
        touched.reset();
      },
    });
  };

  return (
    <View className="gap-5">
      <View className="gap-2">
        <ChipGroup
          options={TYPE_OPTIONS}
          value={chosen}
          onChange={(t) => draft.set('lostFoundType', t)}
          accessibilityLabel="Did you lose or find something?"
          disabled={locked}
        />
        {showTypeError ? (
          <Text accessibilityLiveRegion="polite" className="text-sm text-danger">
            {LOST_FOUND_TYPE_REQUIRED}
          </Text>
        ) : null}
      </View>
      <LostFoundNotice />
      <TextField
        label="What"
        value={title}
        onChangeText={(t) => {
          draft.set('title', t);
          touched.touch('title');
        }}
        placeholder="e.g. Lost: blue umbrella / Found: ID lace"
        maxLength={LIMITS.title}
        counter={{ length: title.length, max: LIMITS.title }}
        error={touched.isTouched('title') ? errors.title : undefined}
        editable={!locked}
      />
      <TextField
        label={labels.where}
        value={location}
        onChangeText={(t) => {
          draft.set('location', t);
          touched.touch('location');
        }}
        placeholder="e.g. Library 2nd floor"
        maxLength={LIMITS.location}
        counter={{ length: location.length, max: LIMITS.location }}
        error={touched.isTouched('location') ? errors.location : undefined}
        editable={!locked}
      />
      <View className="gap-2">
        <Text className="text-xs font-bold uppercase tracking-widest text-text-dim">{labels.when}</Text>
        <RecentDateChips
          value={eventDate}
          onChange={(d) => {
            draft.set('eventDate', d);
            touched.touch('eventDate');
          }}
          disabled={locked}
        />
        {touched.isTouched('eventDate') && errors.eventDate ? (
          <Text className="text-sm text-danger">{errors.eventDate}</Text>
        ) : null}
      </View>
      <TextField
        label="Details (optional)"
        value={description}
        onChangeText={(t) => {
          draft.set('description', t);
          touched.touch('description');
        }}
        placeholder="Color, brand, how to claim it in the comments…"
        multiline
        maxLength={LIMITS.description}
        counter={{ length: description.length, max: LIMITS.description }}
        error={touched.isTouched('description') ? errors.description : undefined}
        editable={!locked}
      />
      <PhotoAttachments
        items={photos.items}
        remaining={photos.remaining}
        onAdd={photos.add}
        onRemove={photos.remove}
        locked={locked}
      />
      <SubmitFooter
        label="Post to Lost & Found"
        onPress={onSubmit}
        submitting={submitting}
        disabled={!result.data || photos.busy || photos.hasFailed}
        error={error}
        missing={missing}
        hint={photos.hasFailed ? 'Remove the photo that failed to continue.' : photos.busy ? 'Preparing photos…' : null}
      />
    </View>
  );
}
