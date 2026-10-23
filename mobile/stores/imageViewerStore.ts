import { create } from 'zustand';

export type ViewerImage = { uri: string; blurhash: string | null };

type ImageViewerState = {
  images: readonly ViewerImage[];
  index: number;
  /** Bumped on every open, so the viewer starts fresh each time. */
  openId: number;
  open: (images: readonly ViewerImage[], index: number) => void;
  close: () => void;
};

// Global so any card can open the single <ImageViewer/> mounted at the root.
export const useImageViewerStore = create<ImageViewerState>((set) => ({
  images: [],
  index: 0,
  openId: 0,
  open: (images, index) => set((s) => ({ images, index, openId: s.openId + 1 })),
  close: () => set({ images: [], index: 0 }),
}));
