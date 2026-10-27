// Small-screen layouts (below the md breakpoint only; md and up keep the desktop layout).

/**
 * A bottom sheet for the shared DialogContent: pinned to the bottom edge, at most 90dvh, full
 * width (important, so a dialog's own sm:max-w-* cannot narrow it between 640 and 767 px).
 * Use it with SHEET_FORM, SHEET_HEADER, SHEET_BODY and SHEET_FOOTER: the title and the buttons
 * stay on screen and only the body scrolls.
 */
export const SHEET_BELOW_MD =
  'max-md:top-auto max-md:bottom-0 max-md:left-0 max-md:flex max-md:max-h-[90dvh] max-md:max-w-none! max-md:translate-x-0 max-md:translate-y-0 max-md:flex-col max-md:gap-0 max-md:rounded-b-none max-md:p-0';
export const SHEET_FORM = 'space-y-5 max-md:flex max-md:min-h-0 max-md:flex-1 max-md:flex-col max-md:space-y-0';
/** Title only; the close button sits on the right. */
export const SHEET_HEADER = 'max-md:shrink-0 max-md:border-b max-md:px-4 max-md:pt-4 max-md:pr-14 max-md:pb-3';
/**
 * Description and fields. From md up the negative margin collapses with the form's spacing,
 * so the description sits 8 px under the title as it did inside the header.
 */
export const SHEET_BODY =
  'space-y-5 md:-mt-3 max-md:min-h-0 max-md:flex-1 max-md:overflow-y-auto max-md:overscroll-contain max-md:p-4';
/** Buttons stack full width below sm and sit side by side from sm; clear of the home indicator. */
export const SHEET_FOOTER = 'max-md:mx-0 max-md:mb-0 max-md:shrink-0 max-md:rounded-none max-md:pb-[max(1rem,env(safe-area-inset-bottom))]';

/**
 * Full screen with its own layout (header, a scrolling body, a footer that stays on screen).
 * The root layout's viewport uses interactiveWidget 'resizes-content', so on Android the
 * keyboard shrinks the dynamic viewport and the footer stays above it.
 */
export const FULLSCREEN_BELOW_MD =
  'max-md:inset-0 max-md:top-0 max-md:left-0 max-md:h-dvh max-md:max-h-none max-md:max-w-none! max-md:translate-x-0 max-md:translate-y-0 max-md:rounded-none';

/** 44 px tall on phones (controls that are not a Button). */
export const TAP_BELOW_MD = 'max-md:min-h-11';

/** A text link (banner, details) with a 44 px tall tap area on phones. */
export const TAP_LINK_BELOW_MD = 'max-md:inline-flex max-md:min-h-11 max-md:items-center';

/** A wrapping set of action buttons: on phones each grows to fill its row (two short labels per row, even inside a card at 360 px). */
export const ACTION_GRID = 'flex flex-wrap gap-2 max-md:*:flex-[1_1_8rem]';

/**
 * The primary actions of a detail page pinned to the bottom edge on phones (from md they stay
 * inline). The page adds an ACTION_BAR_SPACE_* padding so the bar never covers the end of the content.
 */
export const ACTION_BAR_BELOW_MD =
  'max-md:fixed max-md:inset-x-0 max-md:bottom-0 max-md:z-30 max-md:border-t max-md:bg-card/95 max-md:px-4 max-md:pt-3 max-md:pb-[max(0.75rem,env(safe-area-inset-bottom))] max-md:shadow-[0_-1px_3px_rgb(0_0_0/0.06)] max-md:backdrop-blur';
/** Bottom padding for a page with a one-row action bar (68 px plus the safe area, with room to spare). */
export const ACTION_BAR_SPACE_ONE_ROW = 'max-md:pb-[calc(5.5rem+env(safe-area-inset-bottom))]';
/** Bottom padding for a page whose action bar can wrap to two rows (120 px plus the safe area). */
export const ACTION_BAR_SPACE_TWO_ROWS = 'max-md:pb-[calc(8.5rem+env(safe-area-inset-bottom))]';
