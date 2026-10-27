import { LegalPage } from '@/components/legal-page';
import { LEGAL } from '@/content/legal';
import { pageMetadata } from '@/lib/site';

export const metadata = pageMetadata('/terms', LEGAL.terms.title, 'The terms for reading, posting and trading on UNM Freedom Confessions.');

export default function TermsPage() {
  return <LegalPage doc="terms" />;
}
