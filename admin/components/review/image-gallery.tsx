'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import type { ReviewImage } from '@/lib/review/content';

/**
 * Thumbnails with a click-to-zoom dialog. Plain <img> from the public post-images bucket
 * (the CSP allows only the project's Supabase origin for images); width and height are set
 * from the stored size so nothing jumps while loading.
 */
export function ImageGallery({ images }: { images: ReviewImage[] }) {
  const [open, setOpen] = useState<number | null>(null);
  if (images.length === 0) return null;
  const current = open === null ? null : images[open];
  const step = (delta: number) => setOpen((i) => (i === null ? i : (i + delta + images.length) % images.length));

  return (
    <>
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3" aria-label="Images">
        {images.map((image, i) => (
          <li key={image.url}>
            <button
              type="button"
              onClick={() => setOpen(i)}
              className="block w-full overflow-hidden rounded-lg border bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              aria-label={`Open image ${i + 1} of ${images.length}`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={image.url}
                alt=""
                width={image.width}
                height={image.height}
                loading="lazy"
                decoding="async"
                referrerPolicy="no-referrer"
                className="aspect-square w-full object-cover"
              />
            </button>
          </li>
        ))}
      </ul>
      <Dialog open={current !== null} onOpenChange={(o) => !o && setOpen(null)}>
        <DialogContent
          className="max-h-[95svh] max-w-[95vw] gap-3 p-3 sm:max-w-4xl"
          onKeyDown={(e) => {
            if (e.key === 'ArrowRight') step(1);
            if (e.key === 'ArrowLeft') step(-1);
          }}
        >
          <DialogTitle className="sr-only">
            Image {open === null ? '' : open + 1} of {images.length}
          </DialogTitle>
          <DialogDescription className="sr-only">Use the arrow keys to move between images.</DialogDescription>
          {current ? (
            <div className="flex items-center justify-center">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={current.url}
                alt=""
                width={current.width}
                height={current.height}
                referrerPolicy="no-referrer"
                className="h-auto max-h-[80svh] w-auto max-w-full rounded-md object-contain"
                style={{ aspectRatio: `${current.width} / ${current.height}` }}
              />
            </div>
          ) : null}
          {images.length > 1 ? (
            <div className="flex items-center justify-between">
              <Button variant="outline" onClick={() => step(-1)} aria-label="Previous image">
                <ChevronLeft aria-hidden="true" /> Previous
              </Button>
              <span className="text-sm text-muted-foreground" aria-live="polite">
                {open === null ? '' : open + 1} / {images.length}
              </span>
              <Button variant="outline" onClick={() => step(1)} aria-label="Next image">
                Next <ChevronRight aria-hidden="true" />
              </Button>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}
