import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useCallback, useRef, useState } from 'react';

import type { Created, StoredImage } from '@/lib/create';
import { getErrorCode, getErrorMessage } from '@/lib/errors';
import { refreshFeedTop } from '@/lib/feed';
import { logError } from '@/lib/log';
import { useAuthStore } from '@/stores/authStore';
import { useToastStore } from '@/stores/toastStore';

const PENDING_TOAST = "Sent for review. You'll be notified when it's approved.";

function liveToast(created: Created): string {
  if (created.kind === 'listing') return 'Your listing is live';
  if (created.postKind === 'poll') return 'Your poll is live';
  return `Your ${created.postKind} is live${created.number !== null ? ` (#${created.number})` : ''}`;
}

type Photos = { uploadAll: (userId: string) => Promise<StoredImage[]> };

type SubmitArgs = {
  /** Omit for polls (no photos). */
  photos?: Photos;
  run: (images: StoredImage[]) => Promise<Created>;
  /** Clears the form and its draft after success. */
  onSuccess: () => void;
};

/**
 * validate (caller) -> upload photos -> call the RPC. Double taps are ignored.
 * Uploaded photos are kept by usePhotoAttachments, so a retry reuses them.
 */
export function useCreateSubmit() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const userId = useAuthStore((s) => s.session?.user.id ?? null);
  const showToast = useToastStore((s) => s.show);
  const inFlight = useRef(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = useCallback(
    async ({ photos, run, onSuccess }: SubmitArgs) => {
      if (inFlight.current || !userId) return;
      inFlight.current = true;
      setSubmitting(true);
      setError(null);
      try {
        let images: StoredImage[] = [];
        if (photos) {
          try {
            images = await photos.uploadAll(userId);
          } catch (e) {
            logError('create.uploadPhotos', e);
            // Upload errors carry a code (read / upload / network); anything else is an upload failure.
            setError(getErrorMessage(getErrorCode(e) ? e : new Error('upload_failed')));
            return;
          }
        }

        let created: Created;
        try {
          created = await run(images);
        } catch (e) {
          logError('create.rpc', e, { photosUploaded: images.length });
          const reason = getErrorMessage(e);
          setError(images.length > 0 ? `Your photos were uploaded but the post failed, please try again. ${reason}` : reason);
          return;
        }

        onSuccess();
        void queryClient.invalidateQueries({ queryKey: ['my-posts'] });
        if (!created.published) {
          showToast(PENDING_TOAST);
          router.push('/my-posts');
          return;
        }
        showToast(liveToast(created));
        if (created.kind === 'post') {
          void refreshFeedTop(queryClient, userId).catch((e: unknown) => logError('feed.refreshTop', e));
          router.push({ pathname: '/post/[id]', params: { id: created.id } });
        } else {
          router.push('/my-posts');
        }
      } finally {
        inFlight.current = false;
        setSubmitting(false);
      }
    },
    [userId, queryClient, showToast, router],
  );

  return { submit, submitting, error, clearError: () => setError(null) };
}
