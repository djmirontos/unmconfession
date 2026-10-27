import Image from 'next/image';
import type { ReactNode } from 'react';

import { GitHubMark } from '@/components/brand/github-mark';
import { APK_RELEASES_URL, PLAY_STORE_URL } from '@/lib/site';

// The official badge as provided by Google (viewBox 238.96 x 70.87): shown unmodified at its own ratio.
const BADGE_HEIGHT = 56;
const BADGE_WIDTH = Math.round((BADGE_HEIGHT * 238.96) / 70.87);

/** A download button: a new-tab link when there is a URL, otherwise dimmed, inert and captioned. */
function Download({ href, children }: { href: string | null; children: ReactNode }) {
  if (href) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" className="inline-flex rounded-lg">
        {children}
      </a>
    );
  }
  return (
    <div className="flex flex-col items-center gap-1">
      <div aria-disabled="true" className="opacity-60">
        {children}
      </div>
      <p className="text-sm text-muted">Coming soon</p>
    </div>
  );
}

export function GetTheApp() {
  return (
    <div className="space-y-4">
      {PLAY_STORE_URL ? null : <p className="leading-7">The app is coming soon to Google Play.</p>}
      <div className="flex flex-col items-start gap-4 sm:flex-row">
        <Download href={PLAY_STORE_URL}>
          {/* Clear space around the badge, as Google's guidelines ask. */}
          <span className="block p-1">
            <Image
              src="/badges/google-play-badge.svg"
              alt="Get it on Google Play"
              width={BADGE_WIDTH}
              height={BADGE_HEIGHT}
              unoptimized
              className="block h-14 w-auto"
            />
          </span>
        </Download>
        <Download href={APK_RELEASES_URL}>
          <span className="m-1 inline-flex min-h-14 items-center gap-3 rounded-lg bg-[#24292f] px-5 py-3 font-semibold text-white">
            <GitHubMark className="size-6 shrink-0" />
            Download APK on GitHub
          </span>
        </Download>
      </div>
      {APK_RELEASES_URL ? (
        <p className="text-sm leading-6 text-muted">
          Installing from GitHub: download the .apk on your phone and open it. When asked, allow your browser to install
          unknown apps. Updates from this route are manual: download the newest file from the releases page.
        </p>
      ) : null}
    </div>
  );
}
