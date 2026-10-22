import { useLocalSearchParams } from 'expo-router';
import { Text, View } from 'react-native';

import { AuthHeader } from '@/components/auth/AuthHeader';
import { Screen } from '@/components/ui/Screen';

// DRAFT placeholder copy. Replace with the final, school-approved documents.
const DOCS = {
  terms: {
    title: 'Terms of Use',
    sections: [
      'You must be a UNM student or staff member to create an account.',
      'Posts are shown under your permanent nickname. Posts are pseudonymous, not anonymous.',
      'Admins can see the email address behind any nickname to handle abuse. Every such lookup is recorded in an audit log.',
      'Do not post names, phone numbers or other details that identify people without their consent. Bullying, harassment and prohibited items are removed.',
      'Moderators may hold, edit, reject or remove content and may suspend or ban accounts.',
      'Buy & Sell is for listings only. The app does not handle payments; deal at your own risk.',
    ],
  },
  privacy: {
    title: 'Privacy Policy',
    sections: [
      'We collect your email address, nickname and the content you post. We do not collect your real name.',
      'Your email is never shown to other users. Only admins can view it, and each view is logged.',
      'Photo location data (EXIF) is removed before upload.',
      'Audit logs and rejected posts are kept for 30 days, then deleted.',
      'You can ask an admin to delete your account and content.',
    ],
  },
} as const;

export default function LegalScreen() {
  const { doc } = useLocalSearchParams<{ doc: string }>();
  const content = doc === 'privacy' ? DOCS.privacy : DOCS.terms;

  return (
    <Screen>
      <AuthHeader title={content.title} subtitle="Draft. Final wording pending school approval." />
      <View className="gap-3">
        {content.sections.map((text) => (
          <Text key={text} className="text-base leading-6 text-text">
            • {text}
          </Text>
        ))}
      </View>
    </Screen>
  );
}
