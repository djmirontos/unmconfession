import { LegalPage } from '@/components/legal-page';
import { LEGAL } from '@/content/legal';
import { pageMetadata } from '@/lib/site';

export const metadata = pageMetadata(
  '/rules',
  LEGAL.rules.title,
  'What is and is not allowed on UNM Freedom Confessions, and what moderators do about it.',
);

export default function RulesPage() {
  return <LegalPage doc="rules" />;
}
