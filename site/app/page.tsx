import Link from 'next/link';

import { GetTheApp } from '@/components/get-the-app';
import { APP_NAME, pageMetadata } from '@/lib/site';

// From the PRD (Overview and App structure), with "members" for "UNM students"; no features beyond V1.
// Also the page's meta and Open Graph description.
const DESCRIPTION =
  'A mobile app where members post under a nickname, react, comment, run polls and trade items, with moderators keeping it safe.';

export const metadata = pageMetadata('/', null, DESCRIPTION);

const LINK = 'inline-flex min-h-11 items-center text-navy underline underline-offset-4 hover:no-underline';

export default function HomePage() {
  return (
    <div className="space-y-10">
      <section className="space-y-4">
        <h1 className="text-3xl font-bold text-navy sm:text-4xl">{APP_NAME}</h1>
        <p className="text-lg leading-8">{DESCRIPTION}</p>
      </section>

      <section className="space-y-3" aria-labelledby="what">
        <h2 id="what" className="text-xl font-semibold text-navy">
          What is in the app
        </h2>
        <ul className="list-disc space-y-2 pl-5 leading-7">
          <li>Anyone can read the feed without an account.</li>
          <li>Signed-in members post confessions, shoutouts and polls under a nickname, and react, comment and vote.</li>
          <li>Buy &amp; Sell and Lost &amp; Found listings.</li>
          <li>Trending shows the most reacted posts this week and active polls.</li>
          <li>Moderators review reports and held posts to keep the community safe.</li>
        </ul>
      </section>

      <section className="space-y-3 rounded-xl border border-l-4 border-line border-l-gold bg-paper p-5" aria-labelledby="get">
        <h2 id="get" className="text-xl font-semibold text-navy">
          Get the app
        </h2>
        <GetTheApp />
      </section>

      <section className="space-y-2" aria-labelledby="more">
        <h2 id="more" className="text-xl font-semibold text-navy">
          More
        </h2>
        <ul className="space-y-1">
          <li>
            <Link href="/rules" className={LINK}>
              Community rules
            </Link>
          </li>
          <li>
            <Link href="/terms" className={LINK}>
              Terms of Use
            </Link>
          </li>
          <li>
            <Link href="/privacy" className={LINK}>
              Privacy Policy
            </Link>
          </li>
          <li>
            <Link href="/delete-account" className={LINK}>
              Delete your account
            </Link>
          </li>
        </ul>
      </section>
    </div>
  );
}
