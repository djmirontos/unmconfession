'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef } from 'react';

/**
 * The list after a change on a report page (?updated=1): one refresh so the sidebar badge (in the
 * layout) and the list are current, then the flag leaves the address. The report page itself is
 * never refreshed: every render of it is an audit-logged open.
 */
export function RefreshOnce({ cleanHref }: { cleanHref: string }) {
  const router = useRouter();
  const done = useRef(false);
  useEffect(() => {
    if (done.current) return;
    done.current = true;
    router.refresh();
    window.history.replaceState(null, '', cleanHref);
  }, [router, cleanHref]);
  return null;
}
