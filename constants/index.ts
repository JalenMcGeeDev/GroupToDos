export const COLORS = {
  primary: '#D97757',
  primaryLight: '#E89B7E',
  primaryDark: '#C15F3C',
  accent: '#D97757',
  success: '#22C55E',
  warning: '#F59E0B',
  danger: '#EF4444',
  white: '#FFFFFF',
  black: '#000000',
  background: '#F7F5F2',
  surface: '#FFFFFF',
  text: '#1F1B17',
  textSecondary: '#5C544C',
  textTertiary: '#A39B92',
  border: '#ECE7E1',
  borderLight: '#F4F0EB',
} as const;

/** Centralized type scale — use these for inline fontSize values */
export const FONT_SIZE = {
  xs: 12,
  sm: 14,
  base: 16,
  lg: 18,
  xl: 20,
  '2xl': 24,
  '3xl': 30,
} as const;

export const CADENCE_LABELS: Record<string, string> = {
  daily: 'Every day',
  every_2_days: 'Every 2 days',
  every_3_days: 'Every 3 days',
  weekly: 'Once a week',
};
