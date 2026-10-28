import Link from 'next/link';

import { APP_NAME, supportMailto } from '@/lib/site';

const LINKS = [
  { href: '/privacy', label: 'Privacy' },
  { href: '/terms', label: 'Terms' },
  { href: '/rules', label: 'Community rules' },
  { href: '/child-safety', label: 'Child safety' },
  { href: '/delete-account', label: 'Delete your account' },
] as const;

const LINK = 'inline-flex min-h-11 items-center px-1 text-navy underline underline-offset-4 hover:no-underline';

export function SiteFooter() {
  return (
    <footer className="mt-16 border-t border-line bg-paper">
      <div className="mx-auto max-w-3xl px-4 py-6">
        <nav aria-label="Footer">
          <ul className="flex flex-wrap gap-x-4">
            {LINKS.map((link) => (
              <li key={link.href}>
                <Link href={link.href} className={LINK}>
                  {link.label}
                </Link>
              </li>
            ))}
            <li>
              <a href={supportMailto} className={LINK}>
                Contact
              </a>
            </li>
          </ul>
        </nav>
        <p className="mt-4 text-sm text-muted">© 2026 {APP_NAME}</p>
      </div>
    </footer>
  );
}
