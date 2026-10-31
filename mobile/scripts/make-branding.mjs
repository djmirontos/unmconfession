// Generates the app icon, adaptive icon, splash and favicon from public/unmlogo.png.
// Run from mobile/: npm run branding. The source logo is read only and stays untracked.
import { mkdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import sharp from 'sharp';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE = path.join(ROOT, 'public', 'unmlogo.png');
const OUT = path.join(ROOT, 'assets', 'branding');

// From the logo: the navy of the seal's ring and shield. Keep in sync with app.json.
const NAVY = '#03224B';
const SIZE = 1024;
const MAX_BYTES = 250 * 1024;
const TRANSPARENT = { r: 0, g: 0, b: 0, alpha: 0 };

// Palette PNG. Above 16 colours the PNG is 8-bit and a full-size seal is ~400 KB; the seal is
// flat navy, gold and white, so 16 colours without dithering (4-bit) look the same and fit.
const png = (image, colours) =>
  image.png({ palette: true, colours, dither: 0, effort: 10, compressionLevel: 9 });

/** The logo cut to its visible pixels and padded to a square, so it centres exactly. */
async function squareLogo() {
  const trimmed = await sharp(SOURCE).trim({ background: TRANSPARENT, threshold: 0 }).toBuffer();
  const { width, height } = await sharp(trimmed).metadata();
  const side = Math.max(width, height);
  return sharp(trimmed)
    .extend({
      top: Math.floor((side - height) / 2),
      bottom: Math.ceil((side - height) / 2),
      left: Math.floor((side - width) / 2),
      right: Math.ceil((side - width) / 2),
      background: TRANSPARENT,
    })
    .toBuffer();
}

/** The logo scaled to `logoSize` and centred on a SIZE x SIZE canvas. */
async function centred(logo, logoSize, background) {
  const scaled = await sharp(logo).resize(logoSize, logoSize).toBuffer();
  return sharp({ create: { width: SIZE, height: SIZE, channels: 4, background } }).composite([
    { input: scaled, gravity: 'centre' },
  ]);
}

/** Writes with 256 colours, or 16 if that is over the size limit. */
async function write(name, image) {
  const file = path.join(OUT, name);
  const source = await image.png().toBuffer();
  let colours = 256;
  await png(sharp(source), colours).toFile(file);
  if ((await stat(file)).size > MAX_BYTES) {
    colours = 16;
    await png(sharp(source), colours).toFile(file);
  }
  const { size } = await stat(file);
  if (size > MAX_BYTES) throw new Error(`${name} is ${size} bytes, over the ${MAX_BYTES} limit`);
  console.log(`${name.padEnd(32)} ${String(colours).padStart(3)} colours  ${(size / 1024).toFixed(0)} KB`);
}

await mkdir(OUT, { recursive: true });
const logo = await squareLogo();

// App icon (iOS and the legacy Android icon): opaque navy square, seal at 84% (8% padding a side).
await write('icon.png', (await centred(logo, Math.round(SIZE * 0.84), NAVY)).flatten({ background: NAVY }));

// Adaptive icon foreground: launchers crop to the central 66%, a circle of 676 px here.
// The seal is round, so 640 px keeps its whole edge inside that circle with a margin.
await write('adaptive-icon-foreground.png', await centred(logo, 640, TRANSPARENT));

// Splash: transparent, the seal fills the canvas; app.json sets the on-screen width.
await write('splash-icon.png', sharp(logo).resize(SIZE, SIZE));

await write('favicon.png', sharp(logo).resize(48, 48));

// Android notification icon: a speech bubble with a small tail, solid white on transparent,
// 96 px with 8 px of padding. Android draws only its alpha, tinted with the plugin colour (app.json).
const BUBBLE = `<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 96 96">
  <rect x="8" y="10" width="80" height="58" rx="18" fill="#FFFFFF"/>
  <path d="M26 62 L22 88 L46 66 Z" fill="#FFFFFF"/>
</svg>`;
await write('notification-icon.png', sharp(Buffer.from(BUBBLE)).resize(96, 96));
