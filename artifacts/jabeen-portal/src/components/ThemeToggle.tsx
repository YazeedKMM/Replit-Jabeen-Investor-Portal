/* ============================================================================
   ThemeToggle.tsx
   Light/dark theme toggle for the JABEEN Investor Portal (DGA Platforms Code).

   What it does
   - Flips the `data-theme` attribute on <html> between "light" and "dark".
   - Persists the choice to localStorage so it survives reloads.
   - The DGA tokens and the JABEEN gold override react automatically.

   Setup (one time)
   1. Add the anti-flash script + base attributes to index.html (see
      CLAUDE_CODE_THEME_TOGGLE.md). That sets the theme before React mounts so
      there is no flash of the wrong theme on first paint.
   2. Render <ThemeToggle /> in your header/nav.
   3. Anywhere else that needs the value, call useTheme().

   It is styled with DGA tokens, so it matches both themes with no extra CSS.
   ============================================================================ */

import { useCallback, useEffect, useState } from 'react';

type Theme = 'light' | 'dark';
const STORAGE_KEY = 'jabeen-theme';
const DEFAULT_THEME: Theme = 'dark'; // JABEEN brand default

function readInitialTheme(): Theme {
  // Trust the attribute the index.html script already set, if present.
  if (typeof document !== 'undefined') {
    const attr = document.documentElement.getAttribute('data-theme');
    if (attr === 'light' || attr === 'dark') return attr;
  }
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === 'light' || saved === 'dark') return saved;
  } catch {
    /* localStorage blocked; fall through */
  }
  // To respect the OS preference instead of the brand default, use:
  // return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
  return DEFAULT_THEME;
}

function applyTheme(theme: Theme) {
  document.documentElement.setAttribute('data-theme', theme);
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    /* ignore persistence failure */
  }
}

export function useTheme() {
  const [theme, setTheme] = useState<Theme>(readInitialTheme);

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  const toggle = useCallback(
    () => setTheme((t) => (t === 'dark' ? 'light' : 'dark')),
    [],
  );

  return { theme, setTheme, toggle };
}

export function ThemeToggle() {
  const { theme, toggle } = useTheme();
  const isDark = theme === 'dark';

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={isDark ? 'تفعيل الوضع الفاتح' : 'تفعيل الوضع الداكن'}
      aria-pressed={isDark}
      title={isDark ? 'الوضع الفاتح' : 'الوضع الداكن'}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: 40,
        height: 40,
        borderRadius: 9999,
        cursor: 'pointer',
        background: 'var(--background-card)',
        color: 'var(--text-primary)',
        border: '1px solid var(--border-neutral-primary)',
        transition: 'background 0.15s ease, color 0.15s ease, border-color 0.15s ease',
      }}
    >
      {isDark ? <SunIcon /> : <MoonIcon />}
    </button>
  );
}

/* Inline icons use currentColor, so they inherit the button's themed color. */
function SunIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </svg>
  );
}
