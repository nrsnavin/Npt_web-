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
