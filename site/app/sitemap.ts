import type { MetadataRoute } from 'next';

import { PAGES, SITE_URL } from '@/lib/site';

export default function sitemap(): MetadataRoute.Sitemap {
  return PAGES.map((page) => ({ url: `${SITE_URL}${page.path === '/' ? '' : page.path}`, lastModified: '2026-10-31' }));
}
