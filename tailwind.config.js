/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: [
    './index.html',
    './index.tsx',
    './App.tsx',
    './components/**/*.{ts,tsx}',
    './services/**/*.{ts,tsx}',
    './store/**/*.{ts,tsx}',
    './utils/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Lato', 'sans-serif'],
        display: ['Cinzel', 'serif'],
        ui: ['Google Sans', 'sans-serif'],
      },
      colors: {
        primary: 'rgb(var(--color-primary) / <alpha-value>)',
        onPrimary: 'rgb(var(--color-on-primary) / <alpha-value>)',
        primaryContainer: 'rgb(var(--color-primary-container) / <alpha-value>)',
        onPrimaryContainer: 'rgb(var(--color-on-primary-container) / <alpha-value>)',

        secondary: 'rgb(var(--color-secondary) / <alpha-value>)',
        onSecondary: 'rgb(var(--color-on-secondary) / <alpha-value>)',
        secondaryContainer: 'rgb(var(--color-secondary-container) / <alpha-value>)',
        onSecondaryContainer: 'rgb(var(--color-on-secondary-container) / <alpha-value>)',

        tertiary: 'rgb(var(--color-tertiary) / <alpha-value>)',
        tertiaryContainer: 'rgb(var(--color-tertiary-container) / <alpha-value>)',
        onTertiaryContainer: 'rgb(var(--color-on-tertiary-container) / <alpha-value>)',

        background: 'rgb(var(--color-background) / <alpha-value>)',
        onBackground: 'rgb(var(--color-on-background) / <alpha-value>)',

        surface: 'rgb(var(--color-surface) / <alpha-value>)',
        onSurface: 'rgb(var(--color-on-surface) / <alpha-value>)',

        surfaceVariant: 'rgb(var(--color-surface-variant) / <alpha-value>)',
        onSurfaceVariant: 'rgb(var(--color-on-surface-variant) / <alpha-value>)',

        outline: 'rgb(var(--color-outline) / <alpha-value>)',
        error: 'rgb(var(--color-error) / <alpha-value>)',
      },
      borderRadius: {
        md3: '1.25rem',
        pill: '9999px',
        fab: '1rem',
        sm3: '0.75rem',
      },
      animation: {
        'fade-in': 'fadeIn 0.5s ease-out',
        'scale-in': 'scaleIn 0.3s ease-out',
        'slide-up': 'slideUp 0.4s ease-out',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        scaleIn: {
          '0%': { opacity: '0', transform: 'scale(0.95)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        },
        slideUp: {
          '0%': { opacity: '0', transform: 'translateY(20px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
      },
    },
  },
  plugins: [],
};
