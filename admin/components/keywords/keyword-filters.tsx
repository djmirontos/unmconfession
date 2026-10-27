'use client';

import { SlidersHorizontal } from 'lucide-react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';

import { SearchBox, SelectFilter } from '@/components/moderation/url-filters';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { clearSheetFilters } from '@/lib/keywords/query';
import { CATEGORIES, CATEGORY_LABELS, MATCH_LABELS, MATCH_TYPES, SCOPE_LABELS, SCOPES } from '@/lib/keywords/schemas';

function Selects() {
  return (
    <>
      <div className="md:w-40">
        <SelectFilter name="category" label="Category" options={CATEGORIES.map((c) => ({ value: c, label: CATEGORY_LABELS[c] }))} />
      </div>
      <div className="md:w-36">
        <SelectFilter name="scope" label="Applies to" options={SCOPES.map((s) => ({ value: s, label: SCOPE_LABELS[s] }))} />
      </div>
      <div className="md:w-44">
        <SelectFilter name="match" label="Match type" options={MATCH_TYPES.map((m) => ({ value: m, label: MATCH_LABELS[m] }))} />
      </div>
      <div className="md:w-32">
        <SelectFilter
          name="state"
          label="State"
          options={[
            { value: 'active', label: 'Active' },
            { value: 'inactive', label: 'Inactive' },
          ]}
        />
      </div>
    </>
  );
}

/**
 * The search box stays visible. From md up the four filters sit inline (as before); on phones they
 * move into a bottom sheet behind a "Filters" button with a count badge and "Clear".
 */
export function KeywordFilters({ activeCount }: { activeCount: number }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [open, setOpen] = useState(false);

  const clear = () => {
    const query = clearSheetFilters(params.toString());
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  };

  return (
    <div className="mb-6 flex flex-wrap items-end gap-3">
      <SearchBox label="Search terms" placeholder="Part of a term" className="max-md:min-w-0" />
      <div className="hidden md:contents">
        <Selects />
      </div>
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
          <div className="space-y-4 px-4">
            <Selects />
          </div>
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
    </div>
  );
}
