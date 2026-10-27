import { LegalPage } from '@/components/legal-page';
import { LEGAL } from '@/content/legal';
import { pageMetadata } from '@/lib/site';

export const metadata = pageMetadata(
  '/privacy',
  LEGAL.privacy.title,
  'What UNM Freedom Confessions collects, who can see it, how long it is kept and how to delete your account.',
);

export default function PrivacyPage() {
  return <LegalPage doc="privacy" />;
}
