import { randomUUID } from 'expo-crypto';
import { useCallback, useRef, useState } from 'react';

import type { StoredImage } from '@/lib/create';
import { LIMITS } from '@/lib/createSchemas';
import { logError } from '@/lib/log';
import { processPhoto, type ProcessedPhoto } from '@/lib/photos/process';
import { uploadPhoto } from '@/lib/photos/upload';

export type PhotoStatus = 'processing' | 'ready' | 'uploading' | 'uploaded' | 'failed';

export type PhotoItem = {
  key: string;
  /** Picked file, shown until the processed one exists. */
  sourceUri: string;
  /** Processed JPEG, shown once ready. */
  previewUri: string | null;
  status: PhotoStatus;
};

/**
 * Photos attached to one form. Processing (resize + re-encode) runs one photo at
 * a time as they are picked; uploads also run one at a time, at submit.
 * Order, results and uploaded paths live in refs (updated synchronously);
 * `items` state only drives the thumbnails.
 */
export function usePhotoAttachments() {
  const [items, setItems] = useState<PhotoItem[]>([]);
  const order = useRef<string[]>([]);
  const processed = useRef(new Map<string, ProcessedPhoto>());
  // Reused on retry so the same file is never uploaded twice.
  const uploaded = useRef(new Map<string, string>());
  const queue = useRef<Promise<void>>(Promise.resolve());

  const patch = useCallback((key: string, change: Partial<PhotoItem>) => {
    setItems((list) => list.map((item) => (item.key === key ? { ...item, ...change } : item)));
  }, []);

  const add = useCallback(
    (uris: readonly string[]) => {
      const room = LIMITS.photos - order.current.length;
      const fresh: PhotoItem[] = uris
        .slice(0, Math.max(0, room))
        .map((sourceUri) => ({ key: randomUUID(), sourceUri, previewUri: null, status: 'processing' }));
      if (fresh.length === 0) return;
      order.current = [...order.current, ...fresh.map((f) => f.key)];
      setItems((list) => [...list, ...fresh]);

      for (const item of fresh) {
        queue.current = queue.current.then(async () => {
          if (!order.current.includes(item.key)) return; // removed while queued
          try {
            const result = await processPhoto(item.sourceUri);
            processed.current.set(item.key, result);
            patch(item.key, { status: 'ready', previewUri: result.uri });
          } catch (error) {
            logError('photos.attach', error);
            patch(item.key, { status: 'failed' });
          }
        });
      }
    },
    [patch],
  );

  const remove = useCallback((key: string) => {
    order.current = order.current.filter((k) => k !== key);
    processed.current.delete(key);
    uploaded.current.delete(key);
    setItems((list) => list.filter((item) => item.key !== key));
  }, []);

  const reset = useCallback(() => {
    order.current = [];
    processed.current.clear();
    uploaded.current.clear();
    setItems([]);
  }, []);

  /** Waits for processing, then uploads what is not uploaded yet, in order. */
  const uploadAll = useCallback(
    async (userId: string): Promise<StoredImage[]> => {
      await queue.current;
      const images: StoredImage[] = [];
      for (const key of order.current) {
        const photo = processed.current.get(key);
        if (!photo) throw new Error('invalid_images');
        let path = uploaded.current.get(key);
        if (!path) {
          patch(key, { status: 'uploading' });
          try {
            path = await uploadPhoto(photo.uri, userId);
          } catch (error) {
            patch(key, { status: 'ready' });
            throw error;
          }
          uploaded.current.set(key, path);
          patch(key, { status: 'uploaded' });
        }
        images.push({ path, width: photo.width, height: photo.height, blurhash: photo.blurhash });
      }
      return images;
    },
    [patch],
  );

  const busy = items.some((i) => i.status === 'processing' || i.status === 'uploading');
  const hasFailed = items.some((i) => i.status === 'failed');

  return { items, add, remove, reset, uploadAll, busy, hasFailed, remaining: LIMITS.photos - items.length };
}
