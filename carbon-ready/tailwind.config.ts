import type { Config } from 'tailwindcss';

// RGB companions retain Tailwind opacity modifiers for existing page classes.
const token = (name: string) => `rgb(var(--${name}-rgb) / <alpha-value>)`;
const petrol = {
  50: token('petrol-50'), 100: token('petrol-100'),
  600: token('petrol-600'), 700: token('petrol-700'),
  800: token('petrol-800'), 900: token('petrol-900'), 950: token('petrol-950'),
};

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        petrol,
        rail: token('rail'),
        lime: { 300: token('lime-300'), 400: token('lime-400'), ink: token('lime-ink') },
        ground: token('ground'), surface: { DEFAULT: token('surface'), sunk: token('surface-sunk') },
        rule: { DEFAULT: token('rule'), strong: token('rule-strong') },
        'on-petrol': { DEFAULT: token('on-petrol'), 2: token('on-petrol-2') },
        state: { review: token('state-review'), revision: token('state-revision'), rejected: token('state-rejected') },
        ink: { DEFAULT: token('ink'), secondary: token('ink-2'), meta: token('ink-3') },
      },
      fontFamily: {
        sans: ['Inter', 'Anuphan', 'system-ui', '-apple-system', 'Segoe UI', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      fontSize: {
        xs: ['0.75rem', '1.5'], sm: ['0.875rem', '1.5'], base: ['1rem', '1.5'],
        lg: ['1.25rem', '1.4'], xl: ['1.5rem', '1.35'], '2xl': ['1.875rem', '1.3'],
        '3xl': ['1.875rem', '1.3'],
      },
      borderRadius: { sheet: '6px' },
      boxShadow: { xs: '0 1px 2px rgb(var(--ink-rgb) / 0.05)', card: 'none' },
      keyframes: {
        'fade-in': { '0%': { opacity: '0' }, '100%': { opacity: '1' } },
        'fade-in-up': { '0%': { opacity: '0', transform: 'translateY(8px)' }, '100%': { opacity: '1', transform: 'translateY(0)' } },
        'scale-in': { '0%': { opacity: '0', transform: 'scale(0.98)' }, '100%': { opacity: '1', transform: 'scale(1)' } },
        'slide-in-right': { '0%': { transform: 'translateX(100%)' }, '100%': { transform: 'translateX(0)' } },
      },
      animation: {
        'fade-in': 'fade-in 0.12s ease-out both',
        'fade-in-up': 'fade-in-up 0.25s cubic-bezier(0.22,1,0.36,1) both',
        'scale-in': 'scale-in 0.2s cubic-bezier(0.22,1,0.36,1) both',
        'slide-in-right': 'slide-in-right 0.25s cubic-bezier(0.22,1,0.36,1) both',
      },
    },
  },
  plugins: [],
} satisfies Config;
