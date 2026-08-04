import type { Config } from 'tailwindcss';

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50:  '#ecfdf5',
          100: '#d1fae5',
          200: '#a7f3d0',
          300: '#6ee7b7',
          400: '#34d399',
          500: '#10b981',
          600: '#059669',
          700: '#047857',
          800: '#065f46',
          900: '#064e3b',
        },
        ink: {
          50:  '#f8fafc',
          100: '#f1f5f9',
          200: '#e2e8f0',
          300: '#cbd5e1',
          400: '#94a3b8',
          500: '#64748b',
          600: '#475569',
          700: '#334155',
          800: '#1e293b',
          900: '#0f172a',
          950: '#020617',
        },
        accent: {
          50:  '#f0fdfa',
          100: '#ccfbf1',
          400: '#2dd4bf',
          500: '#14b8a6',
          600: '#0d9488',
          700: '#0f766e',
        },
        // GEM Carbon Credit brand teal (extracted from BRAND.ai)
        petrol: {
          400: '#16586a',
          500: '#11485a',
          600: '#0e3e4e', // brand teal
          700: '#0b3340',
          800: '#082833',
          900: '#061e26',
        },
        // GEM brand pastel lime (extracted from BRAND.ai)
        lime: {
          300: '#e2ffc4',
          400: '#d0ffa0', // brand lime
          500: '#b6f07e',
        },
      },
      fontFamily: {
        sans: ['Inter', 'Anuphan', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      borderRadius: {
        xl: '0.875rem',
        '2xl': '1.125rem',
      },
      boxShadow: {
        xs:    '0 1px 2px 0 rgba(15,23,42,0.04)',
        card:  '0 1px 2px 0 rgba(15,23,42,0.04), 0 1px 3px 0 rgba(15,23,42,0.05)',
        md:    '0 4px 12px -2px rgba(15,23,42,0.08), 0 2px 4px -2px rgba(15,23,42,0.05)',
        lg:    '0 12px 28px -6px rgba(15,23,42,0.12), 0 4px 10px -4px rgba(15,23,42,0.06)',
        xl:    '0 24px 48px -12px rgba(15,23,42,0.22)',
        glow:  '0 0 0 1px rgba(16,185,129,0.12), 0 8px 24px -8px rgba(16,185,129,0.35)',
      },
      backgroundImage: {
        'brand-gradient': 'linear-gradient(135deg, #10b981 0%, #059669 55%, #0d9488 100%)',
        'ink-gradient': 'linear-gradient(165deg, #0f172a 0%, #1e293b 100%)',
        'header-gradient': 'linear-gradient(90deg, #0e3e4e 0%, #0c3744 60%, #0b3340 100%)',
        'grid-faint':
          'linear-gradient(to right, rgba(15,23,42,0.035) 1px, transparent 1px), linear-gradient(to bottom, rgba(15,23,42,0.035) 1px, transparent 1px)',
      },
      keyframes: {
        'fade-in': {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        'fade-in-up': {
          '0%': { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'scale-in': {
          '0%': { opacity: '0', transform: 'scale(0.96)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        },
        'slide-in-right': {
          '0%': { transform: 'translateX(100%)' },
          '100%': { transform: 'translateX(0)' },
        },
        shimmer: {
          '100%': { transform: 'translateX(100%)' },
        },
      },
      animation: {
        'fade-in': 'fade-in 0.3s ease-out both',
        'fade-in-up': 'fade-in-up 0.45s cubic-bezier(0.22,1,0.36,1) both',
        'scale-in': 'scale-in 0.2s cubic-bezier(0.22,1,0.36,1) both',
        'slide-in-right': 'slide-in-right 0.32s cubic-bezier(0.22,1,0.36,1) both',
        shimmer: 'shimmer 1.6s infinite',
      },
    },
  },
  plugins: [],
} satisfies Config;
