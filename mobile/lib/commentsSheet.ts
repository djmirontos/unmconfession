// The comments sheet (Feed comment button): snap heights, where a drag settles, and how far the
// keyboard lifts it. Pure, no imports (tests/commentsSheet.test.mjs).

export type Snap = 'half' | 'full';
export type SheetPlatform = 'ios' | 'android' | string;

/** Sheet height as a share of the window: opened at about 60%, dragged up to about 92%. */
export const SNAP_HALF = 0.6;
export const SNAP_FULL = 0.92;

/** A drag that ends this far below the half height closes the sheet (at least CLOSE_MIN_PX). */
export const CLOSE_RATIO = 0.25;
export const CLOSE_MIN_PX = 80;
/** A downward fling this fast (px/s) closes from the half height; any fling this fast picks the next snap. */
export const CLOSE_VELOCITY = 1200;
export const SNAP_VELOCITY = 800;

/**
 * Heights for each snap. With the keyboard up the full height shrinks so the sheet stays below the
 * status bar; the half height is never taller than the full one.
 */
export function snapHeights(windowHeight: number, topInset: number, keyboardLift = 0): Record<Snap, number> {
  const room = Math.max(0, windowHeight - topInset - keyboardLift);
  const full = Math.min(Math.round(windowHeight * SNAP_FULL), room);
  return { half: Math.min(Math.round(windowHeight * SNAP_HALF), full), full };
}

/**
 * How far the sheet moves up for the keyboard. iOS: the keyboard height. Android: 0, because the
 * app's window pans (softwareKeyboardLayoutMode "pan") so the focused composer is already above
 * the keyboard, as on the post screen; lifting it again would leave a gap the size of the keyboard.
 */
export function keyboardLift(platform: SheetPlatform, keyboardHeight: number): number {
  return platform === 'ios' ? Math.max(0, keyboardHeight) : 0;
}

/**
 * Where a drag of the handle settles. `visible` is the sheet's visible height when the finger
 * lifts, `velocityY` positive downward. With `canClose` false (keyboard up) it never closes.
 */
export function settleSheet(input: {
  visible: number;
  velocityY: number;
  half: number;
  full: number;
  canClose: boolean;
}): Snap | 'closed' {
  const { visible, velocityY, half, full, canClose } = input;
  const closeDistance = Math.max(CLOSE_MIN_PX, half * CLOSE_RATIO);
  if (velocityY <= -SNAP_VELOCITY) return 'full';
  if (visible <= half) {
    if (canClose && (velocityY >= CLOSE_VELOCITY || half - visible > closeDistance)) return 'closed';
    return 'half';
  }
  if (velocityY >= SNAP_VELOCITY) return 'half';
  return visible - half > (full - half) / 2 ? 'full' : 'half';
}
