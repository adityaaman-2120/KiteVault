import { create } from 'zustand';

type OfferState = {
  // True from the moment the master password is created until the person answers the offer.
  pending: boolean;
  request: () => void;
  clear: () => void;
};

// Carries "ask about biometric unlock" from the create-vault screen to the home screen, where the
// offer is shown. Nothing is stored on disk: if the app closes first, the offer is simply gone,
// and the ask after the next password unlock still covers it.
export const useBiometricOfferStore = create<OfferState>((set) => ({
  pending: false,
  request: () => set({ pending: true }),
  clear: () => set({ pending: false }),
}));
