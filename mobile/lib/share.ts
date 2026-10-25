import * as Sharing from 'expo-sharing';
import { File } from 'expo-file-system';
import type { RefObject } from 'react';
import type { View } from 'react-native';
import { captureRef } from 'react-native-view-shot';

import type { ListingCardData } from '@/lib/listings';
import { logError, logInfo } from '@/lib/log';
import type { FeedPost } from '@/lib/posts';

/** What can be shared as an image card (published items only). */
export type ShareItem = { type: 'post'; post: FeedPost } | { type: 'listing'; listing: ListingCardData };

/** Stable per item: one share at a time, and the button of this item shows the spinner. */
export const postShareKey = (id: string) => `post:${id}`;
export const listingShareKey = (id: string) => `listing:${id}`;
export const shareKey = (item: ShareItem) => (item.type === 'post' ? postShareKey(item.post.id) : listingShareKey(item.listing.id));

export const SHARE_FAILED = 'Could not create the share image. Please try again.';
export const SHARE_UNAVAILABLE = "Sharing isn't available on this device.";

// The card is 360 x 450 dp; the PNG is always 1080 x 1350 px (pixel ratio 3), whatever the screen density.
export const CARD_WIDTH = 360;
export const CARD_HEIGHT = 450;
const PIXEL_RATIO = 3;

// ---------------------------------------------------------------------------
// Capture and share

function deleteQuietly(uri: string): void {
  try {
    const file = new File(uri);
    if (file.exists) file.delete();
  } catch (e) {
    logError('share.cleanup', e);
  }
}

/** Waits until the native views have drawn the latest layout. */
function nextFrames(count = 2): Promise<void> {
  return new Promise((resolve) => {
    const step = (left: number) => (left === 0 ? resolve() : requestAnimationFrame(() => step(left - 1)));
    step(count);
  });
}

/**
 * Captures the mounted card to a PNG in the cache directory, opens the share sheet, then
 * deletes the file. Closing the share sheet without sharing is not an error.
 */
export async function captureAndShare(card: RefObject<View | null>, dialogTitle: string): Promise<void> {
  await nextFrames();
  const uri = await captureRef(card, {
    format: 'png',
    result: 'tmpfile',
    width: CARD_WIDTH * PIXEL_RATIO,
    height: CARD_HEIGHT * PIXEL_RATIO,
  });
  try {
    // Dev aid: a blank capture is a few KB; a real card is much larger.
    if (__DEV__) logInfo('share.capture', 'ok', { bytes: new File(uri).size });
    await Sharing.shareAsync(uri, { mimeType: 'image/png', UTI: 'public.png', dialogTitle });
  } finally {
    deleteQuietly(uri);
  }
}

export const isSharingAvailable = () => Sharing.isAvailableAsync();
