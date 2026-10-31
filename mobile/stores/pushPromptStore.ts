import { create } from 'zustand';

type PushPromptState = {
  visible: boolean;
  show: () => void;
  hide: () => void;
};

// Global so the onboarding check and the publish reminder can open the single <PushExplainerSheet/>.
export const usePushPromptStore = create<PushPromptState>((set) => ({
  visible: false,
  show: () => set({ visible: true }),
  hide: () => set({ visible: false }),
}));
