import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Text, View } from 'react-native';

import { LOST_FOUND_REQUIRED } from '@/components/create/LostFoundForm';
import { RecentDateChips } from '@/components/create/RecentDateChips';
import { SELL_REQUIRED } from '@/components/create/SellForm';
import { EditShell } from '@/components/edit/EditShell';
import { ChipGroup } from '@/components/ui/ChipGroup';
import { TextField } from '@/components/ui/TextField';
import { useEditSave } from '@/hooks/useEditSave';
import { CONDITIONS, LIMITS, lostFoundSchema, sellSchema } from '@/lib/createSchemas';
import { CONDITION_LABELS } from '@/lib/listings';
import { missingFields } from '@/lib/missingFields';
import type { MyItem } from '@/lib/myPosts';
import { afterListingEdit, editOwnListing } from '@/lib/ownItems';
import { validate } from '@/lib/validation';

const CONDITION_OPTIONS = CONDITIONS.map((c) => ({ value: c, label: CONDITION_LABELS[c] }));

function Label({ children }: { children: string }) {
  return <Text className="text-xs font-bold uppercase tracking-widest text-text-dim">{children}</Text>;
}

/** Edit a Sell or Lost & Found listing: same fields, limits and schemas as Create. Kind and Lost/Found stay fixed. */
export function EditListingForm({ item }: { item: MyItem }) {
  const queryClient = useQueryClient();
  const { save, saving, error } = useEditSave();
  const [title, setTitle] = useState(item.text);
  const [description, setDescription] = useState(item.description ?? '');
  const [price, setPrice] = useState(item.price !== null ? String(item.price) : '');
  const [condition, setCondition] = useState(item.condition ?? '');
  const [location, setLocation] = useState(item.location ?? '');
  const [eventDate, setEventDate] = useState(item.eventDate ?? '');

  const isSell = item.kind === 'sell';
  const lostFoundType = item.lostFoundType ?? '';
  const sell = isSell ? validate(sellSchema, { title, description, price, condition }) : null;
  const lostFound = isSell ? null : validate(lostFoundSchema, { lostFoundType, title, description, location, eventDate });
  const errors: Partial<
    Record<'title' | 'description' | 'price' | 'condition' | 'location' | 'eventDate' | 'lostFoundType', string>
  > =
    sell?.errors ?? lostFound?.errors ?? {};
  const valid = !!(sell?.data ?? lostFound?.data);

  const changed =
    title.trim() !== item.text.trim() ||
    description.trim() !== (item.description ?? '').trim() ||
    (isSell
      ? price.trim() !== (item.price !== null ? String(item.price) : '') || condition !== (item.condition ?? '')
      : location.trim() !== (item.location ?? '').trim() || eventDate !== (item.eventDate ?? ''));

  const missing = isSell
    ? missingFields(SELL_REQUIRED, { title, price, condition }, errors)
    : missingFields(LOST_FOUND_REQUIRED, { lostFoundType, title, location, eventDate }, errors);

  const onSave = () => {
    if (!changed) return;
    if (sell?.data) {
      const d = sell.data;
      void save(
        () => editOwnListing(item.id, { title: d.title, description: d.description, price: d.price, condition: d.condition }),
        () => afterListingEdit(queryClient, item.id),
      );
    } else if (lostFound?.data) {
      const d = lostFound.data;
      void save(
        () => editOwnListing(item.id, { title: d.title, description: d.description, location: d.location, eventDate: d.eventDate }),
        () => afterListingEdit(queryClient, item.id),
      );
    }
  };

  const showError = (key: keyof typeof errors, value: string) => (value.trim() !== '' ? errors[key] : undefined);

  return (
    <EditShell item={item} canSave={valid && changed} saving={saving} error={error} missing={missing} onSave={onSave}>
      {!isSell ? (
        <View className="gap-1">
          <Label>Type</Label>
          <Text className="text-base text-text">
            {item.lostFoundType === 'found' ? 'I found something' : 'I lost something'}
          </Text>
          <Text className="text-sm text-text-dim">This can&apos;t be changed after posting.</Text>
        </View>
      ) : null}
      <TextField
        label={isSell ? 'Item' : 'What'}
        value={title}
        onChangeText={setTitle}
        maxLength={LIMITS.title}
        counter={{ length: title.length, max: LIMITS.title }}
        error={showError('title', title)}
        editable={!saving}
      />
      {isSell ? (
        <>
          <TextField
            label="Price (₱)"
            value={price}
            onChangeText={setPrice}
            keyboardType="decimal-pad"
            inputMode="decimal"
            error={showError('price', price)}
            hint="Use 0 if you are giving it away."
            editable={!saving}
          />
          <View className="gap-2">
            <Label>Condition</Label>
            <ChipGroup
              options={CONDITION_OPTIONS}
              value={CONDITIONS.find((c) => c === condition) ?? null}
              onChange={setCondition}
              accessibilityLabel="Condition"
              disabled={saving}
            />
          </View>
        </>
      ) : (
        <>
          <TextField
            label={item.lostFoundType === 'found' ? 'Where did you find it?' : 'Where did you lose it?'}
            value={location}
            onChangeText={setLocation}
            maxLength={LIMITS.location}
            counter={{ length: location.length, max: LIMITS.location }}
            error={showError('location', location)}
            editable={!saving}
          />
          <View className="gap-2">
            <Label>{item.lostFoundType === 'found' ? 'When did you find it?' : 'When did you lose it?'}</Label>
            <RecentDateChips value={eventDate} onChange={setEventDate} disabled={saving} />
            {eventDate && errors.eventDate ? <Text className="text-sm text-danger">{errors.eventDate}</Text> : null}
          </View>
        </>
      )}
      <TextField
        label="Details (optional)"
        value={description}
        onChangeText={setDescription}
        multiline
        maxLength={LIMITS.description}
        counter={{ length: description.length, max: LIMITS.description }}
        error={errors.description}
        editable={!saving}
      />
    </EditShell>
  );
}
