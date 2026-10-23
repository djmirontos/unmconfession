import { Text, View } from 'react-native';

import { MarketNotice } from '@/components/create/MarketNotice';
import { PhotoAttachments } from '@/components/create/PhotoAttachments';
import { SubmitFooter } from '@/components/create/SubmitFooter';
import { ChipGroup } from '@/components/ui/ChipGroup';
import { TextField } from '@/components/ui/TextField';
import { useCreateSubmit } from '@/hooks/useCreateSubmit';
import { useDraft } from '@/hooks/useDraft';
import { usePhotoAttachments } from '@/hooks/usePhotoAttachments';
import { useTouched } from '@/hooks/useTouched';
import { createListing } from '@/lib/create';
import { CONDITIONS, LIMITS, sellSchema } from '@/lib/createSchemas';
import { CONDITION_LABELS } from '@/lib/listings';
import { validate } from '@/lib/validation';

const CONDITION_OPTIONS = CONDITIONS.map((c) => ({ value: c, label: CONDITION_LABELS[c] }));

export function SellForm({ userId }: { userId: string }) {
  const draft = useDraft(userId, 'sell', { title: '', description: '', price: '', condition: '' });
  const photos = usePhotoAttachments();
  const touched = useTouched<'title' | 'description' | 'price'>();
  const { submit, submitting, error } = useCreateSubmit();
  const { title, description, price, condition } = draft.values;
  const result = validate(sellSchema, { title, description, price, condition });
  const errors = result.errors ?? {};
  const locked = submitting;

  const onSubmit = () => {
    if (!result.data) return;
    const input = { kind: 'sell' as const, ...result.data };
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
      <MarketNotice />
      <TextField
        label="Item"
        value={title}
        onChangeText={(t) => {
          draft.set('title', t);
          touched.touch('title');
        }}
        placeholder="e.g. Calculus textbook, 3rd edition"
        maxLength={LIMITS.title}
        counter={{ length: title.length, max: LIMITS.title }}
        error={touched.isTouched('title') ? errors.title : undefined}
        editable={!locked}
      />
      <TextField
        label="Price (₱)"
        value={price}
        onChangeText={(t) => {
          draft.set('price', t);
          touched.touch('price');
        }}
        placeholder="250"
        keyboardType="decimal-pad"
        inputMode="decimal"
        error={touched.isTouched('price') ? errors.price : undefined}
        hint="Use 0 if you are giving it away."
        editable={!locked}
      />
      <View className="gap-2">
        <Text className="text-xs font-bold uppercase tracking-widest text-text-dim">Condition</Text>
        <ChipGroup
          options={CONDITION_OPTIONS}
          value={CONDITIONS.find((c) => c === condition) ?? null}
          onChange={(c) => draft.set('condition', c)}
          accessibilityLabel="Condition"
          disabled={locked}
        />
      </View>
      <TextField
        label="Details (optional)"
        value={description}
        onChangeText={(t) => {
          draft.set('description', t);
          touched.touch('description');
        }}
        placeholder="Size, where to meet, how to reach you in the comments…"
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
        label="Post listing"
        onPress={onSubmit}
        submitting={submitting}
        disabled={!result.data || photos.busy || photos.hasFailed}
        error={error}
        hint={
          photos.hasFailed
            ? 'Remove the photo that failed to continue.'
            : photos.busy
              ? 'Preparing photos…'
              : !condition
                ? 'Pick the condition to continue.'
                : null
        }
      />
    </View>
  );
}
