// JPEG markers (second byte after 0xFF).
const SOI = 0xd8;
const SOS = 0xda;
const EOI = 0xd9;
const APP1 = 0xe1; // EXIF (incl. GPS) and XMP
const APP13 = 0xed; // Photoshop / IPTC
const COM = 0xfe; // free-text comment

const STRIP = new Set([APP1, APP13, COM]);

/**
 * Returns a copy of the JPEG without EXIF/XMP (APP1), IPTC (APP13) and comment
 * segments. Image data after Start-of-Scan is copied untouched. Throws if the
 * bytes are not a JPEG, so a non-JPEG can never be uploaded unchecked.
 */
export function stripJpegMetadata(input: Uint8Array): { bytes: Uint8Array; removed: number } {
  if (input[0] !== 0xff || input[1] !== SOI) throw new Error('not_jpeg');

  const keep: Uint8Array[] = [input.subarray(0, 2)];
  let removed = 0;
  let i = 2;

  while (i + 4 <= input.length) {
    if (input[i] !== 0xff) throw new Error('not_jpeg');
    const marker = input[i + 1] ?? 0;
    if (marker === 0xff) {
      i += 1; // fill byte
      continue;
    }
    if (marker === SOS || marker === EOI) break;
    const length = ((input[i + 2] ?? 0) << 8) | (input[i + 3] ?? 0);
    const end = i + 2 + length;
    if (length < 2 || end > input.length) throw new Error('not_jpeg');
    if (STRIP.has(marker)) removed += 1;
    else keep.push(input.subarray(i, end));
    i = end;
  }
  keep.push(input.subarray(i));

  const total = keep.reduce((n, part) => n + part.length, 0);
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const part of keep) {
    bytes.set(part, offset);
    offset += part.length;
  }
  return { bytes, removed };
}

