import { create } from 'zustand';

import type { LatestAppInfo } from '@/lib/softUpdate';

type SoftUpdateState = {
  /** "Later" was tapped: hidden until the app process restarts. In memory only, never persisted. */
  laterTapped: boolean;
  setLater: () => void;
  /** The last good get_latest_app_info answer (useSoftUpdate); the hard gate reads its Play link. */
  info: LatestAppInfo | null;
  setInfo: (info: LatestAppInfo) => void;
};

export const useSoftUpdateStore = create<SoftUpdateState>((set) => ({
  laterTapped: false,
  setLater: () => set({ laterTapped: true }),
  info: null,
  setInfo: (info) => set({ info }),
}));
