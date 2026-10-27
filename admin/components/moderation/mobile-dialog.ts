// Small-screen layouts for the shared shadcn DialogContent (below the md breakpoint only;
// desktop keeps the centred dialog). Pass one of these as DialogContent's className.

/** A bottom sheet: pinned to the bottom edge, full width, clear of the home indicator. */
export const SHEET_BELOW_MD =
  'max-md:top-auto max-md:bottom-0 max-md:left-0 max-md:max-w-none max-md:translate-x-0 max-md:translate-y-0 max-md:rounded-b-none max-md:pb-[max(1rem,env(safe-area-inset-bottom))]';

/**
 * Full screen with its own layout (header, a scrolling body, a footer that stays on screen).
 * The root layout's viewport uses interactiveWidget 'resizes-content', so on Android the
 * keyboard shrinks the dynamic viewport and the footer stays above it.
 */
export const FULLSCREEN_BELOW_MD =
  'max-md:inset-0 max-md:top-0 max-md:left-0 max-md:h-dvh max-md:max-h-none max-md:max-w-none max-md:translate-x-0 max-md:translate-y-0 max-md:rounded-none';

/** Footer buttons: 44 px tall on phones. */
export const TAP_BELOW_MD = 'max-md:min-h-11';
