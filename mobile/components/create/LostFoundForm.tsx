import { Text, View } from 'react-native';

import { LostFoundNotice } from '@/components/create/LostFoundNotice';
import { PhotoAttachments } from '@/components/create/PhotoAttachments';
import { RecentDateChips } from '@/components/create/RecentDateChips';
import { SubmitFooter } from '@/components/create/SubmitFooter';
import { TextField } from '@/components/ui/TextField';
import { useCreateSubmit } from '@/hooks/useCreateSubmit';
import { useDraft } from '@/hooks/useDraft';
import { usePhotoAttachments } from '@/hooks/usePhotoAttachments';
import { useTouched } from '@/hooks/useTouched';
import { createListing } from '@/lib/create';
import { LIMITS, lostFoundSchema } from '@/lib/createSchemas';
import { validate } from '@/lib/validation';

export function LostFoundForm({ userId }: { userId: string }) {
  const draft = useDraft(userId, 'lost_found', { title: '', description: '', location: '', eventDate: '' });
  const photos = usePhotoAttachments();
  const touched = useTouched<'title' | 'description' | 'location' | 'eventDate'>();
  const { submit, submitting, error } = useCreateSubmit();
  const { title, description, location, eventDate } = draft.values;
  const result = validate(lostFoundSchema, { title, description, location, eventDate });
  const errors = result.errors ?? {};
  const locked = submitting;

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
        label="Where"
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
        <Text className="text-xs font-bold uppercase tracking-widest text-text-dim">When</Text>
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
        hint={
          photos.hasFailed
            ? 'Remove the photo that failed to continue.'
            : photos.busy
              ? 'Preparing photos…'
              : !eventDate
                ? 'Pick the date to continue.'
                : null
        }
      />
    </View>
  );
}
