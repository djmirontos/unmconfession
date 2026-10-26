import { cn } from '@/lib/utils';

/** Navy tile with a gold mark, plus the product name. */
export function BrandMark({ className, inverted = false }: { className?: string; inverted?: boolean }) {
  return (
    <div className={cn('flex items-center gap-3', className)}>
      <svg viewBox="0 0 32 32" aria-hidden="true" className="size-9 shrink-0">
        <rect width="32" height="32" rx="7" fill="#03224b" stroke={inverted ? 'rgb(255 255 255 / 0.25)' : 'none'} />
        <path d="M9 9v8a7 7 0 0 0 14 0V9" fill="none" stroke="#c39940" strokeWidth="3" strokeLinecap="round" />
      </svg>
      <div className="leading-tight">
        <p className={cn('text-sm font-semibold', inverted ? 'text-white' : 'text-foreground')}>UNM Freedom Confessions</p>
        <p className={cn('text-xs', inverted ? 'text-sidebar-foreground/80' : 'text-muted-foreground')}>
          Moderation panel
        </p>
      </div>
    </div>
  );
}
