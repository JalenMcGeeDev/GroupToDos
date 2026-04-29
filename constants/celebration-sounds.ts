import type { AudioSource } from 'expo-audio';

export type CelebrationSoundKey =
  | 'shine'
  | 'shine-long'
  | 'twinkle-sparkle'
  | 'hooray'
  | 'hooray-2'
  | 'group-cheer'
  | 'oh-yeah'
  | 'magic'
  | 'magic-sparkle';

export interface CelebrationSound {
  key: CelebrationSoundKey;
  label: string;
  source: AudioSource;
}

export const DEFAULT_SOUND_KEY: CelebrationSoundKey = 'shine';

export const CELEBRATION_SOUNDS: CelebrationSound[] = [
  { key: 'shine', label: 'Shine ✨', source: require('../assets/sounds/shine.mp3') },
  { key: 'shine-long', label: 'Shine (Long) ✨', source: require('../assets/sounds/shine-long.mp3') },
  { key: 'twinkle-sparkle', label: 'Twinkle Sparkle 🌟', source: require('../assets/sounds/twinkle-sparkle.mp3') },
  { key: 'magic-sparkle', label: 'Magic Sparkle 🪄', source: require('../assets/sounds/magic-sparkle.mp3') },
  { key: 'magic', label: 'Magic 🔮', source: require('../assets/sounds/magic.mp3') },
  { key: 'hooray', label: 'Hooray 🎉', source: require('../assets/sounds/hooray.mp3') },
  { key: 'hooray-2', label: 'Hooray 2 🥳', source: require('../assets/sounds/hooray-2.mp3') },
  { key: 'group-cheer', label: 'Group Cheer 👏', source: require('../assets/sounds/group-cheer.mp3') },
  { key: 'oh-yeah', label: 'Oh Yeah! 💪', source: require('../assets/sounds/oh-yeah.mp3') },
];

export function getSoundSource(key: CelebrationSoundKey): AudioSource {
  return CELEBRATION_SOUNDS.find((s) => s.key === key)?.source ?? CELEBRATION_SOUNDS[0].source;
}
