// Who may open which route. The sidebar and the proxy read this table; every page still
// calls requireStaff() or requireAdmin() itself (tests check that the two agree).

export type Access = 'public' | 'signed-in' | 'staff' | 'admin';

export type NavIcon = 'dashboard' | 'review' | 'reports' | 'content' | 'users' | 'keywords' | 'announcements' | 'log' | 'audit';

export type NavItem = { href: string; label: string; icon: NavIcon; access: 'staff' | 'admin' };

export const NAV_ITEMS: readonly NavItem[] = [
  { href: '/', label: 'Dashboard', icon: 'dashboard', access: 'staff' },
  { href: '/review', label: 'Review queue', icon: 'review', access: 'staff' },
  { href: '/reports', label: 'Reports', icon: 'reports', access: 'staff' },
  { href: '/content', label: 'Content', icon: 'content', access: 'staff' },
  { href: '/users', label: 'Users', icon: 'users', access: 'staff' },
  { href: '/keywords', label: 'Keywords', icon: 'keywords', access: 'staff' },
  { href: '/announcements', label: 'Announcements', icon: 'announcements', access: 'staff' },
  { href: '/log', label: 'Moderation log', icon: 'log', access: 'staff' },
  { href: '/audit', label: 'Audit log', icon: 'audit', access: 'admin' },
];

// Sign-in steps that need a password session but not yet the authenticator code.
const SIGNED_IN_PATHS = ['/login/verify', '/security/enroll'];
const PUBLIC_PATHS = ['/login', '/403', '/auth/expired', '/robots.txt'];

function matches(pathname: string, route: string): boolean {
  return route === '/' ? pathname === '/' : pathname === route || pathname.startsWith(`${route}/`);
}

export function accessFor(pathname: string): Access {
  if (SIGNED_IN_PATHS.some((p) => matches(pathname, p))) return 'signed-in';
  if (PUBLIC_PATHS.some((p) => matches(pathname, p))) return 'public';
  const item = NAV_ITEMS.filter((n) => n.href !== '/').find((n) => matches(pathname, n.href));
  return item?.access ?? 'staff';
}

export function navFor(isAdmin: boolean): NavItem[] {
  return NAV_ITEMS.filter((item) => item.access === 'staff' || isAdmin);
}

export function isActive(pathname: string, href: string): boolean {
  return matches(pathname, href);
}
