import type { MetadataRoute } from 'next';

// The panel must never be indexed.
export default function robots(): MetadataRoute.Robots {
  return { rules: { userAgent: '*', disallow: '/' } };
}
