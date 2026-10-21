import { create } from 'zustand';

export type VaultStatus = 'no-vault' | 'locked' | 'unlocked';

type SessionState = {
  status: VaultStatus;
  setStatus: (status: VaultStatus) => void;
};

// Which screens are reachable. Set by the vault store (create / unlock / lock) and read at startup.
export const useSessionStore = create<SessionState>((set) => ({
  status: 'no-vault',
  setStatus: (status) => set({ status }),
}));
