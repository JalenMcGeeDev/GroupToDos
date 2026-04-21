import { create } from 'zustand';

interface CelebrationState {
  visible: boolean;
  show: () => void;
  hide: () => void;
}

export const useCelebrationStore = create<CelebrationState>((set) => ({
  visible: false,
  show: () => set({ visible: true }),
  hide: () => set({ visible: false }),
}));
