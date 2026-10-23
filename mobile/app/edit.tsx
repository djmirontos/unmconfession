import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { GuestPrompt } from '@/components/auth/GuestPrompt';
import { EditListingForm } from '@/components/edit/EditListingForm';
import { EditPostForm } from '@/components/edit/EditPostForm';
import { EmptyState, ErrorState } from '@/components/feed/ListStates';
import { BackHeader } from '@/components/layout/BackHeader';
import { PostCardSkeleton } from '@/components/skeletons/PostCardSkeleton';
import { useMyItem } from '@/hooks/useMyItem';
import { useMembership } from '@/hooks/useProfile';
import { getErrorMessage } from '@/lib/errors';
import type { MyItem } from '@/lib/myPosts';
import { canEdit } from '@/lib/ownItems';

function EditForm({ item }: { item: MyItem }) {
  if (item.kind === 'confession' || item.kind === 'shoutout') return <EditPostForm item={item} kind={item.kind} />;
  if (item.kind === 'sell' || item.kind === 'lost_found') return <EditListingForm item={item} />;
  return <EmptyState icon="lock-closed-outline" title="Polls can't be edited" />;
}

/** /edit?source=post|listing&id=<uuid>: edit the author's own text fields within 24 hours. No drafts. */
export default function EditScreen() {
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ source?: string; id?: string }>();
  const source = params.source === 'post' || params.source === 'listing' ? params.source : null;
  const id = params.id ?? '';
  const { status } = useMembership();
  const query = useMyItem(source, id);
  // Judged once when the screen opens; if the window closes meanwhile, Save shows the server's error.
  const [openedAt] = useState(() => Date.now());

  let body;
  if (status === 'guest') {
    body = <GuestPrompt message="Sign in to edit your posts." />;
  } else if (!source || !id) {
    body = <EmptyState icon="alert-circle-outline" title="This item isn't available" />;
  } else if (query.data === undefined) {
    body = query.isError ? (
      <ErrorState message={getErrorMessage(query.error)} onRetry={() => void query.refetch()} />
    ) : (
      <PostCardSkeleton />
    );
  } else if (query.data === null) {
    body = <EmptyState icon="eye-off-outline" title="This item isn't available" message="It may have been deleted." />;
  } else if (!canEdit(query.data, openedAt)) {
    body = (
      <EmptyState
        icon="lock-closed-outline"
        title="This can't be edited anymore"
        message="Posts can be edited for 24 hours while published or waiting for review. You can still delete it."
      />
    );
  } else {
    body = <EditForm item={query.data} />;
  }

  return (
    <View className="flex-1 bg-bg" style={{ paddingTop: insets.top }}>
      <BackHeader title="Edit" />
      <KeyboardAvoidingView className="flex-1" behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerClassName="gap-5 p-4"
          contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
        >
          {body}
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}
