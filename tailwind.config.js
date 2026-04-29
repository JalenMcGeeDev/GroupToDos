/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './app/**/*.{js,jsx,ts,tsx}',
    './components/**/*.{js,jsx,ts,tsx}',
  ],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        primary: {
          50: '#FBF1EB',
          100: '#F7E0D2',
          200: '#F0BFA3',
          300: '#E89B7E',
          400: '#E08366',
          500: '#D97757',
          600: '#C15F3C',
          700: '#9E4A2C',
          800: '#7A381F',
          900: '#582716',
          DEFAULT: '#D97757',
        },
        accent: {
          50: '#FBF1EB',
          100: '#F7E0D2',
          200: '#F0BFA3',
          300: '#E89B7E',
          400: '#E08366',
          500: '#D97757',
          600: '#C15F3C',
          700: '#9E4A2C',
          800: '#7A381F',
          900: '#582716',
        },
        success: {
          50: '#F0FDF4',
          500: '#22C55E',
          600: '#16A34A',
        },
        warning: {
          50: '#FFFBEB',
          500: '#F59E0B',
          600: '#D97706',
        },
        danger: {
          50: '#FEF2F2',
          500: '#EF4444',
          600: '#DC2626',
        },
        gray: {
          50: '#F7F5F2',
          100: '#F0EDE8',
          200: '#E2DDD6',
          300: '#CFC8BF',
          400: '#A39B92',
          500: '#7A716A',
          600: '#5C544C',
          700: '#403A34',
          800: '#2A2622',
          900: '#1F1B17',
        },
      },
      fontFamily: {
        sans: ['System'],
      },
      borderRadius: {
        '3xl': '24px',
      },
    },
  },
  plugins: [],
};
