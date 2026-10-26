'use client';

import './globals.css';

// Replaces the root layout when it fails, so it renders its own document.
export default function GlobalError({ retry }: { error: unknown; retry: () => void }) {
  return (
    <html lang="en">
      <body className="min-h-svh bg-background font-sans text-foreground">
        <title>Something went wrong</title>
        <main className="mx-auto max-w-xl space-y-4 px-4 py-16">
          <h1 className="text-2xl font-semibold">Something went wrong</h1>
          <p className="text-muted-foreground">The panel could not be loaded. Try again in a moment.</p>
          <button
            type="button"
            onClick={() => retry()}
            className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
          >
            Try again
          </button>
        </main>
      </body>
    </html>
  );
}
