'use client';

import { SlidersHorizontal } from 'lucide-react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { type ReactNode, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { withoutParams } from '@/lib/url-params';

/**
 * URL filters: inline from md; on phones in a bottom sheet behind a "Filters" button with a
 * count badge, "Clear" (removes `names`, keeps anything else such as a search) and "Done".
 * Place it inside a flex-wrap row; `children` are the filter controls.
 */
export function FilterSheet({ activeCount, names, children }: { activeCount: number; names: readonly string[]; children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [open, setOpen] = useState(false);

  const clear = () => {
    const query = withoutParams(params.toString(), names);
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  };

  return (
    <>
      <div className="hidden md:contents">{children}</div>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger asChild>
          <Button variant="outline" className="min-h-11 md:hidden" aria-label={activeCount ? `Filters, ${activeCount} active` : 'Filters'}>
            <SlidersHorizontal aria-hidden="true" /> Filters
            {activeCount ? (
              <span className="ml-1 rounded-full bg-primary px-1.5 text-xs font-semibold text-primary-foreground" aria-hidden="true">
                {activeCount}
              </span>
            ) : null}
          </Button>
        </SheetTrigger>
        <SheetContent side="bottom" className="max-h-[85dvh] gap-0 overflow-y-auto rounded-t-xl pb-[max(1rem,env(safe-area-inset-bottom))]">
          <SheetHeader>
            <SheetTitle>Filters</SheetTitle>
            <SheetDescription>Changes apply right away.</SheetDescription>
          </SheetHeader>
          <div className="space-y-4 px-4">{children}</div>
          <div className="flex gap-2 px-4 pt-6">
            <Button variant="outline" className="min-h-11 flex-1" onClick={clear} disabled={!activeCount}>
              Clear
            </Button>
            <Button className="min-h-11 flex-1" onClick={() => setOpen(false)}>
              Done
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
