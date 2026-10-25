import { useLocalSearchParams } from 'expo-router';
import { Text, View } from 'react-native';

import { AuthHeader } from '@/components/auth/AuthHeader';
import { Screen } from '@/components/ui/Screen';

// DRAFT placeholder copy. Replace with the final, school-approved documents.
const DOCS = {
  terms: {
    title: 'Terms of Use',
    sections: [
      'Anyone can read UNM Freedom Confessions without an account. To create an account you must be of legal age in the country where you live, or have the permission of a parent or legal guardian. By creating an account you confirm this. You are responsible for the account you register and for everything that is posted with it.',
      'Posts are shown under your nickname. You can change it once every 30 days; the new name shows on all your old posts and comments. Posts are pseudonymous, not anonymous.',
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
