import Link from 'next/link';

import { BrandMark } from '@/components/brand/brand-mark';

export function SiteHeader() {
  return (
    <header className="border-b border-line">
      <div className="h-1.5 bg-navy" aria-hidden="true">
        <div className="h-full w-24 bg-gold" />
      </div>
      <div className="mx-auto flex max-w-3xl items-center px-4 py-2">
        <Link href="/" className="inline-flex min-h-11 items-center">
          <BrandMark />
        </Link>
      </div>
    </header>
  );
}
