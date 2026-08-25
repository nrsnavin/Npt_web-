/**
 * Design tokens for the NPT console.
 *
 * Palette is lifted from the Navin Hangers brand — flame orange (#F76800) as the
 * single hot accent, deep navy (#17262F / #121C22) as the surface family, aqua
 * (#2C94A5) as the secondary.
 *
 * Every colour resolves to a CSS custom property defined in index.css, so the whole
 * system re-themes by swapping variables on the root element. The scale *numbers* name
 * a role, not a brightness: `ink-900` is always the page canvas and `steel-50` is always
 * the strongest text, whether that reads dark-on-light or light-on-dark.
 *
 * @type {import('tailwindcss').Config}
 */

/** Channels live in the variable so Tailwind can still apply its `/opacity` modifiers. */
const themed = (name) => `rgb(var(--${name}) / <alpha-value>)`;

const scale = (prefix, steps) =>
  Object.fromEntries(steps.map((step) => [step, themed(`${prefix}-${step}`)]));

export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  darkMode: ['class', '[data-theme="dark"]'],
  theme: {
    extend: {
      colors: {
        /** Brand accent. 500 is the brand value and is identical in both themes. */
        flame: scale('flame', [50, 100, 200, 300, 400, 500, 600, 700, 800, 900]),
        /** Secondary accent, for informational states that must not read as "act now". */
        aqua: scale('aqua', [300, 400, 500, 600, 700]),
        /** Surface ramp: 950 sunken, 900 canvas, 850 card, 800 raised, 750+ dividers. */
        ink: scale('ink', [950, 900, 850, 800, 750, 700, 600, 500]),
        /** Text ramp: 50 strongest through 600 faintest. */
        steel: scale('steel', [50, 100, 200, 300, 400, 500, 600]),
        success: scale('success', [400, 500, 600]),
        warn: scale('warn', [400, 500, 600]),
        danger: scale('danger', [400, 500, 600]),

        /**
         * Hairlines, dividers and hover washes. Always applied with an opacity modifier
         * (`border-line/[0.06]`): white in dark, near-black in light, so one class works
         * for both without inverting anything by hand.
         */
        line: themed('line'),
        /** Modal and drawer backdrop. Stays dark in both themes, as a scrim should. */
        scrim: themed('scrim'),
        /** Accent used as *text*, which needs more contrast on a light background. */
        accent: themed('accent'),
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
        /** Elevation reads as depth in dark and as lift in light; both come from the vars. */
        raised: 'var(--shadow-raised)',
        float: 'var(--shadow-float)',
        modal: 'var(--shadow-modal)',
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
