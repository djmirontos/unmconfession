export type ShortcutAction = 'approve' | 'reject' | 'edit' | 'next' | 'prev';

export type KeyContext = {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  /** Tag name of the event target (upper case, as in the DOM). */
  targetTag: string;
  targetEditable: boolean;
  dialogOpen: boolean;
};

const TYPING_TAGS = new Set(['INPUT', 'TEXTAREA', 'SELECT']);

/** Keyboard shortcuts on the review detail view; none while typing, in a dialog or with modifiers. */
export function resolveShortcut(e: KeyContext): ShortcutAction | null {
  if (e.ctrlKey || e.metaKey || e.altKey || e.dialogOpen || e.targetEditable) return null;
  if (TYPING_TAGS.has(e.targetTag)) return null;
  switch (e.key) {
    case 'a':
    case 'A':
      return 'approve';
    case 'r':
    case 'R':
      return 'reject';
    case 'e':
    case 'E':
      return 'edit';
    case 'ArrowRight':
      return 'next';
    case 'ArrowLeft':
      return 'prev';
    default:
      return null;
  }
}
