import 'server-only';

import { cache } from 'react';

/** One clock reading per request, so every "suspended until" check on a page agrees. */
export const requestNow = cache((): number => Date.now());
