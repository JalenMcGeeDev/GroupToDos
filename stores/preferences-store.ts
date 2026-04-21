import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { CelebrationSoundKey } from '../constants/celebration-sounds';
import { DEFAULT_SOUND_KEY } from '../constants/celebration-sounds';

interface PreferencesState {
  celebrationSound: CelebrationSoundKey;
  setCelebrationSound: (key: CelebrationSoundKey) => void;
}

export const usePreferencesStore = create<PreferencesState>()(
  persist(
    (set) => ({
      celebrationSound: DEFAULT_SOUND_KEY,
      setCelebrationSound: (key) => set({ celebrationSound: key }),
    }),
    {
      name: 'user-preferences',
      storage: createJSONStorage(() => AsyncStorage),
    },
  ),
);
