import { create } from 'zustand';

export type VaultStatus = 'no-vault' | 'locked' | 'unlocked';

type SessionState = {
  status: VaultStatus;
  setStatus: (status: VaultStatus) => void;
};

// Hardcoded for now; real vault state comes in a later step.
export const useSessionStore = create<SessionState>((set) => ({
  status: 'no-vault',
  setStatus: (status) => set({ status }),
}));
