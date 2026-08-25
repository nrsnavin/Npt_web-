import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

const STORAGE_KEY = 'npt.theme';
const ThemeContext = createContext(null);

/** Reads the stored preference. 'system' means follow the operating system. */
const storedPreference = () => {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    return value === 'light' || value === 'dark' ? value : 'system';
  } catch {
    // Private browsing and blocked site data both throw here.
    return 'system';
  }
};

const systemTheme = () =>
  window.matchMedia?.('(prefers-color-scheme: light)').matches ? 'light' : 'dark';

export function ThemeProvider({ children }) {
  const [preference, setPreference] = useState(storedPreference);
  const [resolved, setResolved] = useState(() =>
    storedPreference() === 'system' ? systemTheme() : storedPreference()
  );

  useEffect(() => {
    const apply = () => {
      const next = preference === 'system' ? systemTheme() : preference;
      setResolved(next);

      // Leaving the attribute off lets the stylesheet's prefers-color-scheme rule decide,
      // which keeps the page correct even before this effect runs.
      if (preference === 'system') document.documentElement.removeAttribute('data-theme');
      else document.documentElement.setAttribute('data-theme', preference);
    };

    apply();

    if (preference !== 'system') return undefined;

    const media = window.matchMedia('(prefers-color-scheme: light)');
    media.addEventListener('change', apply);
    return () => media.removeEventListener('change', apply);
  }, [preference]);

  const choose = useCallback((next) => {
    setPreference(next);
    try {
      if (next === 'system') localStorage.removeItem(STORAGE_KEY);
      else localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // A preference we cannot persist still applies for this session.
    }
  }, []);

  const value = useMemo(
    () => ({
      /** What the user picked: 'light', 'dark' or 'system'. */
      preference,
      /** What is actually on screen: 'light' or 'dark'. */
      theme: resolved,
      isDark: resolved === 'dark',
      setTheme: choose,
      toggle: () => choose(resolved === 'dark' ? 'light' : 'dark'),
    }),
    [preference, resolved, choose]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (!context) throw new Error('useTheme must be used inside a ThemeProvider');
  return context;
};

/**
 * Colours for Recharts, which takes real values rather than classes.
 * Mirrors the CSS custom properties so charts re-theme with everything else.
 */
export function useChartTheme() {
  const { isDark } = useTheme();

  return useMemo(
    () => ({
      axis: { fontSize: 11, fill: isDark ? '#78858D' : '#697780', fontWeight: 600 },
      grid: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(15,30,41,0.08)',
      tooltip: {
        borderRadius: 10,
        border: `1px solid ${isDark ? 'rgba(255,255,255,0.1)' : 'rgba(15,30,41,0.1)'}`,
        background: isDark ? '#17262F' : '#FFFFFF',
        boxShadow: isDark
          ? '0 12px 32px rgba(0,0,0,0.5)'
          : '0 12px 28px rgba(15,30,41,0.12)',
        fontSize: 12,
        color: isDark ? '#E9F0F4' : '#17262F',
      },
      tooltipLabel: { color: isDark ? '#A3B3BD' : '#4A5A64', fontWeight: 700, marginBottom: 2 },
      cursor: { fill: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(15,30,41,0.04)' },
      /** Pipeline stages warm up as they approach a win, in both themes. */
      stages: isDark
        ? {
            new: '#3C5C6B',
            contacted: '#2C94A5',
            qualified: '#36B5C9',
            quoted: '#F5B14A',
            won: '#22C07A',
            lost: '#F0455B',
          }
        : {
            new: '#8DA3AF',
            contacted: '#2C94A5',
            qualified: '#1B8598',
            quoted: '#E8991F',
            won: '#15A06A',
            lost: '#E23F55',
          },
    }),
    [isDark]
  );
}
