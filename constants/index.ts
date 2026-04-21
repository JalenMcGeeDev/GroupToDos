export const COLORS = {
  primary: '#3B82F6',
  primaryLight: '#60A5FA',
  primaryDark: '#1D4ED8',
  accent: '#22C55E',
  success: '#22C55E',
  warning: '#F59E0B',
  danger: '#EF4444',
  white: '#FFFFFF',
  black: '#000000',
  background: '#FAFAFA',
  surface: '#FFFFFF',
  text: '#171717',
  textSecondary: '#525252',
  textTertiary: '#A3A3A3',
  border: '#E5E5E5',
  borderLight: '#F5F5F5',
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
