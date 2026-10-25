import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import type { Ref } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { SHARE_COLORS as C, ShareCardLogo } from '@/components/share/ShareCardBrand';
import { closedLabel, eventVerb, formatPrice, type ListingCardData } from '@/lib/listings';
import { formatEventDate } from '@/lib/manilaDate';
import type { FeedPost } from '@/lib/posts';
import { CARD_HEIGHT, CARD_WIDTH, type ShareItem } from '@/lib/share';
import { bodyTextSize, PHOTO_CAPTION_LINES, pollLayout, preparePhotoCaption, prepareShareText } from '@/lib/shareText';

// Shoutout heading (up to 2 lines) takes about this many body lines.
const SHOUTOUT_HEADING_LINES = 3;
const POLL_LABEL_MAX = 120;
const TITLE_MAX = 100;
// About 53% of the card; the 5-line caption box below it is what is left above the footer.
const POST_PHOTO_HEIGHT = 240;
const SELL_PHOTO_HEIGHT = 196;
const LOST_FOUND_PHOTO_HEIGHT = 168;

/** Every card text: fixed size, so the phone's font scale can never push it out of the card. */
function T({ style, lines, children }: { style: object | object[]; lines?: number; children: string }) {
  return (
    <Text allowFontScaling={false} numberOfLines={lines} ellipsizeMode="tail" style={style}>
      {children}
    </Text>
  );
}

function Chip({ label, color = C.chipText, bg = C.chipBg }: { label: string; color?: string; bg?: string }) {
  return (
    <View style={[styles.chip, { backgroundColor: bg }]}>
      <T style={[styles.chipText, { color }]}>{label}</T>
    </View>
  );
}

function Footer() {
  return (
    <View style={styles.footer}>
      <ShareCardLogo />
    </View>
  );
}

/** Text-only body: sized by length, centred between the header and the footer; "read more in the app" when cut. */
function Body({ raw, reserveLines = 0, quote = false }: { raw: string; reserveLines?: number; quote?: boolean }) {
  const { text, truncated } = prepareShareText(raw);
  const size = bodyTextSize(text, reserveLines + (truncated ? 1 : 0));
  // The quote mark only above short texts (30 / 36 px steps), where it fills space instead of taking it.
  const showQuote = quote && size.fontSize >= 30;
  return (
    <View style={[styles.body, styles.bodyCentered]}>
      {showQuote ? <T style={styles.quote}>“</T> : null}
      <T lines={size.maxLines} style={[styles.bodyText, { fontSize: size.fontSize, lineHeight: size.lineHeight }]}>
        {text}
      </T>
      {truncated ? <T style={styles.readMore}>read more in the app</T> : null}
    </View>
  );
}

const shoutoutHeading = (post: FeedPost) => `Shoutout to ${prepareShareText(post.target_name ?? 'someone', 60).text}`;

type PostProps = { post: FeedPost; photoUri: string | null; onPhotoSettled?: (ok: boolean) => void };

/** Confession / shoutout with a photo: the first photo on top (number on it), a short caption below. */
function PhotoPostContent({ post, photoUri, onPhotoSettled }: PostProps & { photoUri: string }) {
  const shoutout = post.kind === 'shoutout';
  const { text, truncated } = preparePhotoCaption(post.body, shoutout);
  // The heading takes a caption line; "read more" takes another when cut.
  const lines = PHOTO_CAPTION_LINES - (shoutout ? 1 : 0) - (truncated ? 1 : 0);
  const extra = post.images.length - 1;
  return (
    <View style={styles.flex}>
      <View style={styles.postPhotoFrame}>
        <Photo uri={photoUri} style={styles.postPhoto} kind="post" onSettled={onPhotoSettled} />
        <View style={[styles.overlayChip, styles.overlayTopLeft]}>
          <T style={styles.overlayChipText}>{postChipLabel(post)}</T>
        </View>
        {extra > 0 ? (
          <View style={[styles.overlayChip, styles.overlayBottomRight]}>
            <T style={styles.overlayChipText}>{`+${extra} more`}</T>
          </View>
        ) : null}
      </View>
      <View style={styles.caption}>
        {shoutout ? (
          <T lines={1} style={styles.captionHeading}>
            {shoutoutHeading(post)}
          </T>
        ) : null}
        <T lines={lines} style={styles.captionText}>
          {text}
        </T>
        {truncated ? <T style={styles.readMore}>read more in the app</T> : null}
      </View>
    </View>
  );
}

const postChipLabel = (post: FeedPost) =>
  post.number !== null ? `#${post.number}` : post.kind === 'shoutout' ? 'Shoutout' : 'Confession';

function PostContent({ post, photoUri, onPhotoSettled }: PostProps) {
  if (post.kind === 'poll') return <PollContent post={post} />;
  // A photo that failed to load (photoUri null) falls back to the text-only card.
  if (photoUri) return <PhotoPostContent post={post} photoUri={photoUri} onPhotoSettled={onPhotoSettled} />;
  return (
    <View style={styles.flex}>
      <View style={styles.headerRow}>
        <Chip label={postChipLabel(post)} />
      </View>
      {post.kind === 'shoutout' ? (
        <>
          <T lines={2} style={styles.shoutoutHeading}>
            {shoutoutHeading(post)}
          </T>
          <Body raw={post.body} reserveLines={SHOUTOUT_HEADING_LINES} />
        </>
      ) : (
        <Body raw={post.body} quote />
      )}
    </View>
  );
}

function PollContent({ post }: { post: FeedPost }) {
  const options = post.poll_options ?? [];
  const question = prepareShareText(post.body, 200).text;
  const layout = pollLayout(question, options.length);
  const { fontSize, lineHeight, maxLines } = layout.question;
  return (
    <View style={styles.flex}>
      <View style={styles.headerRow}>
        <Chip label={post.number !== null ? `Poll #${post.number}` : 'Poll'} />
      </View>
      <T lines={maxLines} style={[styles.question, { fontSize, lineHeight }]}>
        {question}
      </T>
      <View style={styles.options}>
        {options.slice(0, layout.shown).map((o) => (
          <View key={o.id} style={styles.option}>
            <T lines={layout.optionLines} style={styles.optionText}>
              {prepareShareText(o.label, POLL_LABEL_MAX).text}
            </T>
          </View>
        ))}
        {layout.more > 0 ? <T style={styles.more}>{`+${layout.more} more`}</T> : null}
      </View>
    </View>
  );
}

type PhotoProps = {
  uri: string | null;
  /** Size and shape of the photo box. */
  style: object | object[];
  kind: 'sell' | 'lost_found' | 'post';
  onSettled?: (ok: boolean) => void;
};

/** Cover-cropped photo (portrait, landscape or very tall alike), or an icon placeholder without one. */
function Photo({ uri, style, kind, onSettled }: PhotoProps) {
  if (!uri) {
    return (
      <View style={[styles.photoEmpty, style]}>
        <Ionicons name={kind === 'sell' ? 'pricetag-outline' : 'search-outline'} size={44} color={C.textDim} />
      </View>
    );
  }
  return (
    <Image
      source={{ uri }}
      style={style}
      contentFit="cover"
      cachePolicy="memory-disk"
      // No fade: the capture must not catch a half-faded photo.
      transition={0}
      onLoad={() => onSettled?.(true)}
      onError={() => onSettled?.(false)}
    />
  );
}

type ListingProps = { listing: ListingCardData; photoUri: string | null; onPhotoSettled?: (ok: boolean) => void };

function SellContent({ listing, photoUri, onPhotoSettled }: ListingProps) {
  return (
    <>
      <Photo uri={photoUri} style={[styles.photo, { height: SELL_PHOTO_HEIGHT }]} kind="sell" onSettled={onPhotoSettled} />
      <View style={[styles.padded, styles.flex]}>
        <View style={styles.headerRow}>
          <Chip label="SELL" />
          {listing.isClosed ? <Chip label={closedLabel(listing).toUpperCase()} color={C.bg} bg={C.accent} /> : null}
        </View>
        {listing.price !== null ? <T style={styles.price}>{formatPrice(listing.price)}</T> : null}
        <T lines={2} style={styles.title}>
          {prepareShareText(listing.title, TITLE_MAX).text}
        </T>
      </View>
    </>
  );
}

function InfoLine({ icon, text }: { icon: 'location-outline' | 'calendar-outline'; text: string }) {
  return (
    <View style={styles.infoLine}>
      <Ionicons name={icon} size={16} color={C.textDim} />
      <T lines={1} style={styles.infoText}>
        {text}
      </T>
    </View>
  );
}

function LostFoundContent({ listing, photoUri, onPhotoSettled }: ListingProps) {
  const found = listing.lostFoundType === 'found';
  const label = found ? 'FOUND' : listing.lostFoundType === 'lost' ? 'LOST' : 'LOST & FOUND';
  return (
    <>
      {photoUri ? (
        <Photo uri={photoUri} style={[styles.photo, { height: LOST_FOUND_PHOTO_HEIGHT }]} kind="lost_found" onSettled={onPhotoSettled} />
      ) : null}
      <View style={[styles.padded, styles.flex, photoUri ? null : styles.centered]}>
        <View style={styles.labelRow}>
          <T style={[styles.lostFoundLabel, { color: found ? C.found : C.lost, fontSize: photoUri ? 40 : 56 }]}>{label}</T>
          {listing.isClosed ? <Chip label={closedLabel(listing).toUpperCase()} color={C.bg} bg={C.accent} /> : null}
        </View>
        <T lines={2} style={styles.title}>
          {prepareShareText(listing.title, TITLE_MAX).text}
        </T>
        <View style={styles.infoBlock}>
          {listing.location ? <InfoLine icon="location-outline" text={listing.location} /> : null}
          {listing.eventDate ? (
            <InfoLine icon="calendar-outline" text={`${eventVerb(listing.lostFoundType)} ${formatEventDate(listing.eventDate)}`} />
          ) : null}
        </View>
      </View>
    </>
  );
}

type Props = {
  item: ShareItem;
  /** The listing's first photo, or null (no photo, or it failed to load). */
  photoUri: string | null;
  onPhotoSettled?: (ok: boolean) => void;
  ref?: Ref<View>;
};

/** The 360 x 450 dp image card captured for sharing. Never shown on screen. */
export function ShareCard({ item, photoUri, onPhotoSettled, ref }: Props) {
  const isListing = item.type === 'listing';
  return (
    <View ref={ref} collapsable={false} style={styles.card}>
      <View style={styles.glow} />
      <View style={[styles.flex, isListing ? null : styles.padded]}>
        {item.type === 'post' ? (
          <PostContent post={item.post} photoUri={photoUri} onPhotoSettled={onPhotoSettled} />
        ) : item.listing.kind === 'sell' ? (
          <SellContent listing={item.listing} photoUri={photoUri} onPhotoSettled={onPhotoSettled} />
        ) : (
          <LostFoundContent listing={item.listing} photoUri={photoUri} onPhotoSettled={onPhotoSettled} />
        )}
      </View>
      <View style={styles.footerWrap}>
        <Footer />
      </View>
    </View>
  );
}

const PAD = 24;

const styles = StyleSheet.create({
  card: { width: CARD_WIDTH, height: CARD_HEIGHT, backgroundColor: C.bg, overflow: 'hidden' },
  glow: { position: 'absolute', width: 320, height: 320, borderRadius: 160, top: -140, right: -120, backgroundColor: C.glow },
  flex: { flex: 1, minHeight: 0 },
  padded: { paddingHorizontal: PAD, paddingTop: PAD },
  centered: { justifyContent: 'center', paddingTop: 0 },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 14 },
  chip: { borderRadius: 999, paddingHorizontal: 12, paddingVertical: 5 },
  chipText: { fontSize: 13, fontWeight: '800', letterSpacing: 0.6 },
  shoutoutHeading: { color: C.accent, fontSize: 20, lineHeight: 26, fontWeight: '800', marginBottom: 10 },
  body: { flex: 1, minHeight: 0, overflow: 'hidden' },
  // Centred between the header chip and the footer; nudged up a little so it reads as balanced.
  bodyCentered: { justifyContent: 'center', paddingBottom: 12 },
  quote: { color: C.accent, opacity: 0.55, fontSize: 72, lineHeight: 72, fontWeight: '800', marginBottom: -8 },
  postPhotoFrame: { height: POST_PHOTO_HEIGHT, borderRadius: 16, overflow: 'hidden', backgroundColor: C.panel },
  postPhoto: { width: '100%', height: '100%' },
  overlayChip: { position: 'absolute', borderRadius: 999, paddingHorizontal: 11, paddingVertical: 4, backgroundColor: C.overlay },
  overlayTopLeft: { top: 10, left: 10 },
  overlayBottomRight: { bottom: 10, right: 10 },
  overlayChipText: { color: C.text, fontSize: 13, fontWeight: '800', letterSpacing: 0.5 },
  caption: { flex: 1, minHeight: 0, overflow: 'hidden', paddingTop: 12 },
  captionHeading: { color: C.accent, fontSize: 16, lineHeight: 22, fontWeight: '800' },
  captionText: { color: C.text, fontSize: 15, lineHeight: 20, fontWeight: '600' },
  bodyText: { color: C.text, fontWeight: '600' },
  readMore: { color: C.accent, fontSize: 14, lineHeight: 20, fontWeight: '700', marginTop: 4 },
  question: { color: C.text, fontWeight: '800', marginBottom: 14 },
  options: { flex: 1, minHeight: 0, gap: 8, overflow: 'hidden' },
  option: { borderRadius: 12, borderWidth: 1, borderColor: C.hairline, backgroundColor: C.panel, paddingHorizontal: 14, paddingVertical: 8 },
  optionText: { color: C.text, fontSize: 15, lineHeight: 20, fontWeight: '600' },
  more: { color: C.textDim, fontSize: 14, lineHeight: 20, fontWeight: '700' },
  photo: { width: CARD_WIDTH, backgroundColor: C.panel },
  photoEmpty: { alignItems: 'center', justifyContent: 'center' },
  price: { color: C.accent, fontSize: 28, lineHeight: 34, fontWeight: '800', marginBottom: 4 },
  title: { color: C.text, fontSize: 20, lineHeight: 26, fontWeight: '700' },
  labelRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 6 },
  lostFoundLabel: { fontWeight: '900', letterSpacing: 1 },
  infoBlock: { gap: 6, marginTop: 10 },
  infoLine: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  infoText: { flex: 1, color: C.textDim, fontSize: 15, lineHeight: 20 },
  footerWrap: { paddingHorizontal: PAD, paddingBottom: 18, paddingTop: 14 },
  footer: { borderTopWidth: 1, borderTopColor: C.hairline, paddingTop: 12 },
});
