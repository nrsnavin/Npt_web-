/**
 * Design tokens for the NPT console.
 *
 * Palette is lifted from the Navin Hangers brand — flame orange (#F76800) as the
 * single hot accent, deep navy (#17262F / #121C22) as the surface family, aqua
 * (#2C94A5) as the secondary — and applied dark-first: a near-black canvas with
 * content layered above it in discrete elevation steps, accent reserved for the
 * one action that matters on a screen.
 *
 * @type {import('tailwindcss').Config}
 */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        /** Brand accent. 500 is the brand value; 400 lifts on hover, 600 presses. */
        flame: {
          50: '#FFF1E6',
          100: '#FFDCC2',
          200: '#FFBE8A',
          300: '#FF9E52',
          400: '#FF8124',
          500: '#F76800',
          600: '#D95A00',
          700: '#B24A00',
          800: '#8A3A00',
          900: '#5E2800',
        },
        /** Secondary accent, used for informational states so they never read as "act now". */
        aqua: {
          300: '#5FD3E4',
          400: '#36B5C9',
          500: '#2C94A5',
          600: '#217886',
          700: '#0F3137',
        },
        /** Surface ramp. Lower numbers sit further back; each step is a real elevation change. */
        ink: {
          950: '#080D11',
          900: '#0C141A',
          850: '#121C22',
          800: '#17262F',
          750: '#1B2E39',
          700: '#233A47',
          600: '#2C4855',
          500: '#3C5C6B',
        },
        /** Neutral text and hairlines. */
        steel: {
          50: '#F7FAFB',
          100: '#E9F0F4',
          200: '#C9D6DE',
          300: '#A3B3BD',
          400: '#78858D',
          500: '#5C6970',
          600: '#4A5257',
        },
        success: { 400: '#3DDC97', 500: '#22C07A', 600: '#169D62' },
        warn: { 400: '#F5B14A', 500: '#E8991F', 600: '#C57C0C' },
        danger: { 400: '#FF6B7E', 500: '#F0455B', 600: '#D02C41' },
      },
      fontFamily: {
        sans: ['Manrope', 'system-ui', '-apple-system', 'Segoe UI', 'sans-serif'],
      },
      letterSpacing: {
        tighter: '-0.03em',
        tight: '-0.018em',
      },
      borderRadius: {
        lg: '0.625rem',
        xl: '0.875rem',
        '2xl': '1.125rem',
      },
      boxShadow: {
        /** Elevation on a dark canvas comes from depth of shadow, not from lighter fills. */
        raised: '0 1px 2px rgba(0,0,0,0.4), 0 2px 8px rgba(0,0,0,0.25)',
        float: '0 4px 12px rgba(0,0,0,0.45), 0 12px 32px rgba(0,0,0,0.35)',
        modal: '0 24px 64px rgba(0,0,0,0.65)',
        /** Reserved for the primary action, so the eye lands on it first. */
        glow: '0 0 0 1px rgba(247,104,0,0.35), 0 6px 20px rgba(247,104,0,0.28)',
      },
      keyframes: {
        'fade-up': {
          from: { opacity: '0', transform: 'translateY(6px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        'fade-in': {
          from: { opacity: '0' },
          to: { opacity: '1' },
        },
        'scale-in': {
          from: { opacity: '0', transform: 'translateY(8px) scale(0.985)' },
          to: { opacity: '1', transform: 'translateY(0) scale(1)' },
        },
        shimmer: {
          '100%': { transform: 'translateX(100%)' },
        },
      },
      animation: {
        'fade-up': 'fade-up 240ms cubic-bezier(0.2, 0, 0, 1) both',
        'fade-in': 'fade-in 180ms ease-out both',
        'scale-in': 'scale-in 200ms cubic-bezier(0.2, 0, 0, 1) both',
      },
    },
  },
  plugins: [],
};
