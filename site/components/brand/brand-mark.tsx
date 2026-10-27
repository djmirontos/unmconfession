import Image from 'next/image';

import { APP_NAME } from '@/lib/site';

import unmMark from './unm-mark.png';

/** The UNM seal (the same artwork as the app and the panel) plus the app name. */
export function BrandMark() {
  return (
    <span className="flex items-center gap-3">
      <Image src={unmMark} alt="" aria-hidden="true" width={36} height={36} unoptimized loading="eager" className="size-9 shrink-0" />
      <span className="font-semibold text-navy">{APP_NAME}</span>
    </span>
  );
}
