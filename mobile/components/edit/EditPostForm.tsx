import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { POST_TEXT_REQUIRED } from '@/components/create/PostTextForm';
import { EditShell } from '@/components/edit/EditShell';
import { TextField } from '@/components/ui/TextField';
import { useEditSave } from '@/hooks/useEditSave';
import { confessionSchema, LIMITS, shoutoutSchema } from '@/lib/createSchemas';
import { missingFields } from '@/lib/missingFields';
import type { MyItem } from '@/lib/myPosts';
import { afterPostEdit, editOwnPost } from '@/lib/ownItems';
import { validate } from '@/lib/validation';

/** Edit a confession or shoutout: same fields, limits and schemas as Create. */
export function EditPostForm({ item, kind }: { item: MyItem; kind: 'confession' | 'shoutout' }) {
  const queryClient = useQueryClient();
  const { save, saving, error } = useEditSave();
  const [body, setBody] = useState(item.text);
  const [target, setTarget] = useState(item.targetName ?? '');

  const shout = kind === 'shoutout' ? validate(shoutoutSchema, { target, body }) : null;
  const confession = kind === 'confession' ? validate(confessionSchema, { body }) : null;
  const data: { body: string; targetName: string | null } | null = shout
    ? shout.data && { body: shout.data.body, targetName: shout.data.target }
    : confession?.data
      ? { body: confession.data.body, targetName: null }
      : null;
  const errors: { target?: string; body?: string } = shout?.errors ?? confession?.errors ?? {};
  const changed =
    body.trim() !== item.text.trim() || (kind === 'shoutout' && target.trim() !== (item.targetName ?? '').trim());
  const missing = missingFields(POST_TEXT_REQUIRED[kind], { target, body }, errors);

  const onSave = () => {
    if (!data || !changed) return;
    void save(
      () => editOwnPost(item.id, data.body, data.targetName),
      (r) => afterPostEdit(queryClient, item.id, r),
    );
  };

  return (
    <EditShell item={item} canSave={!!data && changed} saving={saving} error={error} missing={missing} onSave={onSave}>
      {kind === 'shoutout' ? (
        <TextField
          label="To"
          value={target}
          onChangeText={setTarget}
          maxLength={LIMITS.target}
          counter={{ length: target.length, max: LIMITS.target }}
          error={target.trim() !== '' ? errors.target : undefined}
          editable={!saving}
        />
      ) : null}
      <TextField
        label={kind === 'shoutout' ? 'Message' : 'Confession'}
        value={body}
        onChangeText={setBody}
        multiline
        maxLength={LIMITS.body}
        counter={{ length: body.length, max: LIMITS.body }}
        error={body.trim() !== '' ? errors.body : undefined}
        hint="Keep names and personal details of others out of it."
        editable={!saving}
      />
    </EditShell>
  );
}
