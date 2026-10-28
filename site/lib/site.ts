import type { Metadata } from 'next';

export const SITE_URL = 'https://unm.klasmeyt.com';
export const APP_NAME = 'UNM Freedom Confessions';
export const SUPPORT_EMAIL = 'support@klasmeyt.com';

// Download links: null shows the button dimmed with "Coming soon". Set them and redeploy.
/** The app's Google Play listing (https://play.google.com/store/apps/details?id=...). */
export const PLAY_STORE_URL: string | null = null;
/** The GitHub releases page that holds the signed .apk files. */
export const APK_RELEASES_URL: string | null = 'https://github.com/djmirontos/unm-releases/releases/latest';

export const PAGES = [
  { path: '/', label: 'Home' },
  { path: '/privacy', label: 'Privacy' },
  { path: '/terms', label: 'Terms' },
  { path: '/rules', label: 'Community rules' },
  { path: '/delete-account', label: 'Delete your account' },
] as const;

export const supportMailto = `mailto:${SUPPORT_EMAIL}`;
export const deleteMailto = `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent('Delete my account')}&body=${encodeURIComponent('Nickname: ')}`;

// The seal (512 px, a copy of admin/app/icon.png). Set on every page: a page's openGraph
// replaces the layout's as a whole, so a shared image there would be lost.
const OG_IMAGE = { url: '/brand/seal.png', width: 512, height: 512, alt: 'UNM Freedom Confessions seal' };

/** Title, description, canonical URL and Open Graph for one page. */
export function pageMetadata(path: string, title: string | null, description: string): Metadata {
  return {
    ...(title ? { title } : {}),
    description,
    alternates: { canonical: path },
    openGraph: { type: 'website', siteName: APP_NAME, title: title ?? APP_NAME, description, url: path, locale: 'en', images: [OG_IMAGE] },
  };
}
