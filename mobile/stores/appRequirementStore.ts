import { create } from 'zustand';

import type { AppRequirement } from '@/lib/versionGate';

type AppRequirementState = {
  /** The requirement being enforced; null = nothing known yet (never blocks). */
  requirement: AppRequirement | null;
  setRequirement: (requirement: AppRequirement | null) => void;
};

export const useAppRequirementStore = create<AppRequirementState>((set) => ({
  requirement: null,
  setRequirement: (requirement) => set({ requirement }),
}));
