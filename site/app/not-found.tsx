import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = { title: 'Page not found', robots: { index: false } };

export default function NotFound() {
  return (
    <div className="space-y-4">
      <h1 className="text-3xl font-bold text-navy">Page not found</h1>
      <p className="leading-7">This page does not exist.</p>
      <Link href="/" className="inline-flex min-h-11 items-center text-navy underline underline-offset-4 hover:no-underline">
        Go to the home page
      </Link>
    </div>
  );
}
