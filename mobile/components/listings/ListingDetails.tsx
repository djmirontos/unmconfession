import { Ionicons } from '@expo/vector-icons';
import { memo } from 'react';
import { Text, View } from 'react-native';

import { LostFoundNotice } from '@/components/create/LostFoundNotice';
import { MarketNotice } from '@/components/create/MarketNotice';
import { AuthorLine } from '@/components/feed/AuthorLine';
import { CardTag } from '@/components/feed/CardTag';
import { ListingGallery } from '@/components/listings/ListingGallery';
import { Button } from '@/components/ui/Button';
import { useTheme } from '@/hooks/useTheme';
import { CONDITIONS } from '@/lib/createSchemas';
import { closeActionLabel, closedLabel, CONDITION_LABELS, eventVerb, formatPrice, type ListingCardData } from '@/lib/listings';
import { formatEventDate } from '@/lib/manilaDate';

function typeLabel(listing: ListingCardData): string {
  if (listing.kind === 'sell') return 'SELL';
  return listing.lostFoundType === 'found' ? 'FOUND' : listing.lostFoundType === 'lost' ? 'LOST' : 'LOST & FOUND';
}

function InfoRow({ icon, text }: { icon: 'location-outline' | 'calendar-outline'; text: string }) {
  const { colors } = useTheme();
  return (
    <View className="flex-row items-center gap-2">
      <Ionicons name={icon} size={16} color={colors.textDim} />
      <Text className="flex-1 text-sm text-text">{text}</Text>
    </View>
  );
}

type Props = {
  listing: ListingCardData;
  /** Owner only: the sold / found / claimed toggle. */
  onToggleClosed?: (listing: ListingCardData) => void;
};

/** Everything above a listing's comments: photos, price or Lost & Found details, seller, notices. */
function ListingDetailsImpl({ listing, onToggleClosed }: Props) {
  const condition = CONDITIONS.find((c) => c === listing.condition);
  const sell = listing.kind === 'sell';
  const closed = listing.isClosed;

  return (
    <View className="gap-4">
      <ListingGallery images={listing.images} kind={listing.kind} />

      <View className="gap-2">
        <View className="flex-row flex-wrap items-center gap-2">
          <CardTag label={typeLabel(listing)} />
          {closed ? (
            <Text className="rounded-full bg-accent px-2.5 py-1 text-xs font-bold text-on-accent">{closedLabel(listing)}</Text>
          ) : null}
          {sell && condition ? (
            <Text className="rounded-full border border-hairline px-2.5 py-0.5 text-xs font-bold text-text-dim">
              {CONDITION_LABELS[condition]}
            </Text>
          ) : null}
        </View>
        {sell && listing.price !== null ? (
          <Text
            className={`text-3xl font-bold ${closed ? 'text-text-dim line-through' : 'text-accent'}`}
            accessibilityLabel={closed ? `${formatPrice(listing.price)}, sold` : formatPrice(listing.price)}
          >
            {formatPrice(listing.price)}
          </Text>
        ) : null}
        <Text accessibilityRole="header" className="text-xl font-bold text-text">
          {listing.title}
        </Text>
        {!sell ? (
          <View className="gap-1.5">
            {listing.location ? <InfoRow icon="location-outline" text={listing.location} /> : null}
            {listing.eventDate ? (
              <InfoRow icon="calendar-outline" text={`${eventVerb(listing.lostFoundType)} ${formatEventDate(listing.eventDate)}`} />
            ) : null}
          </View>
        ) : null}
        {listing.description ? (
          <Text className="text-base leading-6 text-text" selectable>
            {listing.description}
          </Text>
        ) : null}
      </View>

      <View className="flex-row items-center">
        <AuthorLine nickname={listing.nickname} avatarKey={listing.avatarKey} time={listing.time} editedAt={listing.editedAt} />
      </View>

      {onToggleClosed ? (
        <Button
          label={closeActionLabel(listing)}
          variant={closed ? 'secondary' : 'primary'}
          icon={closed ? 'refresh' : 'checkmark-done-outline'}
          onPress={() => onToggleClosed(listing)}
        />
      ) : null}

      {/* The same notices as the Create forms. */}
      {sell ? <MarketNotice /> : <LostFoundNotice />}
      <Text className="text-sm text-text-dim">Questions? Ask in the comments below.</Text>
    </View>
  );
}

export const ListingDetails = memo(ListingDetailsImpl);
