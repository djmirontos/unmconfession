import { View } from 'react-native';

import { PhotoAttachments } from '@/components/create/PhotoAttachments';
import { SubmitFooter } from '@/components/create/SubmitFooter';
import { TextField } from '@/components/ui/TextField';
import { useCreateSubmit } from '@/hooks/useCreateSubmit';
import { useDraft } from '@/hooks/useDraft';
import { usePhotoAttachments } from '@/hooks/usePhotoAttachments';
import { useTouched } from '@/hooks/useTouched';
import { createPost, createQaPost, type PostInput } from '@/lib/create';
import { confessionSchema, LIMITS, shoutoutSchema } from '@/lib/createSchemas';
import { missingFields, type RequiredField } from '@/lib/missingFields';
import { validate } from '@/lib/validation';

/** 'qa' is a Q&A post: the same form as a post, sent with create_qa_post. */
type Props = { userId: string; kind: 'confession' | 'qa' | 'shoutout' };

export const POST_TEXT_REQUIRED: Record<Props['kind'], readonly RequiredField<'target' | 'body'>[]> = {
  confession: [{ key: 'body', label: 'Your post' }],
  qa: [{ key: 'body', label: 'Your question' }],
  shoutout: [
    { key: 'target', label: "Who it's for" },
    { key: 'body', label: 'Your message' },
  ],
};

/** Post, Q&A, or shoutout (which adds who it is for). All take up to 3 photos. */
export function PostTextForm({ userId, kind }: Props) {
  const draft = useDraft(userId, kind, { target: '', body: '' });
  const photos = usePhotoAttachments();
  const touched = useTouched<'target' | 'body'>();
  const { submit, submitting, error } = useCreateSubmit();
  const { target, body } = draft.values;

  const shout = kind === 'shoutout' ? validate(shoutoutSchema, { target, body }) : null;
  // A Q&A post has the same rules as a post.
  const confession = kind !== 'shoutout' ? validate(confessionSchema, { body }) : null;
  const input: PostInput | null = shout
    ? shout.data && { kind: 'shoutout', body: shout.data.body, target: shout.data.target }
    : confession?.data
      ? { kind: 'confession', body: confession.data.body }
      : null;
  const errors: { target?: string; body?: string } = shout?.errors ?? confession?.errors ?? {};
  const locked = submitting;
  const missing = missingFields(POST_TEXT_REQUIRED[kind], { target, body }, errors);

  const onSubmit = () => {
    if (!input) return;
    void submit({
      photos,
      run: (images) => (kind === 'qa' && input.kind === 'confession' ? createQaPost(input.body, images) : createPost(input, images)),
      onSuccess: () => {
        draft.clear();
        photos.reset();
        touched.reset();
      },
    });
  };

  return (
    <View className="gap-5">
      {kind === 'shoutout' ? (
        <TextField
          label="To"
          value={target}
          onChangeText={(t) => {
            draft.set('target', t);
            touched.touch('target');
          }}
          placeholder="A name, a section, a group…"
          maxLength={LIMITS.target}
          counter={{ length: target.length, max: LIMITS.target }}
          error={touched.isTouched('target') ? errors.target : undefined}
          editable={!locked}
        />
      ) : null}
      <TextField
        label={kind === 'shoutout' ? 'Message' : kind === 'qa' ? 'Your question' : 'Post'}
        value={body}
        onChangeText={(t) => {
          draft.set('body', t);
          touched.touch('body');
        }}
        placeholder={kind === 'shoutout' ? 'Say something nice…' : kind === 'qa' ? 'What do you want to ask?' : "What's on your mind?"}
        multiline
        maxLength={LIMITS.body}
        counter={{ length: body.length, max: LIMITS.body }}
        error={touched.isTouched('body') ? errors.body : undefined}
        hint="Keep names and personal details of others out of it."
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
        label={kind === 'shoutout' ? 'Post shoutout' : kind === 'qa' ? 'Post question' : 'Post it'}
        onPress={onSubmit}
        submitting={submitting}
        disabled={!input || photos.busy || photos.hasFailed}
        error={error}
        missing={missing}
        hint={photos.hasFailed ? 'Remove the photo that failed to continue.' : photos.busy ? 'Preparing photos…' : null}
      />
    </View>
  );
}
