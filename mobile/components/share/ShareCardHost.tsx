import { useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { ShareCard } from '@/components/share/ShareCard';
import { logError } from '@/lib/log';
import { postImageUrl } from '@/lib/posts';
import { captureAndShare, SHARE_FAILED, type ShareItem } from '@/lib/share';
import { useShareCardStore } from '@/stores/shareCardStore';
import { useToastStore } from '@/stores/toastStore';

// A photo that has not loaded by then is left out; the card is shared without it.
const PHOTO_TIMEOUT_MS = 5000;

type PhotoState = 'none' | 'loading' | 'ready' | 'failed';

function dialogTitle(item: ShareItem): string {
  if (item.type === 'listing') return 'Share listing';
  return item.post.kind === 'poll' ? 'Share poll' : `Share ${item.post.kind}`;
}

/** One share: render the card, wait for layout and the photo, capture, share, clean up. */
function ShareJob({ item, onDone }: { item: ShareItem; onDone: () => void }) {
  const cardRef = useRef<View>(null);
  const showToast = useToastStore((s) => s.show);
  // The first photo of a listing or post (polls have none). Same stored image the feed shows, usually cached.
  const first = item.type === 'listing' ? item.listing.images[0] : item.post.images[0];
  const photoUri = first ? postImageUrl(first.path) : null;
  const [photo, setPhoto] = useState<PhotoState>(photoUri ? 'loading' : 'none');
  const [laidOut, setLaidOut] = useState(false);
  const started = useRef(false);

  useEffect(() => {
    if (photo !== 'loading') return;
    const timer = setTimeout(() => setPhoto('failed'), PHOTO_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [photo]);

  const ready = laidOut && photo !== 'loading';
  useEffect(() => {
    if (!ready || started.current) return;
    started.current = true;
    captureAndShare(cardRef, dialogTitle(item))
      .catch((e: unknown) => {
        logError('share.card', e);
        showToast(SHARE_FAILED);
      })
      .finally(onDone);
  }, [ready, item, onDone, showToast]);

  return (
    <View onLayout={() => setLaidOut(true)}>
      <ShareCard
        ref={cardRef}
        item={item}
        photoUri={photo === 'failed' ? null : photoUri}
        onPhotoSettled={(ok) => setPhoto(ok ? 'ready' : 'failed')}
      />
    </View>
  );
}

/**
 * Mounted once at the root. While a share runs, the card is laid out at the top-left behind
 * a transparent wrapper: fully drawn natively (Android skips drawing views placed off-screen),
 * invisible to the user, no touches, hidden from screen readers. The capture reads the card
 * view itself, so the wrapper's opacity is not in the image.
 */
export function ShareCardHost() {
  const job = useShareCardStore((s) => s.job);
  const finish = useShareCardStore((s) => s.finish);
  if (!job) return null;
  return (
    <View
      style={styles.hidden}
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <ShareJob key={job.id} item={job.item} onDone={finish} />
    </View>
  );
}

const styles = StyleSheet.create({
  hidden: { position: 'absolute', top: 0, left: 0, opacity: 0 },
});
