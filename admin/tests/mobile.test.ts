import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import * as mobile from '@/components/moderation/mobile-dialog';
import { buttonVariants } from '@/components/ui/button';

const src = (path: string) => readFileSync(fileURLToPath(new URL(`../${path}`, import.meta.url)), 'utf8');
const tokens = (classes: string) => classes.split(/\s+/).filter(Boolean);

// ------------------------------------------------------------ desktop stays as it was

describe('phone-only layout helpers', () => {
  // These only restyle phones; any token without a max-md: prefix would change md and up.
  const PHONE_ONLY = [
    'SHEET_BELOW_MD',
    'SHEET_HEADER',
    'SHEET_FOOTER',
    'FULLSCREEN_BELOW_MD',
    'TAP_BELOW_MD',
    'TAP_LINK_BELOW_MD',
    'ACTION_BAR_BELOW_MD',
    'ACTION_BAR_SPACE_ONE_ROW',
    'ACTION_BAR_SPACE_TWO_ROWS',
  ] as const;

  it.each(PHONE_ONLY)('%s only has max-md: classes', (name) => {
    for (const t of tokens(mobile[name])) expect(t.startsWith('max-md:'), `${name}: ${t}`).toBe(true);
  });
  it('the sheet form and body keep the desktop spacing (space-y-5, description 8 px under the title)', () => {
    expect(tokens(mobile.SHEET_FORM).filter((t) => !t.startsWith('max-md:'))).toEqual(['space-y-5']);
    expect(tokens(mobile.SHEET_BODY).filter((t) => !t.startsWith('max-md:'))).toEqual(['space-y-5', 'md:-mt-3']);
  });
  it('the action grid is the previous desktop row plus a phone-only rule', () => {
    expect(tokens(mobile.ACTION_GRID).filter((t) => !t.startsWith('max-md:'))).toEqual(['flex', 'flex-wrap', 'gap-2']);
  });
  it('the bottom sheet stays within 90dvh and clear of the home indicator', () => {
    expect(mobile.SHEET_BELOW_MD).toContain('max-md:max-h-[90dvh]');
    expect(mobile.SHEET_BODY).toContain('max-md:overflow-y-auto');
    expect(mobile.SHEET_FOOTER).toContain('env(safe-area-inset-bottom)');
    expect(mobile.ACTION_BAR_BELOW_MD).toContain('env(safe-area-inset-bottom)');
  });
});

// ------------------------------------------------------------ tap targets

describe('button tap targets on phones', () => {
  const TEXT_SIZES = ['default', 'xs', 'sm', 'lg'] as const;
  const ICON_SIZES = ['icon', 'icon-xs', 'icon-sm', 'icon-lg'] as const;

  it.each(TEXT_SIZES)('size %s is at least 44 px tall below md', (size) => {
    expect(tokens(buttonVariants({ size }))).toContain('max-md:min-h-11');
  });
  it.each(ICON_SIZES)('size %s is at least 44 x 44 px below md', (size) => {
    const t = tokens(buttonVariants({ size }));
    expect(t).toContain('max-md:min-h-11');
    expect(t).toContain('max-md:min-w-11');
  });
  it('the desktop heights are unchanged', () => {
    expect(tokens(buttonVariants({ size: 'default' }))).toContain('h-8');
    expect(tokens(buttonVariants({ size: 'lg' }))).toContain('h-9');
    expect(tokens(buttonVariants({ size: 'icon' }))).toContain('size-8');
  });
});

// ------------------------------------------------------------ one set of actions, shared dialogs

describe('detail page actions', () => {
  it('the review actions render one Approve button (bar on phones, inline from md)', () => {
    const s = src('components/review/review-actions.tsx');
    expect(s.match(/onClick=\{approve\}/g)).toHaveLength(2); // the button and "Retry approval"
    expect(s.match(/<Check aria-hidden="true" \/> Approve/g)).toHaveLength(1);
    expect(s).toContain('ACTION_BAR_BELOW_MD');
    expect(s).toContain('md:contents');
  });
  it('the shortcut hint is hidden on phones and touch screens', () => {
    expect(src('components/review/review-actions.tsx')).toMatch(/max-md:hidden pointer-coarse:hidden">\s*Shortcuts/);
  });
  it('the report actions are one set of buttons, pinned on phones only when there is one', () => {
    const s = src('components/reports/report-actions.tsx');
    expect(s.match(/setDialog\('remove'\)/g)).toHaveLength(1);
    expect(s).toContain('{anyAction ? (');
    expect(s).toContain('ACTION_BAR_BELOW_MD');
  });
  it('pages with a bar reserve room for it', () => {
    expect(src('app/(panel)/review/[type]/[id]/page.tsx')).toContain('ACTION_BAR_SPACE_ONE_ROW');
    // Profile report, missing content and content: each branch reserves room for the bar.
    expect(src('app/(panel)/reports/[type]/[id]/page.tsx').match(/ACTION_BAR_SPACE_TWO_ROWS\}/g)).toHaveLength(3);
  });
  it('every moderation dialog uses the shared sheet frame', () => {
    const s = src('components/moderation/dialogs.tsx');
    expect(s.match(/<DialogForm\b/g)).toHaveLength(3); // ReasonDialog, EditDialog, ConfirmDialog
    expect(s.match(/<DialogContent\b/g)).toHaveLength(1);
    expect(s).toContain('className={cn(SHEET_BELOW_MD, className)}');
  });
});
